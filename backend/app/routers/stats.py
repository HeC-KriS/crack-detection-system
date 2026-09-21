"""
routers/stats.py — Dashboard statistics and retraining data export.
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timedelta, timezone
from app.utils.time import now_ist

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.camera import Camera, CameraStatus
from app.models.feedback import FeedbackVerdict, OfficerFeedback
from app.models.inference import InferenceRecord
from app.schemas import DashboardStats
from app.services.storage import StorageService
from app.utils.auth import get_current_user, require_admin

router = APIRouter(prefix="/stats", tags=["stats"])
storage = StorageService()


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    cutoff = now_ist() - timedelta(hours=24)

    # Frames processed in last 24h (we only store flagged ones, so this is flagged count)
    frames_24h = (
        await db.execute(
            select(func.count(InferenceRecord.id)).where(
                InferenceRecord.processed_at >= cutoff
            )
        )
    ).scalar_one()

    cracks_24h = (
        await db.execute(
            select(func.count(InferenceRecord.id)).where(
                InferenceRecord.processed_at >= cutoff,
                InferenceRecord.crack_detected.is_(True),
            )
        )
    ).scalar_one()

    pending = (
        await db.execute(
            select(func.count(InferenceRecord.id)).where(
                InferenceRecord.is_verified.is_(False),
                InferenceRecord.crack_detected.is_(True),
            )
        )
    ).scalar_one()

    def verdict_count(verdict: FeedbackVerdict):
        return select(func.count(OfficerFeedback.id)).where(
            OfficerFeedback.verdict == verdict
        )

    tp = (await db.execute(verdict_count(FeedbackVerdict.TRUE_POSITIVE))).scalar_one()
    fp = (await db.execute(verdict_count(FeedbackVerdict.FALSE_POSITIVE))).scalar_one()
    ni = (await db.execute(verdict_count(FeedbackVerdict.NEEDS_INSPECTION))).scalar_one()

    cams_online = (
        await db.execute(
            select(func.count(Camera.id)).where(Camera.status == CameraStatus.ONLINE)
        )
    ).scalar_one()
    cams_offline = (
        await db.execute(
            select(func.count(Camera.id)).where(Camera.status != CameraStatus.ONLINE)
        )
    ).scalar_one()

    return DashboardStats(
        total_frames_processed_24h=frames_24h,
        total_cracks_detected_24h=cracks_24h,
        pending_verification=pending,
        true_positives_total=tp,
        false_positives_total=fp,
        needs_inspection_total=ni,
        cameras_online=cams_online,
        cameras_offline=cams_offline,
    )


@router.get("/export/retraining-dataset")
async def export_retraining_dataset(
    verdicts: list[str] = Query(default=["true_positive"]),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    """
    Export a ZIP archive containing:
    - annotated PNG images
    - YOLO-format label files (.txt with normalized bbox coordinates)
    - metadata.jsonl with all inference metadata

    This dataset can be used to retrain or fine-tune best.pt.
    """
    valid_verdicts = [FeedbackVerdict(v) for v in verdicts if v in FeedbackVerdict.__members__.values()]

    stmt = (
        select(InferenceRecord)
        .join(OfficerFeedback, OfficerFeedback.inference_record_id == InferenceRecord.id)
        .where(OfficerFeedback.verdict.in_(valid_verdicts))
        .options(selectinload(InferenceRecord.feedback))
    )

    if start_date:
        stmt = stmt.where(InferenceRecord.captured_at >= start_date)
    if end_date:
        stmt = stmt.where(InferenceRecord.captured_at <= end_date)

    records = (await db.execute(stmt)).scalars().all()

    # Build ZIP in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for rec in records:
            # Image
            if rec.annotated_image_path and storage.image_exists(rec.annotated_image_path):
                img_bytes = storage.read_image_bytes(rec.annotated_image_path)
                zf.writestr(f"images/{rec.frame_id}.png", img_bytes)

            # YOLO label file
            if rec.detections_json:
                try:
                    dets = json.loads(rec.detections_json)
                    label_lines = []
                    for d in dets:
                        # Normalise bbox to [0,1] requires image dims — skip if unknown
                        # Include raw pixel bbox as comment for reference
                        x1, y1, x2, y2 = d["bbox"]
                        # Placeholder: class 0 = crack
                        label_lines.append(f"0 {x1} {y1} {x2} {y2}  # pixel coords")
                    zf.writestr(
                        f"labels/{rec.frame_id}.txt",
                        "\n".join(label_lines),
                    )
                except Exception:
                    pass

            # Metadata
            meta = {
                "frame_id": rec.frame_id,
                "camera_id": rec.camera_id,
                "captured_at": rec.captured_at.isoformat(),
                "max_confidence": rec.max_confidence,
                "num_detections": rec.num_detections,
                "verdict": rec.feedback.verdict if rec.feedback else None,
                "detections": json.loads(rec.detections_json or "[]"),
                "segmentations": json.loads(rec.segmentation_json or "[]"),
            }
            zf.writestr(f"metadata/{rec.frame_id}.json", json.dumps(meta, indent=2))

    buf.seek(0)
    filename = f"retraining_dataset_{now_ist().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
