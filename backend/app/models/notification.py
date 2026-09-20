"""
models/notification.py — Audit log of every sent alert.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.inference import InferenceRecord
    
from app.database import Base


class NotificationChannel(str, enum.Enum):
    SLACK = "slack"
    EMAIL = "email"


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inference_record_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inference_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel), nullable=False
    )
    recipient: Mapped[str | None] = mapped_column(
        String(256), nullable=True, comment="email address or Slack channel"
    )
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship
    inference_record: Mapped["InferenceRecord"] = relationship(  # noqa: F821
        back_populates="notifications"
    )
