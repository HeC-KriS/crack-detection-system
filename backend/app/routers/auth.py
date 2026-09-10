"""
routers/auth.py — Authentication endpoints.
"""
from fastapi import APIRouter, HTTPException, status

from app.schemas import LoginRequest, TokenResponse
from app.utils.auth import authenticate_user, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    token, expires_in = create_access_token(user["username"], user["role"])
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me")
async def me(user=None):
    # Injected by dependency in main.py if needed; minimal implementation here
    return {"status": "authenticated"}
