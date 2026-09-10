"""
services/capture.py — Frame capture service.

Runs one asyncio Task per active camera.
Grabs one frame every camera.frame_interval_seconds.
Never writes raw frames to disk.
Handles reconnection with exponential backoff.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import cv2
import numpy as np

from app.config import get_settings
from app.services.inference import FrameMeta

if TYPE_CHECKING:
    from app.services.pipeline import ProcessingPipeline

logger = logging.getLogger(__name__)
settings = get_settings()


class CameraWorker:
    """
    Manages one camera: opens stream, grabs frames on interval,
    pushes (frame_bgr, FrameMeta) tuples to the shared pipeline queue.
    """

    def __init__(
        self,
        camera_id: int,
        camera_name: str,
        stream_url: str,
        frame_interval: int,
        alert_threshold: float,
        pipeline: "ProcessingPipeline",
        on_status_change: "asyncio.Coroutine | None" = None,
    ) -> None:
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.stream_url = stream_url
        self.frame_interval = frame_interval
        self.alert_threshold = alert_threshold
        self.pipeline = pipeline
        self.on_status_change = on_status_change

        self._task: asyncio.Task | None = None
        self._running = False

    # ── Public lifecycle ───────────────────────────────────────────────────────

    def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(
            self._run_loop(), name=f"camera-{self.camera_id}"
        )
        logger.info("CameraWorker started for camera_id=%d (%s)", self.camera_id, self.camera_name)

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("CameraWorker stopped for camera_id=%d", self.camera_id)

    # ── Internal loop ──────────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        backoff = 1
        max_backoff = settings.CAMERA_RECONNECT_BACKOFF_MAX_S
        retry_count = 0
        max_retries = settings.CAMERA_RECONNECT_MAX_RETRIES

        while self._running:
            cap = await self._open_capture()
            if cap is None:
                retry_count += 1
                if retry_count > max_retries:
                    logger.error(
                        "Camera %d: exceeded max retries (%d). Stopping worker.",
                        self.camera_id, max_retries,
                    )
                    await self._notify_status("error")
                    return
                await self._notify_status("offline")
                logger.warning(
                    "Camera %d: reconnecting in %ds (attempt %d/%d)",
                    self.camera_id, backoff, retry_count, max_retries,
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)
                continue

            # Successful connection
            backoff = 1
            retry_count = 0
            await self._notify_status("online")
            logger.info("Camera %d: connected to stream.", self.camera_id)

            try:
                await self._capture_loop(cap)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Camera %d: unexpected error in capture loop: %s", self.camera_id, exc)
            finally:
                await asyncio.to_thread(cap.release)

            if not self._running:
                break

            await self._notify_status("offline")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)

    async def _capture_loop(self, cap: cv2.VideoCapture) -> None:
        """Main capture loop: grab one frame per interval, push to pipeline."""
        loop = asyncio.get_running_loop()

        while self._running:
            t_start = loop.time()

            # Grab frame in thread pool to avoid blocking event loop
            frame_bgr, ok = await asyncio.to_thread(self._grab_frame, cap)

            if not ok or frame_bgr is None:
                logger.warning("Camera %d: failed to read frame. Reconnecting.", self.camera_id)
                return  # triggers reconnect in outer loop

            frame_id = str(uuid.uuid4())
            captured_at = datetime.now(timezone.utc)

            meta = FrameMeta(
                frame_id=frame_id,
                camera_id=self.camera_id,
                captured_at=captured_at,
                alert_threshold=self.alert_threshold,
            )

            await self.pipeline.enqueue(frame_bgr, meta)

            # Sleep for remaining interval time
            elapsed = loop.time() - t_start
            sleep_time = max(0.0, self.frame_interval - elapsed)
            await asyncio.sleep(sleep_time)

    def _grab_frame(self, cap: cv2.VideoCapture) -> tuple[np.ndarray | None, bool]:
        """Called in thread pool — reads one frame with timeout awareness."""
        ok, frame = cap.read()
        return frame, ok

    async def _open_capture(self) -> cv2.VideoCapture | None:
        """Open VideoCapture in thread pool to avoid blocking event loop."""
        def _open() -> cv2.VideoCapture | None:
            # cap = cv2.VideoCapture(self.stream_url)
            src = int(self.stream_url) if self.stream_url.isdigit() else self.stream_url
            cap = cv2.VideoCapture(src)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # minimize frame lag
            # Set read timeout (only effective on some backends)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, settings.OPENCV_CAPTURE_TIMEOUT_MS)
            if not cap.isOpened():
                cap.release()
                return None
            return cap

        return await asyncio.to_thread(_open)

    async def _notify_status(self, status: str) -> None:
        if self.on_status_change:
            try:
                await self.on_status_change(self.camera_id, status)
            except Exception as exc:
                logger.error("Status change callback failed for camera %d: %s", self.camera_id, exc)


# ── CaptureManager — owns all CameraWorker instances ──────────────────────────

class CaptureManager:
    """
    Manages a pool of CameraWorkers.
    Called at app startup to start workers for all active cameras,
    and provides runtime add/remove/restart capabilities.
    """

    def __init__(self, pipeline: "ProcessingPipeline") -> None:
        self.pipeline = pipeline
        self._workers: dict[int, CameraWorker] = {}

    async def start_camera(
        self,
        camera_id: int,
        camera_name: str,
        stream_url: str,
        frame_interval: int,
        alert_threshold: float,
        on_status_change=None,
    ) -> None:
        if camera_id in self._workers:
            await self.stop_camera(camera_id)

        worker = CameraWorker(
            camera_id=camera_id,
            camera_name=camera_name,
            stream_url=stream_url,
            frame_interval=frame_interval,
            alert_threshold=alert_threshold,
            pipeline=self.pipeline,
            on_status_change=on_status_change,
        )
        self._workers[camera_id] = worker
        worker.start()

    async def stop_camera(self, camera_id: int) -> None:
        worker = self._workers.pop(camera_id, None)
        if worker:
            await worker.stop()

    async def stop_all(self) -> None:
        for worker in list(self._workers.values()):
            await worker.stop()
        self._workers.clear()

    def active_camera_ids(self) -> list[int]:
        return list(self._workers.keys())
