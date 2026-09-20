"""
routers/feedback.py — Officer verification feedback endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.feedback import FeedbackVerdict, OfficerFeedback
from app.models.inference import InferenceRecord
from app.schemas import FeedbackCreate, FeedbackOut
from app.utils.auth import get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/{inference_id}", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    inference_id: int,
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    # Check record exists
    rec = await db.get(InferenceRecord, inference_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Inference record not found.")

    # Check not already verified
    existing = await db.execute(
        select(OfficerFeedback).where(OfficerFeedback.inference_record_id == inference_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback already submitted for this record. Use PUT to update.",
        )

    feedback = OfficerFeedback(
        inference_record_id=inference_id,
        verdict=FeedbackVerdict(body.verdict),
        comment=body.comment,
        officer_id=user["username"],
    )
    db.add(feedback)

    # Mark inference record as verified
    rec.is_verified = True
    await db.commit()
    await db.refresh(feedback)

    return feedback


@router.put("/{inference_id}", response_model=FeedbackOut)
async def update_feedback(
    inference_id: int,
    body: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(OfficerFeedback).where(OfficerFeedback.inference_record_id == inference_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="No feedback found. Use POST to create.")

    feedback.verdict = FeedbackVerdict(body.verdict)
    feedback.comment = body.comment
    feedback.officer_id = user["username"]
    await db.commit()
    await db.refresh(feedback)
    return feedback


@router.get("/{inference_id}", response_model=FeedbackOut)
async def get_feedback(
    inference_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(OfficerFeedback).where(OfficerFeedback.inference_record_id == inference_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="No feedback for this record.")
    return feedback
