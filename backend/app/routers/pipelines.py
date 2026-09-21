"""
routers/pipelines.py — Pipeline management endpoints.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.pipeline import Pipeline
from app.schemas import PipelineCreate, PipelineOut, PipelineUpdate
from app.utils.auth import require_admin, get_current_user

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineOut])
async def list_pipelines(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Pipeline).order_by(Pipeline.id)
    )
    return result.scalars().all()


@router.get("/{pipeline_id}", response_model=PipelineOut)
async def get_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    pipeline = await db.get(Pipeline, pipeline_id)

    if not pipeline:
        raise HTTPException(
            status_code=404,
            detail="Pipeline not found.",
        )

    return pipeline


@router.post(
    "",
    response_model=PipelineOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_pipeline(
    body: PipelineCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    existing = await db.execute(
        select(Pipeline).where(Pipeline.name == body.name)
    )

    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="A pipeline with this name already exists.",
        )

    pipeline = Pipeline(**body.model_dump())

    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)

    return pipeline


@router.patch("/{pipeline_id}", response_model=PipelineOut)
async def update_pipeline(
    pipeline_id: int,
    body: PipelineUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    pipeline = await db.get(Pipeline, pipeline_id)

    if not pipeline:
        raise HTTPException(
            status_code=404,
            detail="Pipeline not found.",
        )

    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data:
        existing = await db.execute(
            select(Pipeline).where(
                Pipeline.name == update_data["name"],
                Pipeline.id != pipeline_id,
            )
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="A pipeline with this name already exists.",
            )

    for key, value in update_data.items():
        setattr(pipeline, key, value)

    await db.commit()
    await db.refresh(pipeline)

    return pipeline


@router.delete("/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pipeline(
    pipeline_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    pipeline = await db.get(Pipeline, pipeline_id)

    if not pipeline:
        raise HTTPException(
            status_code=404,
            detail="Pipeline not found.",
        )

    await db.delete(pipeline)
    await db.commit()