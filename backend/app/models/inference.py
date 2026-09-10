"""
models/inference.py — Persisted record of a single frame's inference output.
Only created when crack_detected=True AND confidence >= threshold.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InferenceRecord(Base):
    __tablename__ = "inference_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    frame_id: Mapped[str] = mapped_column(String(36), unique=True, index=True, nullable=False)
    camera_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Timestamps
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Detection results
    crack_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    num_detections: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # JSON blobs stored as text (keeps SQLite compat; use JSONB in Postgres via TypeDecorator)
    detections_json: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="JSON array: [{class_name, confidence, bbox:[x1,y1,x2,y2]}]"
    )
    segmentation_json: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="JSON array: [{class_name, confidence, polygon:[[x,y],...]}]"
    )

    # Performance
    inference_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Storage path for annotated image (relative to FLAGGED_IMAGES_DIR)
    annotated_image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Verification status (set once feedback submitted)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    camera: Mapped["Camera"] = relationship(back_populates="inference_records")  # noqa: F821
    feedback: Mapped["OfficerFeedback | None"] = relationship(  # noqa: F821
        back_populates="inference_record", uselist=False, cascade="all, delete-orphan"
    )
    notifications: Mapped[list["NotificationLog"]] = relationship(  # noqa: F821
        back_populates="inference_record", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<InferenceRecord frame_id={self.frame_id!r} "
            f"crack={self.crack_detected} conf={self.max_confidence:.2f}>"
        )
