"""
utils/auth.py — JWT token creation/validation and simple user store.

For production: replace the in-memory USER_DB with a real users table
and bcrypt password hashing via passlib.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

settings = get_settings()

# ── Simple user store (replace with DB in production) ─────────────────────────
# Passwords are SHA-256 hex digests. Use bcrypt in production.
USER_DB: dict[str, dict[str, Any]] = {
    "admin": {
        "username": "admin",
        "password_hash": hashlib.sha256(b"changeme").hexdigest(),
        "role": "admin",
    },
    "officer": {
        "username": "officer",
        "password_hash": hashlib.sha256(b"inspect123").hexdigest(),
        "role": "officer",
    },
}


def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(plain.encode()).hexdigest(), hashed
    )


def authenticate_user(username: str, password: str) -> dict | None:
    user = USER_DB.get(username)
    if user and verify_password(password, user["password_hash"]):
        return user
    return None


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(subject: str, role: str) -> tuple[str, int]:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return token, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


# ── Token validation ───────────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict[str, Any]:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    if not username or username not in USER_DB:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return {"username": username, "role": payload.get("role", "officer")}


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required.")
    return user
