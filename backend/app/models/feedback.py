"""
models/feedback.py — Officer verification feedback linked to an inference record.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FeedbackVerdict(str, enum.Enum):
    TRUE_POSITIVE = "true_positive"
    FALSE_POSITIVE = "false_positive"
    NEEDS_INSPECTION = "needs_inspection"


class OfficerFeedback(Base):
    __tablename__ = "officer_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inference_record_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("inference_records.id", ondelete="CASCADE"),
        unique=True,   # one feedback per inference
        nullable=False,
        index=True,
    )

    verdict: Mapped[FeedbackVerdict] = mapped_column(
        Enum(FeedbackVerdict), nullable=False
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    officer_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True, comment="JWT sub — officer's identity"
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship
    inference_record: Mapped["InferenceRecord"] = relationship(  # noqa: F821
        back_populates="feedback"
    )

    def __repr__(self) -> str:
        return f"<OfficerFeedback inf_id={self.inference_record_id} verdict={self.verdict}>"
