"""
services/inference.py — YOLO inference service.

Loads best.pt once at process startup.
Runs both detection and segmentation on each frame.
Returns a structured InferenceResult with annotated image bytes.
"""

from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from app.config import get_settings
from app.services.Crack_Measurement import (
    CrackMeasurement,
    measure_crack,
)

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DetectionBox:
    class_name: str
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2]
    # ── NEW INFERENCE METRICS ──
    angle_deg: float = 0.0
    distance_mm: float = 0.0


@dataclass
class SegmentationResult:
    class_name: str
    confidence: float
    polygon: list[list[float]]  # [[x, y], ...]
    measurement: CrackMeasurement | None = None


@dataclass
class FrameMeta:
    frame_id: str
    camera_id: int
    captured_at: datetime
    alert_threshold: float
    mm_per_pixel: float | None = None  # ── NEW CAMERA HARDWARE SPECS ──
    focal_length_px: float = 1000.0
    known_crack_height_mm: float = 100.0


@dataclass
class InferenceResult:
    frame_meta: FrameMeta
    crack_detected: bool
    max_confidence: float
    num_detections: int
    detections: list[DetectionBox] = field(default_factory=list)
    segmentations: list[SegmentationResult] = field(default_factory=list)
    annotated_image_bytes: bytes | None = None
    inference_latency_ms: float = 0.0
    error: str | None = None


class YOLOService:
    """
    Singleton YOLO model wrapper.
    Thread-safe for concurrent reads (model.predict is GIL-released in C).
    """

    _instance: YOLOService | None = None

    def __init__(self) -> None:
        self._model = None
        self._model_path = Path(settings.MODEL_PATH)
        self._device = settings.INFERENCE_DEVICE

    @classmethod
    def get(cls) -> YOLOService:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def load(self) -> None:
        """Load model — called once at app startup."""
        from ultralytics import YOLO  # lazy import keeps startup fast if model absent

        if not self._model_path.exists():
            raise FileNotFoundError(
                f"YOLO model not found at {self._model_path}. "
                "Set MODEL_PATH env var or place best.pt in the working directory."
            )
        logger.info(
            "Loading YOLO model from %s on device=%s", self._model_path, self._device
        )
        self._model = YOLO(str(self._model_path))
        self._model.to(self._device)
        logger.info("YOLO model loaded successfully.")

    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Core inference ─────────────────────────────────────────────────────────


def infer(self, frame_bgr: np.ndarray, meta: FrameMeta) -> InferenceResult:
    if self._model is None:
        raise RuntimeError("YOLOService not loaded. Call load() first.")

    t0 = time.perf_counter()

    try:
        results = self._model.predict(
            source=frame_bgr,
            device=self._device,
            verbose=False,
            conf=0.25,
            retina_masks=True,
        )
    except Exception as exc:
        logger.exception("YOLO prediction failed for frame %s", meta.frame_id)
        return InferenceResult(
            frame_meta=meta,
            crack_detected=False,
            max_confidence=0.0,
            num_detections=0,
            error=str(exc),
        )

    latency_ms = (time.perf_counter() - t0) * 1000
    result = results[0]
    class_names: dict[int, str] = result.names

    detections: list[DetectionBox] = []
    segmentations: list[SegmentationResult] = []

    # ── Camera Geometry Setup ───────────────────────────────────────────
    img_center_x = frame_bgr.shape[1] / 2.0
    focal_length_px = getattr(meta, "focal_length_px", 1000.0)
    known_real_height_mm = getattr(meta, "known_crack_height_mm", 100.0)

    # ── Bounding boxes & Camera Math ────────────────────────────────────
    if result.boxes is not None:
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            # Angle and Distance Estimation calculations
            box_center_x = (x1 + x2) / 2.0
            box_height_px = y2 - y1

            # Angle: arctan(pixel_offset / focal_length)
            pixel_offset = box_center_x - img_center_x
            angle_rad = math.atan(pixel_offset / focal_length_px)
            angle_deg = math.degrees(angle_rad)

            # Distance: (real_height * focal_length) / pixel_height
            distance_mm = (
                (known_real_height_mm * focal_length_px) / box_height_px
                if box_height_px > 0
                else 0.0
            )

            detections.append(
                DetectionBox(
                    class_name=class_names.get(cls_id, str(cls_id)),
                    confidence=conf,
                    bbox=[x1, y1, x2, y2],
                    angle_deg=round(angle_deg, 2),
                    distance_mm=round(distance_mm, 2),
                )
            )

    # ── Segmentation masks ──────────────────────────────────────────────
    if result.masks is not None:
        for i, mask in enumerate(result.masks):
            cls_id = (
                int(result.boxes.cls[i].item())
                if result.boxes and i < len(result.boxes.cls)
                else 0
            )
            conf = (
                float(result.boxes.conf[i].item())
                if result.boxes and i < len(result.boxes.conf)
                else 0.0
            )
            polygon = mask.xy[0].tolist() if len(mask.xy) > 0 else []

            mask_arr = mask.data[0].cpu().numpy()
            binary_mask = np.where(mask_arr > 0.5, 255, 0).astype(np.uint8)

            measurement = None
            if conf >= meta.alert_threshold:
                try:
                    measurement = measure_crack(binary_mask, meta.mm_per_pixel)
                except Exception:
                    logger.exception(
                        "Crack measurement failed for frame %s", meta.frame_id
                    )

            segmentations.append(
                SegmentationResult(
                    class_name=class_names.get(cls_id, str(cls_id)),
                    confidence=conf,
                    polygon=polygon,
                    measurement=measurement,
                )
            )

    # ── Threshold filter ────────────────────────────────────────────────
    filtered_detections = [
        d for d in detections if d.confidence >= meta.alert_threshold
    ]
    filtered_segments = [
        s for s in segmentations if s.confidence >= meta.alert_threshold
    ]

    max_confidence = max((d.confidence for d in filtered_detections), default=0.0)
    crack_detected = len(filtered_detections) > 0 or len(filtered_segments) > 0

    annotated_bytes: bytes | None = None
    if crack_detected:
        annotated_bytes = self._annotate(
            frame_bgr, filtered_detections, filtered_segments, meta
        )

    return InferenceResult(
        frame_meta=meta,
        crack_detected=crack_detected,
        max_confidence=max_confidence,
        num_detections=len(filtered_detections),
        detections=filtered_detections,
        segmentations=filtered_segments,
        annotated_image_bytes=annotated_bytes,
        inference_latency_ms=round(latency_ms, 2),
    )


