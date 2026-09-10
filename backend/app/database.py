"""
database.py — Async SQLAlchemy engine, session factory, and Base declaration.
Supports both PostgreSQL (via asyncpg) and SQLite (via aiosqlite).
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# ── Engine ─────────────────────────────────────────────────────────────────────
# SQLite needs check_same_thread=False and connect_args; Postgres does not.
_connect_args: dict = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    connect_args=_connect_args,
    pool_pre_ping=True,
)

# ── Session factory ────────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Base ───────────────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency ─────────────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields an async session and closes it afterwards."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Init ───────────────────────────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables if they do not exist (idempotent)."""
    # Import models so metadata is populated before create_all
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
