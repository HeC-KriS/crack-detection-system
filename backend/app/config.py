"""
config.py — Central configuration loaded from environment variables.
All secrets come from .env or Docker secrets; never hardcoded.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── App ────────────────────────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = "changeme-use-a-long-random-secret-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Admin ──────────────────────────────────────────────────────────────
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = "admin123"

    # ── Database ───────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./crack_detection.db"
    # PostgreSQL example:
    # DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/crackdb"

    # ── ML Model ───────────────────────────────────────────────────────────
    MODEL_PATH: str = "best-2.pt"
    INFERENCE_DEVICE: str = "cpu"           # "cpu" | "cuda" | "mps"
    INFERENCE_WORKERS: int = 2              # parallel frame-processing coroutines
    INFERENCE_QUEUE_MAX: int = 50           # drop frames if queue backs up past this

    # ── Frame Capture ──────────────────────────────────────────────────────
    DEFAULT_FRAME_INTERVAL_SECONDS: int = 5
    OPENCV_CAPTURE_TIMEOUT_MS: int = 3000   # per-frame grab timeout
    CAMERA_RECONNECT_MAX_RETRIES: int = 10
    CAMERA_RECONNECT_BACKOFF_MAX_S: int = 60

    # ── Alerting ───────────────────────────────────────────────────────────
    DEFAULT_ALERT_THRESHOLD: float = 0.45   # confidence threshold (0.0 – 1.0)
    ALERT_COOLDOWN_SECONDS: int = 120       # suppress repeat alerts per camera

    # ── Storage ────────────────────────────────────────────────────────────
    FLAGGED_IMAGES_DIR: str = "./data/flagged"
    MAX_FLAGGED_IMAGE_SIZE_MB: int = 10

    # ── Slack ──────────────────────────────────────────────────────────────
    SLACK_ENABLED: bool = False
    SLACK_BOT_TOKEN: str = ""               # xoxb-...
    SLACK_CHANNEL: str = "#crack-alerts"

    # ── Email ──────────────────────────────────────────────────────────────
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USE_TLS: bool = True
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL_FROM: str = "alerts@crackdetection.local"
    ALERT_EMAIL_TO: list[str] = []         # comma-separated in .env: "a@b.com,c@d.com"

    # ── Dashboard ──────────────────────────────────────────────────────────
    DASHBOARD_BASE_URL: str = "http://localhost:5173"  # used in alert links
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── Logging ────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
