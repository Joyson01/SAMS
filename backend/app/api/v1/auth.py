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


# Setup is serialized per process and guarded by a database write lock.
import asyncio
import secrets
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, update, text, func
from sqlalchemy.exc import IntegrityError
from backend.app.core.config import settings
from backend.app.core.security import require_roles, hash_password
from backend.app.models.entities import AuthSession, Student, StudentPortalDetails, UserStudentLink, AttendanceRecord, AttendanceSession
from backend.app.schemas.auth import BootstrapRequest, UserUpdateRequest, StudentLinkRequest

_setup_lock = asyncio.Lock()
_COMP_B_ACADEMIC_YEARS = {"124": "2024 - 2028", "224": "2025 - 2028"}

@router.get("/setup-status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count(User.id)).where(User.role == "ADMIN"))
    return {"available": count == 0, "token_required": settings.ENVIRONMENT != "development"}

@router.post("/bootstrap-admin", response_model=UserResponse, status_code=201)
async def bootstrap_admin(payload: BootstrapRequest, db: AsyncSession = Depends(get_db)):
    if settings.ENVIRONMENT != "development" and not (
        settings.BOOTSTRAP_TOKEN and secrets.compare_digest(payload.bootstrap_token, settings.BOOTSTRAP_TOKEN)
    ):
        raise HTTPException(403, "A valid bootstrap token is required.")
    async with _setup_lock:
        if db.bind.dialect.name == "sqlite":
            await db.execute(text("BEGIN IMMEDIATE"))
        else:
            await db.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))
        if await db.scalar(select(User.id).where(User.role == "ADMIN").limit(1)):
            await db.rollback()
            raise HTTPException(409, "Setup is closed: an administrator already exists.")
        payload.role = "ADMIN"
        return await AuthService.register_user(db, payload, actor=User(role="ADMIN"))

@router.get("/users", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), actor: User = Depends(require_roles("ADMIN"))):
    return (await db.scalars(select(User).order_by(User.created_at.desc()))).all()

@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db), actor: User = Depends(require_roles("ADMIN"))):
    return await AuthService.register_user(db, payload, actor)

@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, payload: UserUpdateRequest, db: AsyncSession = Depends(get_db), actor: User = Depends(require_roles("ADMIN"))):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    if user.id == actor.id and payload.is_active is False:
        raise HTTPException(409, "You cannot deactivate your own account.")
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.password or payload.is_active is False:
        await db.execute(update(AuthSession).where(AuthSession.user_id == user_id).values(revoked_at=datetime.now(timezone.utc)))
    await db.commit()
    await db.refresh(user)
    return user

@router.put("/users/{user_id}/student")
async def link_student(user_id: str, payload: StudentLinkRequest, db: AsyncSession = Depends(get_db), actor: User = Depends(require_roles("ADMIN"))):
    user = await db.get(User, user_id)
    if not user or user.role != "STUDENT":
        raise HTTPException(422, "Select a student account.")
    student = await db.scalar(select(Student).where(Student.roll_number == payload.roll_number, Student.student_code == payload.student_code))
    if not student:
        raise HTTPException(404, "No student matches that roll number and student code.")
    link = await db.get(UserStudentLink, user_id)
    if link:
        link.student_id = student.id
    else:
        db.add(UserStudentLink(user_id=user_id, student_id=student.id))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Student is already linked to another account.")
    return {"student_id": student.id}

@router.get("/my-attendance")
async def my_attendance(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    link = await db.get(UserStudentLink, user.id)
    student = await db.get(Student, link.student_id) if link else None
    if student is None:
        return {"linked": False, "items": []}
    details = await db.get(StudentPortalDetails, student.id)
    mobile = details.mobile_number if details else None
    masked_mobile = None
    if mobile and mobile.isascii() and mobile.isdecimal() and len(mobile) == 10:
        masked_mobile = f"{mobile[:2]}****{mobile[-4:]}"
    profile = {
        "display_name": f"{student.first_name} {student.last_name}".strip(),
        "name": details.roster_name if details and details.roster_name else f"{student.first_name} {student.last_name}",
        "student_id": user.username,
        "student_pid": student.student_code,
        "roll_number": student.roll_number,
        "department": student.department,
        "class_name": student.class_name,
        "section": student.section,
        "admission_academic_year": details.admission_academic_year if details else None,
        "academic_year_range": _COMP_B_ACADEMIC_YEARS.get(user.username[:3]) if details else None,
        "branch": details.branch if details else None,
        "current_semester": details.current_semester if details else None,
        "email": details.college_email if details else student.email,
        "mobile_number": masked_mobile,
        "discipline": details.discipline if details else None,
    }
    rows = (await db.execute(select(AttendanceRecord, AttendanceSession).join(AttendanceSession).where(AttendanceRecord.student_id == link.student_id).order_by(AttendanceSession.scheduled_date.desc()))).all()
    return {"linked": True, "profile": profile, "items": [{"id": r.id, "date": s.scheduled_date, "subject": s.subject, "start_time": s.start_time, "end_time": s.end_time, "status": r.status, "remarks": r.remarks} for r, s in rows]}
