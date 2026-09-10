"""
models/camera.py — Camera registration and status.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CameraStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    PAUSED = "paused"


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    stream_url: Mapped[str] = mapped_column(String(512), nullable=False)

    # Per-camera overrides (fallback to global settings if NULL)
    frame_interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    alert_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[CameraStatus] = mapped_column(
        Enum(CameraStatus), default=CameraStatus.OFFLINE, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    inference_records: Mapped[list["InferenceRecord"]] = relationship(  # noqa: F821
        back_populates="camera", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Camera id={self.id} name={self.name!r} status={self.status}>"
