"""
routers/inferences.py — Inference record endpoints.
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import logging
from app.database import get_db
from app.models.camera import Camera
from app.models.feedback import OfficerFeedback
from app.models.inference import InferenceRecord
from app.schemas import (
    DetectionItem,
    FeedbackOut,
    InferenceListResponse,
    InferenceRecordOut,
    SegmentationItem,
)
from app.services.storage import StorageService
from app.utils.auth import get_current_user
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inferences", tags=["inferences"])
storage = StorageService()


def _build_record_out(rec: InferenceRecord, camera_name: str | None = None) -> InferenceRecordOut:
    detections = []
    if rec.detections_json:
        try:
            raw = json.loads(rec.detections_json)
            detections = [DetectionItem(**d) for d in raw]
        except Exception:
            pass

    segmentations = []
    if rec.segmentation_json:
        try:
            raw = json.loads(rec.segmentation_json)
            segmentations = [SegmentationItem(**s) for s in raw]
        except Exception as exc:
            logger.exception("Failed to parse segmentation JSON for inference %s: %s", rec.id, exc)
            

    annotated_url = None
    if rec.annotated_image_path:
        annotated_url = f"/inferences/{rec.id}/image"

    feedback_out = None
    if rec.feedback:
        feedback_out = FeedbackOut.model_validate(rec.feedback)

    return InferenceRecordOut(
        id=rec.id,
        frame_id=rec.frame_id,
        camera_id=rec.camera_id,
        camera_name=camera_name,
        captured_at=rec.captured_at,
        processed_at=rec.processed_at,
        crack_detected=rec.crack_detected,
        max_confidence=rec.max_confidence,
        num_detections=rec.num_detections,
        detections=detections,
        segmentations=segmentations,
        inference_latency_ms=rec.inference_latency_ms,
        annotated_image_url=annotated_url,
        is_verified=rec.is_verified,
        feedback=feedback_out,
    )


@router.get("", response_model=InferenceListResponse)
async def list_inferences(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    camera_id: int | None = Query(None),
    verified: bool | None = Query(None),
    crack_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    stmt = (
        select(InferenceRecord)
        .options(selectinload(InferenceRecord.feedback))
        .order_by(InferenceRecord.captured_at.desc())
    )

    if camera_id is not None:
        stmt = stmt.where(InferenceRecord.camera_id == camera_id)
    if verified is not None:
        stmt = stmt.where(InferenceRecord.is_verified == verified)
    if crack_only:
        stmt = stmt.where(InferenceRecord.crack_detected.is_(True))

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Paginate
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    records = (await db.execute(stmt)).scalars().all()

    # Fetch camera names in one query
    cam_ids = list({r.camera_id for r in records})
    cam_map: dict[int, str] = {}
    if cam_ids:
        cam_result = await db.execute(select(Camera).where(Camera.id.in_(cam_ids)))
        for cam in cam_result.scalars():
            cam_map[cam.id] = cam.name

    items = [_build_record_out(r, cam_map.get(r.camera_id)) for r in records]
    return InferenceListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/{inference_id}", response_model=InferenceRecordOut)
async def get_inference(
    inference_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    rec = await db.get(
        InferenceRecord,
        inference_id,
        options=[selectinload(InferenceRecord.feedback)],
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Inference record not found.")
    cam = await db.get(Camera, rec.camera_id)
    return _build_record_out(rec, cam.name if cam else None)


@router.get("/{inference_id}/image")
async def get_annotated_image(
    inference_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    rec = await db.get(InferenceRecord, inference_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Inference record not found.")
    if not rec.annotated_image_path:
        raise HTTPException(status_code=404, detail="No annotated image stored for this record.")

    try:
        image_bytes = storage.read_image_bytes(rec.annotated_image_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Annotated image file not found on disk.")

    return Response(content=image_bytes, media_type="image/png")
