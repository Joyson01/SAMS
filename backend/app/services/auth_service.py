import asyncio
from datetime import datetime, timedelta, timezone
import uuid
from fastapi import HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.services.audit_service import record_activity, record_student_activity
from backend.app.core.security import decode_access_token

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
from backend.app.models.entities import AuthSession, ClassSection, User
from backend.app.schemas.auth import TokenResponse, UserRegisterRequest, UserResponse


# A fixed dummy hash equalizes work for sign-ins that have no account.
DUMMY_PASSWORD_HASH = hash_password("unused-placeholder-for-login-timing")


def record_auth_event(db: AsyncSession, user: User | None, action: str) -> None:
    prefix = "STUDENT_" if user and user.role == "STUDENT" else ""
    record_activity(db, user, prefix + action, "User", user.id if user else "unknown")


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
        if actor is not None and requested_role not in {"STUDENT", "ADMIN", "HOD", "FACULTY", "OPERATOR"}:
            raise HTTPException(422, "Invalid account role.")
        if actor is not None and actor.role != "ADMIN":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only administrators can create accounts.")
        if actor is not None and actor.role == "ADMIN":
            role = requested_role
        else:
            role = "STUDENT"

        department = None
        if role == "HOD":
            department = (register_in.department or "").strip()
            known_department = await db.scalar(
                select(ClassSection.department).where(ClassSection.department == department).limit(1)
            )
            if not department or known_department is None:
                raise HTTPException(422, "Select a department with an existing class for the HOD account.")

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
            department=department,
            is_active=True,
        )
        db.add(user)
        try:
            if actor is None:
                await db.flush()
                record_student_activity(db, user, "REGISTER_ACCOUNT", "User", user.id)
            elif actor.id is not None:
                await db.flush()
                record_activity(db, actor, "CREATE_ACCOUNT", "User", user.id)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, "Username or email is already registered.")
        await db.refresh(user)
        logger.info("Registered new user: %s (%s)", user.username, user.role)
        return UserResponse.model_validate(user)

    @classmethod
    async def _issue_session(cls, db: AsyncSession, user: User, *, interactive: bool = False) -> TokenResponse:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        refresh_expiry = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        db.add(AuthSession(id=session_id, user_id=user.id, expires_at=refresh_expiry))
        access_token = create_access_token(
            {"sub": user.id, "sid": session_id, "username": user.username, "role": user.role}
        )
        refresh_token = create_refresh_token({"sub": user.id, "sid": session_id})
        if interactive:
            record_auth_event(db, user, "SIGN_IN")
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
        valid_password = await asyncio.to_thread(verify_password, password, user.password_hash if user else DUMMY_PASSWORD_HASH)
        if not user or not valid_password:
            record_auth_event(db, user, "SIGN_IN_FAILED")
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username/email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not user.is_active:
            record_auth_event(db, user, "SIGN_IN_FAILED")
            await db.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This user account has been disabled.")
        if settings.ENVIRONMENT.lower() in {"production", "prod"} and user.username == "admin" and password == "Admin@12345":
            record_auth_event(db, user, "SIGN_IN_FAILED")
            await db.commit()
            raise HTTPException(403, "Change the development administrator password before production use.")
        result = await cls._issue_session(db, user, interactive=True)
        logger.info("User login successful: %s (Role: %s)", user.username, user.role)
        return result

    @classmethod
    async def refresh_session(cls, db: AsyncSession, refresh_token: str) -> TokenResponse:
        from backend.app.core.security import _resolve_user

        user = await _resolve_user(refresh_token, db, "refresh")
        payload = decode_access_token(refresh_token)
        old_session = await db.get(AuthSession, payload["sid"])
        if old_session is None:
            raise HTTPException(status_code=401, detail="Session not found.")
        result = await db.execute(update(AuthSession).where(
            AuthSession.id == old_session.id, AuthSession.revoked_at.is_(None)
        ).values(revoked_at=datetime.now(timezone.utc)).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            await db.rollback()
            raise HTTPException(401, "Refresh token has already been used.")
        return await cls._issue_session(db, user)

    @classmethod
    async def logout_session(cls, db: AsyncSession, access_token: str) -> None:
        from backend.app.core.security import _resolve_user, decode_access_token

        user = await _resolve_user(access_token, db, "access")
        payload = decode_access_token(access_token)
        auth_session = await db.get(AuthSession, payload["sid"])
        if auth_session is not None and auth_session.revoked_at is None:
            auth_session.revoked_at = datetime.now(timezone.utc)
            record_auth_event(db, user, "SIGN_OUT")
            await db.commit()
