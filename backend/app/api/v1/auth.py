from fastapi import APIRouter, Depends, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import get_current_user, get_optional_user, http_bearer
from backend.app.database.session import get_db
from backend.app.models.entities import User
from backend.app.schemas.auth import (
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from backend.app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a student or administrator-created account",
)
async def register(
    register_in: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
    actor: User | None = Depends(get_optional_user),
) -> UserResponse:
    """Anonymous callers may register as students; only an admin may assign elevated roles."""
    return await AuthService.register_user(db, register_in, actor)


@router.post("/login", response_model=TokenResponse, summary="Login and receive access/refresh tokens")
async def login(
    login_in: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await AuthService.authenticate_user(db, login_in.username_or_email, login_in.password)


@router.post("/refresh", response_model=TokenResponse, summary="Rotate a refresh token")
async def refresh(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await AuthService.refresh_session(db, request.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke the current session")
async def logout(
    credentials: HTTPAuthorizationCredentials = Security(http_bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await AuthService.logout_session(db, credentials.credentials)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
