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
from zoneinfo import ZoneInfo
import cv2
import numpy as np

from app.config import get_settings
from app.services.Crack_Measurement import measure_crack

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DetectionBox:
    class_name: str
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2]
    angle_deg: float | None = None
    distance_mm: float | None = None


@dataclass
class FrameMeta:
    frame_id: str
    camera_id: int
    captured_at: datetime
    alert_threshold: float

    # Camera calibration
    mm_per_pixel: float | None = None

    # Distance/angle assumptions
    focal_length_px: float = 1000.0
    known_crack_height_mm: float = 100.0


@dataclass
class SegmentationResult:
    class_name: str
    confidence: float
    polygon: list[list[float]]
    area_px: float
    measurement: dict | None = None


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
    Thread-safe for concurrent reads.
    """

    _instance: "YOLOService | None" = None

    def __init__(self) -> None:
        self._model = None
        self._model_path = Path(settings.MODEL_PATH)
        self._device = settings.INFERENCE_DEVICE

    @classmethod
    def get(cls) -> "YOLOService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def load(self) -> None:
        """Load model — called once at app startup."""
        from ultralytics import YOLO

        if not self._model_path.exists():
            raise FileNotFoundError(
                f"YOLO model not found at {self._model_path}. "
                "Set MODEL_PATH env var or place best.pt in the working directory."
            )

        logger.info(
            "Loading YOLO model from %s on device=%s",
            self._model_path,
            self._device,
        )

        self._model = YOLO(str(self._model_path))
        self._model.to(self._device)

        logger.info("YOLO model loaded successfully.")

    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Core inference ───────────────────────────────────────────────────────

    def infer(
        self,
        frame_bgr: np.ndarray,
        meta: FrameMeta,
    ) -> InferenceResult:
        """
        Run YOLO inference on a BGR numpy frame.
        Returns InferenceResult with annotations drawn on a copy of the frame.
        """
        if self._model is None:
            raise RuntimeError("YOLOService not loaded. Call load() first.")

        t0 = time.perf_counter()

        try:
            results = self._model.predict(
                source=frame_bgr,
                device=self._device,
                verbose=False,
                conf=0.25,
            )
        except Exception as exc:
            logger.exception(
                "YOLO prediction failed for frame %s",
                meta.frame_id,
            )

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

        # Image centre used for angle calculation
        image_center_x = frame_bgr.shape[1] / 2

        # ── Bounding boxes ──────────────────────────────────────────────────

        if result.boxes is not None:
            for box in result.boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                box_height_px = max(1.0, y2 - y1)
                box_center_x = (x1 + x2) / 2
                # Angle from image centre
                angle_deg = math.degrees(
                    math.atan(
                        (box_center_x - image_center_x)
                        / meta.focal_length_px
                    )
                )

                # Distance using known physical crack height
                distance_mm = (
                    meta.known_crack_height_mm
                    * meta.focal_length_px
                    / box_height_px
                )

                detections.append(
                    DetectionBox(
                        class_name=class_names.get(
                            cls_id,
                            str(cls_id),
                        ),
                        confidence=conf,
                        bbox=[x1, y1, x2, y2],
                        angle_deg=angle_deg,
                        distance_mm=distance_mm,
                    )
                )

        # ── Segmentation masks ──────────────────────────────────────────────

        if result.masks is not None:
            for i, mask in enumerate(result.masks):
                cls_id = (
                    int(result.boxes.cls[i].item())
                    if result.boxes is not None
                    else 0
                )

                conf = (
                    float(result.boxes.conf[i].item())
                    if result.boxes is not None
                    else 0.0
                )

                # Polygon in pixel coordinates
                polygon = (
                    mask.xy[0].tolist()
                    if len(mask.xy) > 0
                    else []
                )

                binary_mask = mask.data[0].cpu().numpy()

                area = float(np.sum(binary_mask))

                # ── Crack measurement ──────────────────────────────────────
                measurement_data = None

                try:
                    measurement = measure_crack(
                        binary_mask,
                        meta.mm_per_pixel,
                    )

                    measurement_data = {
                        "area_px": measurement.area_px,
                        "length_px": measurement.length_px,
                        "average_width_px": measurement.average_width_px,
                        "max_width_px": measurement.max_width_px,
                        "area_mm2": measurement.area_mm2,
                        "length_mm": measurement.length_mm,
                        "average_width_mm": measurement.average_width_mm,
                        "max_width_mm": measurement.max_width_mm,
                    }

                except Exception as exc:
                    logger.exception(
                        "Crack measurement failed for frame %s: %s",
                        meta.frame_id,
                        exc,
                    )

                segmentations.append(
                    SegmentationResult(
                        class_name=class_names.get(
                            cls_id,
                            str(cls_id),
                        ),
                        confidence=conf,
                        polygon=polygon,
                        area_px=area,
                        measurement=measurement_data,
                    )
                )

        # ── Threshold filter ────────────────────────────────────────────────

        filtered_detections = [
            d
            for d in detections
            if d.confidence >= meta.alert_threshold
        ]

        filtered_segments = [
            s
            for s in segmentations
            if s.confidence >= meta.alert_threshold
        ]

        max_confidence = max(
            (d.confidence for d in filtered_detections),
            default=0.0,
        )

        crack_detected = len(filtered_detections) > 0

        # ── Annotate image ──────────────────────────────────────────────────

        annotated_bytes: bytes | None = None

        if crack_detected:
            annotated_bytes = self._annotate(
                frame_bgr,
                filtered_detections,
                filtered_segments,
                meta,
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

    # ── Annotation ───────────────────────────────────────────────────────────

    def _annotate(
        self,
        frame_bgr: np.ndarray,
        detections: list[DetectionBox],
        segmentations: list[SegmentationResult],
        meta: FrameMeta,
    ) -> bytes:
        """Draw bounding boxes, segmentation overlays, and metadata."""
        img = frame_bgr.copy()
        overlay = img.copy()

        CRACK_BGR = (0, 0, 220)
        MASK_BGR = (0, 80, 255)
        ALPHA = 0.35

        # Draw segmentation masks first
        for seg in segmentations:
            pts = np.array(
                seg.polygon,
                dtype=np.int32,
            ).reshape((-1, 1, 2))

            if len(pts) >= 3:
                cv2.fillPoly(
                    overlay,
                    [pts],
                    MASK_BGR,
                )

        cv2.addWeighted(
            overlay,
            ALPHA,
            img,
            1 - ALPHA,
            0,
            img,
        )

        # Draw bounding boxes + labels
        for det in detections:
            x1, y1, x2, y2 = (
                int(v)
                for v in det.bbox
            )

            cv2.rectangle(
                img,
                (x1, y1),
                (x2, y2),
                CRACK_BGR,
                2,
            )

            label = (
                f"{det.class_name} "
                f"{det.confidence:.0%} | "
                f"Dist: {det.distance_mm:.1f}mm | "
                f"Ang: {det.angle_deg:.1f}deg"
            )

            (tw, th), _ = cv2.getTextSize(
                label,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                1,
            )

            cv2.rectangle(
                img,
                (x1, y1 - th - 8),
                (x1 + tw + 4, y1),
                CRACK_BGR,
                -1,
            )

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

        # Timestamp + camera overlay
        ts = meta.captured_at.astimezone(
            ZoneInfo("Asia/Kolkata")
        ).strftime("%Y-%m-%d %H:%M:%S IST")

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

        ok, buf = cv2.imencode(".png", img)

        if not ok:
            raise RuntimeError("cv2.imencode failed")

        return buf.tobytes()


# ── JSON serialisation helpers ────────────────────────────────────────────────

def detections_to_json(
    detections: list[DetectionBox],
) -> str:
    return json.dumps(
        [
            {
                "class_name": d.class_name,
                "confidence": d.confidence,
                "bbox": d.bbox,
                "angle_deg": d.angle_deg,
                "distance_mm": d.distance_mm,
            }
            for d in detections
        ]
    )


def segmentations_to_json(
    segmentations: list[SegmentationResult],
) -> str:
    return json.dumps(
        [
            {
                "class_name": s.class_name,
                "confidence": s.confidence,
                "polygon": s.polygon,
                "area_px": s.area_px,
                "measurement": s.measurement,
            }
            for s in segmentations
        ]
    )