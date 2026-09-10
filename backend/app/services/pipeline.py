"""
services/pipeline.py — Processing pipeline.

Owns the asyncio.Queue between capture and inference workers.
Inference worker consumes frames, calls YOLOService, persists results,
and triggers notifications.
"""
from __future__ import annotations

import asyncio
import logging
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.services.inference import (
    FrameMeta,
    InferenceResult,
    YOLOService,
    detections_to_json,
    segmentations_to_json,
)
from app.services.storage import StorageService

logger = logging.getLogger(__name__)
settings = get_settings()


class ProcessingPipeline:
    """
    Central queue between capture workers and inference workers.
    Runs INFERENCE_WORKERS concurrent coroutines consuming from queue.
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[tuple[np.ndarray, FrameMeta]] = asyncio.Queue(
            maxsize=settings.INFERENCE_QUEUE_MAX
        )
        self._worker_tasks: list[asyncio.Task] = []
        self._storage: StorageService = StorageService()
        self._notification_queue: asyncio.Queue[InferenceResult] = asyncio.Queue()
        self._notification_task: asyncio.Task | None = None
        self._db_session_factory = None  # injected at startup

    def set_db_session_factory(self, factory) -> None:
        self._db_session_factory = factory

    async def start(self) -> None:
        """Start inference workers and notification dispatcher."""
        n = settings.INFERENCE_WORKERS
        for i in range(n):
            task = asyncio.create_task(
                self._inference_worker(i), name=f"inference-worker-{i}"
            )
            self._worker_tasks.append(task)
        self._notification_task = asyncio.create_task(
            self._notification_dispatcher(), name="notification-dispatcher"
        )
        logger.info("ProcessingPipeline started with %d inference workers.", n)

    async def stop(self) -> None:
        for task in self._worker_tasks:
            task.cancel()
        if self._notification_task:
            self._notification_task.cancel()
        await asyncio.gather(*self._worker_tasks, self._notification_task, return_exceptions=True)
        logger.info("ProcessingPipeline stopped.")

    async def enqueue(self, frame_bgr: np.ndarray, meta: FrameMeta) -> None:
        """
        Try to put frame on queue. If queue is full, drop the frame (not block).
        This prevents unbounded memory growth under slow inference.
        """
        try:
            self._queue.put_nowait((frame_bgr, meta))
        except asyncio.QueueFull:
            logger.warning(
                "Inference queue full (%d). Dropping frame %s from camera %d.",
                self._queue.maxsize, meta.frame_id, meta.camera_id,
            )

    # ── Workers ────────────────────────────────────────────────────────────────

    async def _inference_worker(self, worker_id: int) -> None:
        yolo = YOLOService.get()
        logger.debug("Inference worker %d ready.", worker_id)

        while True:
            try:
                frame_bgr, meta = await self._queue.get()
            except asyncio.CancelledError:
                return

            try:
                # Run YOLO in thread pool so CPU-bound work doesn't block event loop
                result: InferenceResult = await asyncio.to_thread(
                    yolo.infer, frame_bgr, meta
                )

                if result.error:
                    logger.error("Inference error frame %s: %s", meta.frame_id, result.error)
                    continue

                if result.crack_detected:
                    await self._persist_result(result)
                    await self._notification_queue.put(result)
                    logger.info(
                        "Crack detected camera=%d frame=%s conf=%.2f latency=%.1fms",
                        meta.camera_id, meta.frame_id,
                        result.max_confidence, result.inference_latency_ms,
                    )
                else:
                    logger.debug(
                        "No crack camera=%d frame=%s latency=%.1fms",
                        meta.camera_id, meta.frame_id, result.inference_latency_ms,
                    )

            except Exception as exc:
                logger.exception("Worker %d: unhandled error processing frame %s: %s",
                                 worker_id, meta.frame_id, exc)
            finally:
                self._queue.task_done()

    async def _persist_result(self, result: InferenceResult) -> None:
        """Save annotated image and write InferenceRecord to DB."""
        from app.models.inference import InferenceRecord

        meta = result.frame_meta

        # Save annotated image
        image_path: str | None = None
        if result.annotated_image_bytes:
            image_path = await asyncio.to_thread(
                self._storage.save_flagged_image,
                result.annotated_image_bytes,
                meta.camera_id,
                meta.frame_id,
                meta.captured_at,
            )

        if self._db_session_factory is None:
            logger.error("No DB session factory — cannot persist inference record.")
            return

        async with self._db_session_factory() as session:
            record = InferenceRecord(
                frame_id=meta.frame_id,
                camera_id=meta.camera_id,
                captured_at=meta.captured_at,
                crack_detected=result.crack_detected,
                max_confidence=result.max_confidence,
                num_detections=result.num_detections,
                detections_json=detections_to_json(result.detections),
                segmentation_json=segmentations_to_json(result.segmentations),
                inference_latency_ms=result.inference_latency_ms,
                annotated_image_path=image_path,
                is_verified=False,
            )
            session.add(record)
            await session.commit()
            logger.debug("InferenceRecord persisted for frame %s", meta.frame_id)

    async def _notification_dispatcher(self) -> None:
        """Consume inference results and send notifications."""
        from app.services.notification import NotificationService

        notifier = NotificationService()
        while True:
            try:
                result = await self._notification_queue.get()
                await notifier.dispatch(result, self._db_session_factory)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.exception("Notification dispatch failed: %s", exc)
            finally:
                try:
                    self._notification_queue.task_done()
                except ValueError:
                    pass
