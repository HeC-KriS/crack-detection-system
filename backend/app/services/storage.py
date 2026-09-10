"""
services/storage.py — Filesystem storage for flagged annotated images.
Only flagged (crack-detected) frames are ever written to disk.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageService:
    def __init__(self) -> None:
        self.base_dir = Path(settings.FLAGGED_IMAGES_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_flagged_image(
        self,
        image_bytes: bytes,
        camera_id: int,
        frame_id: str,
        captured_at: datetime,
    ) -> str:
        """
        Save annotated PNG to:
          <base_dir>/<YYYY-MM-DD>/cam_<camera_id>/<frame_id>.png

        Returns relative path string (stored in DB, resolved at serve time).
        """
        date_str = captured_at.strftime("%Y-%m-%d")
        subdir = self.base_dir / date_str / f"cam_{camera_id}"
        subdir.mkdir(parents=True, exist_ok=True)

        filename = f"{frame_id}.png"
        full_path = subdir / filename

        if len(image_bytes) > settings.MAX_FLAGGED_IMAGE_SIZE_MB * 1024 * 1024:
            logger.warning(
                "Annotated image for frame %s exceeds %dMB limit — skipping save.",
                frame_id, settings.MAX_FLAGGED_IMAGE_SIZE_MB,
            )
            return ""

        full_path.write_bytes(image_bytes)
        logger.debug("Saved annotated image to %s", full_path)

        # Return path relative to base_dir for DB storage
        return str(full_path.relative_to(self.base_dir))

    def resolve_image_path(self, relative_path: str) -> Path:
        """Resolve a stored relative path back to an absolute Path."""
        return self.base_dir / relative_path

    def image_exists(self, relative_path: str) -> bool:
        return self.resolve_image_path(relative_path).exists()

    def read_image_bytes(self, relative_path: str) -> bytes:
        path = self.resolve_image_path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {relative_path}")
        return path.read_bytes()
