from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.database.session import get_db
from backend.app.models.entities import AuthSession, User

JWT_SECRET_KEY = settings.SECRET_KEY
JWT_ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS

http_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(data: Dict[str, Any], expires_delta: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload = data.copy()
    payload.update({"iat": now, "exp": now + expires_delta, "type": token_type})
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    return _create_token(
        data,
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
    )


def create_refresh_token(data: Dict[str, Any]) -> str:
    return _create_token(data, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), "refresh")


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode a JWT and reject malformed or expired tokens."""
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _resolve_user(token: str, db: AsyncSession, expected_type: str = "access") -> User:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if payload.get("type") != expected_type or not user_id or not session_id:
        raise _unauthorized("Invalid authentication token.")

    auth_session = await db.get(AuthSession, session_id)
    if not auth_session or auth_session.user_id != user_id or auth_session.revoked_at is not None:
        raise _unauthorized("This session is no longer active.")

    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise _unauthorized("This session has expired.")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise _unauthorized("User account does not exist or has been disabled.")
    return user


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(http_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise _unauthorized("Authentication bearer token required.")
    return await _resolve_user(credentials.credentials, db, "access")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(http_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Resolve a user when a bearer token is supplied; allow anonymous requests."""
    if not credentials:
        return None
    return await _resolve_user(credentials.credentials, db, "access")


def require_roles(*allowed_roles: str):
    """Dependency factory enforcing role-based access control."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user
    return role_checker
