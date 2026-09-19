"""
schemas/__init__.py — All Pydantic v2 schemas used in API layer.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


# ── Auth ───────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class SignupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8)    

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds

# ── Pipeline ───────────────────────────────────────────────────────────────────

class PipelineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(None, max_length=2000)
    is_active: bool = True


class PipelineUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=2000)
    is_active: bool | None = None


class PipelineOut(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# ── Camera ─────────────────────────────────────────────────────────────────────

class CameraCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    stream_url: str = Field(..., min_length=1, max_length=512)
    pipeline_id: int | None = None
    frame_interval_seconds: int | None = Field(None, ge=1, le=3600)
    alert_threshold: float | None = Field(None, ge=0.0, le=1.0)
    is_active: bool = True


class CameraUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    stream_url: str | None = None
    pipeline_id: int | None = None
    frame_interval_seconds: int | None = Field(None, ge=1, le=3600)
    alert_threshold: float | None = Field(None, ge=0.0, le=1.0)
    is_active: bool | None = None


class CameraOut(BaseModel):
    id: int
    name: str
    stream_url: str
    pipeline_id: int | None
    frame_interval_seconds: int | None
    alert_threshold: float | None
    status: str
    is_active: bool
    last_seen_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Detection / Segmentation ───────────────────────────────────────────────────

class DetectionItem(BaseModel):
    class_name: str
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2] in pixel coords

class SegmentationItem(BaseModel):
    class_name: str
    confidence: float
    polygon: list[list[float]]  # [[x, y], ...]
    area_px: float | None = None


# ── Inference Record ───────────────────────────────────────────────────────────

class InferenceRecordOut(BaseModel):
    id: int
    frame_id: str
    camera_id: int
    camera_name: str | None = None
    pipeline_id: int | None = None
    pipeline_name: str | None = None
    captured_at: datetime
    processed_at: datetime
    crack_detected: bool
    max_confidence: float
    num_detections: int
    detections: list[DetectionItem] = []
    segmentations: list[SegmentationItem] = []
    inference_latency_ms: float | None
    annotated_image_url: str | None = None
    is_verified: bool
    feedback: "FeedbackOut | None" = None

    model_config = {"from_attributes": True}


class InferenceListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[InferenceRecordOut]


# ── Feedback ───────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    verdict: str = Field(
        ..., pattern="^(true_positive|false_positive|needs_inspection)$"
    )
    comment: str | None = Field(None, max_length=2000)


class FeedbackOut(BaseModel):
    id: int
    verdict: str
    comment: str | None
    officer_id: str | None
    submitted_at: datetime

    model_config = {"from_attributes": True}


# ── Stats ──────────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_frames_processed_24h: int
    total_cracks_detected_24h: int
    pending_verification: int
    true_positives_total: int
    false_positives_total: int
    needs_inspection_total: int
    cameras_online: int
    cameras_offline: int


# ── Retraining Export ──────────────────────────────────────────────────────────

class RetrainingExportParams(BaseModel):
    verdicts: list[str] = ["true_positive"]
    start_date: datetime | None = None
    end_date: datetime | None = None
