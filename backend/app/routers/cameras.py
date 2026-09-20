"""
routers/cameras.py — Camera management endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.camera import Camera, CameraStatus
from app.schemas import CameraCreate, CameraOut, CameraUpdate
from app.utils.auth import get_current_user, require_admin
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/cameras", tags=["cameras"])


def _effective_interval(cam: Camera) -> int:
    return cam.frame_interval_seconds or settings.DEFAULT_FRAME_INTERVAL_SECONDS


def _effective_threshold(cam: Camera) -> float:
    return cam.alert_threshold if cam.alert_threshold is not None else settings.DEFAULT_ALERT_THRESHOLD


@router.get("", response_model=list[CameraOut])
async def list_cameras(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Camera).order_by(Camera.id))
    return result.scalars().all()


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(
    body: CameraCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    cam = Camera(**body.model_dump())
    db.add(cam)
    await db.commit()
    await db.refresh(cam)

    # Auto-start capture worker if camera is active
    if cam.is_active:
        mgr = request.app.state.capture_manager
        pipeline = request.app.state.pipeline
        await mgr.start_camera(
            camera_id=cam.id,
            camera_name=cam.name,
            stream_url=cam.stream_url,
            frame_interval=_effective_interval(cam),
            alert_threshold=_effective_threshold(cam),
            mm_per_pixel=cam.mm_per_pixel,
            on_status_change=_make_status_updater(request.app),
        )

    return cam


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    cam = await db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found.")
    return cam


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: int,
    body: CameraUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    cam = await db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found.")

    update_data = body.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(cam, k, v)

    await db.commit()
    await db.refresh(cam)

    # Restart worker if stream settings changed
    mgr = request.app.state.capture_manager
    if any(k in update_data for k in ("stream_url", "frame_interval_seconds",
                                       "alert_threshold", "mm_per_pixel", "is_active")):
        await mgr.stop_camera(camera_id)
        if cam.is_active:
            await mgr.start_camera(
                camera_id=cam.id,
                camera_name=cam.name,
                stream_url=cam.stream_url,
                frame_interval=_effective_interval(cam),
                alert_threshold=_effective_threshold(cam),
                on_status_change=_make_status_updater(request.app),
            )

    return cam


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(
    camera_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    cam = await db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found.")
    await request.app.state.capture_manager.stop_camera(camera_id)
    await db.delete(cam)
    await db.commit()


@router.post("/{camera_id}/restart", response_model=CameraOut)
async def restart_camera(
    camera_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    cam = await db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found.")
    mgr = request.app.state.capture_manager
    await mgr.stop_camera(camera_id)
    if cam.is_active:
        await mgr.start_camera(
            camera_id=cam.id,
            camera_name=cam.name,
            stream_url=cam.stream_url,
            frame_interval=_effective_interval(cam),
            alert_threshold=_effective_threshold(cam),
            mm_per_pixel=cam.mm_per_pixel,
            on_status_change=_make_status_updater(request.app),
        )
    return cam


def _make_status_updater(app):
    """Returns an async callback that updates camera status in DB."""
    async def _update(camera_id: int, status_str: str) -> None:
        from app.database import AsyncSessionLocal
        from datetime import datetime, timezone

        status_map = {
            "online": CameraStatus.ONLINE,
            "offline": CameraStatus.OFFLINE,
            "error": CameraStatus.ERROR,
        }
        new_status = status_map.get(status_str, CameraStatus.OFFLINE)

        async with AsyncSessionLocal() as session:
            cam = await session.get(Camera, camera_id)
            if cam:
                cam.status = new_status
                if new_status == CameraStatus.ONLINE:
                    cam.last_seen_at = datetime.now(timezone.utc)
                await session.commit()

    return _update
