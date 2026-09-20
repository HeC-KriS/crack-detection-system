"""
main.py — FastAPI application entry point.

Startup sequence:
1. Initialize database (create tables).
2. Load YOLO model.
3. Start ProcessingPipeline (inference workers + notification dispatcher).
4. Start CaptureManager (one worker per active camera from DB).

Shutdown sequence: reverse order, graceful.
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal, init_db, create_default_admin
from app.models.camera import Camera
from app.services.capture import CaptureManager
from app.services.inference import YOLOService
from app.services.pipeline import ProcessingPipeline

settings = get_settings()

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────────────────────────────────────
    logger.info("=== Crack Detection System starting up ===")

    # 1. Database
    logger.info("Initialising database...")
    await init_db()
    await create_default_admin()

    # 2. YOLO model
    logger.info("Loading YOLO model...")
    try:
        YOLOService.get().load()
    except FileNotFoundError as exc:
        logger.error("YOLO model load failed: %s", exc)
        logger.warning("System will run without inference until model is available.")

    # 3. Pipeline
    pipeline = ProcessingPipeline()
    pipeline.set_db_session_factory(AsyncSessionLocal)
    await pipeline.start()
    app.state.pipeline = pipeline

    # 4. Capture manager
    capture_manager = CaptureManager(pipeline)
    app.state.capture_manager = capture_manager

    # Load active cameras and start workers
    from app.routers.cameras import _effective_interval, _effective_threshold, _make_status_updater
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Camera).where(Camera.is_active.is_(True))
        )
        cameras = result.scalars().all()
        for cam in cameras:
            await capture_manager.start_camera(
                camera_id=cam.id,
                camera_name=cam.name,
                stream_url=cam.stream_url,
                frame_interval=_effective_interval(cam),
                alert_threshold=_effective_threshold(cam),
                on_status_change=_make_status_updater(app),
            )
            logger.info("Started capture worker for camera %d (%s)", cam.id, cam.name)

    logger.info("=== Startup complete. %d camera(s) active. ===", len(cameras))

    yield  # ── App is running ──

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    logger.info("=== Shutting down ===")
    await capture_manager.stop_all()
    await pipeline.stop()
    logger.info("=== Shutdown complete ===")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Crack Detection System",
    description="AI-powered concrete crack detection with human verification workflow.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
from app.routers.auth import router as auth_router
from app.routers.cameras import router as cameras_router
from app.routers.feedback import router as feedback_router
from app.routers.inferences import router as inferences_router
from app.routers.stats import router as stats_router
from app.routers.pipelines import router as pipelines_router

API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(cameras_router, prefix=API_PREFIX)
app.include_router(inferences_router, prefix=API_PREFIX)
app.include_router(feedback_router, prefix=API_PREFIX)
app.include_router(stats_router, prefix=API_PREFIX)
app.include_router(pipelines_router, prefix=API_PREFIX)



@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model_loaded": YOLOService.get().is_loaded(),
        "env": settings.APP_ENV,
    }
