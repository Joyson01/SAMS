"""Two-step classroom photo attendance API."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import get_current_user
from backend.app.core.teacher_access import require_class_access, require_session_access
from backend.app.database.session import get_db
from backend.app.models.entities import User
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.photo_attendance_service import build_preview
from backend.app.schemas.media_attendance import (
    PhotoPreviewResponse,
    PhotoConfirmResponse,
)

router = APIRouter(prefix="/media-attendance/image", tags=["Photo Attendance"])


class PhotoSelection(BaseModel):
    student_id: str
    face_ref: str = Field(max_length=4096)


class PhotoConfirmation(BaseModel):
    session_id: str
    selections: list[PhotoSelection] = Field(min_length=1, max_length=500)


def staff(user):
    if user.role not in {"ADMIN", "FACULTY", "OPERATOR"}:
        raise HTTPException(403, "Staff account required")


@router.post("/preview", response_model=PhotoPreviewResponse)
async def preview(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    staff(user)
    # Bound the actual multipart stream, including file data, before it can spool.
    received = 0

    async def limited_receive():
        nonlocal received
        message = await request.receive()
        received += len(message.get("body", b""))
        if received > 46 * 1024 * 1024:
            raise HTTPException(413, "Total photo upload exceeds 46 MB")
        return message

    limited = Request(request.scope, receive=limited_receive)
    async with limited.form(max_files=3, max_fields=2) as form:
        session_id = form.get("session_id")
        images = form.getlist("images")
        if not isinstance(session_id, str) or not 1 <= len(images) <= 3:
            raise HTTPException(400, "Select a session and one to three photos")
        await require_session_access(db, user, session_id)
        uploads = []
        for image in images:
            if not hasattr(image, "read"):
                raise HTTPException(400, "Expected image files")
            data = await image.read(15 * 1024 * 1024 + 1)
            if len(data) > 15 * 1024 * 1024:
                raise HTTPException(413, "Each photo must be at most 15 MB")
            uploads.append(data)
        return await build_preview(db, session_id, uploads, user)


@router.post("/confirm", response_model=PhotoConfirmResponse)
async def confirm(
    payload: PhotoConfirmation,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    staff(user)
    await require_session_access(db, user, payload.session_id)
    try:
        return await AttendanceService.confirm_photo_attendance(
            db, payload.session_id, payload.selections, user.id
        )
    except Exception:
        await db.rollback()
        raise


@router.get("/batches")
async def batches(
    class_name: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from backend.app.models.entities import Batch, ClassSection

    staff(user)
    if user.role == "FACULTY":
        class_id = await db.scalar(select(ClassSection.id).where(ClassSection.name == class_name))
        await require_class_access(db, user, class_id)
    rows = (
        await db.scalars(
            select(Batch)
            .join(ClassSection, ClassSection.id == Batch.class_id)
            .where(ClassSection.name == class_name)
        )
    ).all()
    return [{"id": row.id, "name": row.name} for row in rows]
