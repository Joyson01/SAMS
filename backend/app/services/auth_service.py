from datetime import datetime, timedelta, timezone
import uuid
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from backend.app.models.entities import AuthSession, User
from backend.app.schemas.auth import TokenResponse, UserRegisterRequest, UserResponse


class AuthService:
    """Registration, password verification, and revocable JWT session lifecycle."""

    @classmethod
    async def register_user(
        cls,
        db: AsyncSession,
        register_in: UserRegisterRequest,
        actor: User | None = None,
    ) -> UserResponse:
        requested_role = register_in.role.upper()
        if actor is None and requested_role != "STUDENT":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is limited to the STUDENT role.",
            )
        if actor is not None and actor.role != "ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can create accounts.")
        if actor is not None and actor.role == "ADMIN":
            role = requested_role
        else:
            role = "STUDENT"

        query = select(User).where(
            or_(User.username == register_in.username, User.email == register_in.email)
        )
        existing = (await db.execute(query)).scalars().first()
        if existing:
            if existing.username == register_in.username:
                raise HTTPException(status_code=409, detail=f"Username '{register_in.username}' is already registered.")
            raise HTTPException(status_code=409, detail=f"Email '{register_in.email}' is already registered.")

        user = User(
            username=register_in.username,
            email=register_in.email,
            password_hash=hash_password(register_in.password),
            full_name=register_in.full_name,
            role=role,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Registered new user: %s (%s)", user.username, user.role)
        return UserResponse.model_validate(user)

    @classmethod
    async def _issue_session(cls, db: AsyncSession, user: User) -> TokenResponse:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        refresh_expiry = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        db.add(AuthSession(id=session_id, user_id=user.id, expires_at=refresh_expiry))
        access_token = create_access_token(
            {"sub": user.id, "sid": session_id, "username": user.username, "role": user.role}
        )
        refresh_token = create_refresh_token({"sub": user.id, "sid": session_id})
        await db.commit()
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in_seconds=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user),
        )

    @classmethod
    async def authenticate_user(cls, db: AsyncSession, username_or_email: str, password: str) -> TokenResponse:
        query = select(User).where(
            or_(User.username == username_or_email, User.email == username_or_email)
        )
        user = (await db.execute(query)).scalars().first()
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username/email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This user account has been disabled.")
        result = await cls._issue_session(db, user)
        logger.info("User login successful: %s (Role: %s)", user.username, user.role)
        return result

    @classmethod
    async def refresh_session(cls, db: AsyncSession, refresh_token: str) -> TokenResponse:
        from backend.app.core.security import _resolve_user

        user = await _resolve_user(refresh_token, db, "refresh")
        payload = __import__("jwt").decode(
            refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        old_session = await db.get(AuthSession, payload["sid"])
        if old_session is None:
            raise HTTPException(status_code=401, detail="Session not found.")
        old_session.revoked_at = datetime.now(timezone.utc)
        await db.flush()
        return await cls._issue_session(db, user)

    @classmethod
    async def logout_session(cls, db: AsyncSession, access_token: str) -> None:
        from backend.app.core.security import _resolve_user, decode_access_token

        await _resolve_user(access_token, db, "access")
        payload = decode_access_token(access_token)
        auth_session = await db.get(AuthSession, payload["sid"])
        if auth_session is not None and auth_session.revoked_at is None:
            auth_session.revoked_at = datetime.now(timezone.utc)
            await db.commit()
