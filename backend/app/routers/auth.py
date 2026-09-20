"""
routers/auth.py — Authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


from app.database import get_db
from app.models.user import User, UserRole
from app.utils.auth import( hash_password, authenticate_user, create_access_token, get_current_user)

from app.schemas import LoginRequest, SignupRequest, TokenResponse
from app.utils.auth import authenticate_user, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup")
async def signup(
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
):
    # Check whether username or email is already registered
    result = await db.execute(
        select(User).where(
            (User.username == body.username) |
            (User.email == body.email)
        )
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered.",
        )

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.OFFICER,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "message": "Officer account created successfully.",
        "username": user.username,
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(body.username, body.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    token, expires_in = create_access_token(user.username, user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