# ── Annotation ─────────────────────────────────────────────────────────────


def _annotate(
    self,
    frame_bgr: np.ndarray,
    detections: list[DetectionBox],
    segmentations: list[SegmentationResult],
    meta: FrameMeta,
) -> bytes:
    """Draw bounding boxes, segmentation overlays, measurements and metadata."""
    img = frame_bgr.copy()
    overlay = img.copy()

    CRACK_BGR = (0, 0, 220)
    MASK_BGR = (0, 80, 255)
    TEXT_BGR = (255, 255, 255)
    ALPHA = 0.35

    # ---------------------------------------------------------
    # Draw segmentation masks first
    # ---------------------------------------------------------
    for seg in segmentations:
        if len(seg.polygon) >= 3:
            pts = np.array(seg.polygon, dtype=np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(overlay, [pts], MASK_BGR)

    cv2.addWeighted(
        overlay,
        ALPHA,
        img,
        1 - ALPHA,
        0,
        img,
    )

    # ---------------------------------------------------------
    # Draw bounding boxes + measurements
    # ---------------------------------------------------------
    for det in detections:
        x1, y1, x2, y2 = (int(v) for v in det.bbox)

        cv2.rectangle(
            img,
            (x1, y1),
            (x2, y2),
            CRACK_BGR,
            2,
        )

        label = f"{det.class_name} {det.confidence:.0%} | Dist: {det.distance_mm:.1f}mm | Ang: {det.angle_deg:.1f}deg"

        (tw, th), _ = cv2.getTextSize(
            label,
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            1,
        )

        # Label background
        cv2.rectangle(
            img,
            (x1, y1 - th - 8),
            (x1 + tw + 4, y1),
            CRACK_BGR,
            -1,
        )

        # Label text
        cv2.putText(
            img,
            label,
            (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    # ---------------------------------------------------------
    # Timestamp + camera information
    # ---------------------------------------------------------
    ts = meta.captured_at.strftime("%Y-%m-%d %H:%M:%S UTC")

    cam_text = f"CAM {meta.camera_id} | {ts}"

    cv2.putText(
        img,
        cam_text,
        (10, img.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (200, 200, 200),
        1,
        cv2.LINE_AA,
    )

    # ---------------------------------------------------------
    # Encode image
    # ---------------------------------------------------------
    ok, buf = cv2.imencode(".png", img)

    if not ok:
        raise RuntimeError("cv2.imencode failed")

    return buf.tobytes()


# ── JSON serialisation helpers ─────────────────────────────────────────────────


def detections_to_json(detections: list[DetectionBox]) -> str:
    return json.dumps(
        [
            {"class_name": d.class_name, "confidence": d.confidence, "bbox": d.bbox}
            for d in detections
        ]
    )


def segmentations_to_json(segmentations: list[SegmentationResult]) -> str:
    return json.dumps(
        [
            {
                "class_name": s.class_name,
                "confidence": s.confidence,
                "polygon": s.polygon,
                "measurement": (
                    {
                        "area_px": s.measurement.area_px,
                        "length_px": s.measurement.length_px,
                        "average_width_px": s.measurement.average_width_px,
                        "max_width_px": s.measurement.max_width_px,
                        "area_mm2": s.measurement.area_mm2,
                        "length_mm": s.measurement.length_mm,
                        "average_width_mm": s.measurement.average_width_mm,
                        "max_width_mm": s.measurement.max_width_mm,
                    }
                    if s.measurement is not None
                    else None
                ),
            }
            for s in segmentations
        ]
    )
