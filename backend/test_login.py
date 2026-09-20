import asyncio
from app.database import AsyncSessionLocal
from app.utils.auth import authenticate_user, create_access_token
from app.schemas import TokenResponse

async def main():
    async with AsyncSessionLocal() as db:

        user = await authenticate_user(
            "admin",
            "nxhe umxy yrhs jywo",
            db
        )

        token, expires_in = create_access_token(
            user.username,
            user.role.value
        )

        print("Creating TokenResponse...")

        response = TokenResponse(
            access_token=token,
            expires_in=expires_in
        )

        print("SUCCESS:")
        print(response)

asyncio.run(main())