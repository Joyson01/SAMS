import asyncio
import io
from datetime import timedelta
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.security import _create_token, decode_access_token, get_current_user, get_optional_user
from backend.app.database.session import get_db
from backend.app.models.entities import AttendanceRecord, AttendanceSession, FaceProfile, Student, User
from backend.app.services import face_recognition_service
from backend.app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/phone-attendance", tags=["Phone Attendance"])
PAIRING_TYPE = "attendance_capture"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
recognition_slots = asyncio.Semaphore(2)


def check_staff(user: User) -> None:
    if user.role not in {"ADMIN", "FACULTY", "OPERATOR"}:
        raise HTTPException(403, "A staff account is required for attendance.")


async def active_session(db: AsyncSession, session_id: str) -> AttendanceSession:
    session = await db.get(AttendanceSession, session_id)
    if session is None:
        raise HTTPException(404, "Attendance session not found.")
    if session.status != "ACTIVE":
        raise HTTPException(409, "This attendance session is no longer open for capture.")
    return session


@router.post("/{session_id}/pair")
async def pair_phone(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    check_staff(user)
    await active_session(db, session_id)
    return {"token": _create_token({"session_id": session_id}, timedelta(minutes=15), PAIRING_TYPE)}


def recognize_image(data: bytearray, gallery: dict[str, np.ndarray]) -> list:
    try:
        with Image.open(io.BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as photo:
            if photo.width * photo.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "This photo is too large. Use a photo under 16 megapixels.")
            rgb = np.asarray(ImageOps.exif_transpose(photo).convert("RGB"))
            image = np.ascontiguousarray(rgb[:, :, ::-1])
    except Image.DecompressionBombError:
        raise HTTPException(413, "This photo is too large. Use a photo under 16 megapixels.")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, "This photo could not be opened. Try a JPEG, PNG, or WebP.")
    return face_recognition_service.recognize_frame(
        frame=image, threshold=settings.KNOWN_THRESHOLD, roster_gallery=gallery,
    )


@router.post("/{session_id}/capture")
async def capture(
    session_id: str,
    request: Request,
    pairing: Optional[str] = Header(None, alias="X-Attendance-Pairing"),
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    if pairing:
        claims = decode_access_token(pairing)
        if claims.get("type") != PAIRING_TYPE or claims.get("session_id") != session_id:
            raise HTTPException(403, "This pairing link is for another session.")
    else:
        if user is None:
            raise HTTPException(401, "Sign in or pair your phone to take attendance.")
        check_staff(user)

    session = await active_session(db, session_id)
    student_query = select(Student.id).where(
        Student.class_name == session.class_name, Student.status == "ACTIVE",
    )
    profiles = await db.scalars(
        select(FaceProfile).where(FaceProfile.student_id.in_(student_query))
        .order_by(FaceProfile.quality_score.desc(), FaceProfile.created_at.desc())
    )
    gallery: dict[str, np.ndarray] = {}
    for profile in profiles:
        if profile.student_id not in gallery and len(profile.embedding_data) == 512:
            vector = np.asarray(profile.embedding_data, dtype=np.float32)
            norm = np.linalg.norm(vector)
            if np.isfinite(norm) and norm > 0:
                gallery[profile.student_id] = vector / norm
    await db.rollback()
    if recognition_slots.locked():
        raise HTTPException(429, "The scanner is busy. Wait a moment and try again.")
    async with recognition_slots:
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_IMAGE_BYTES:
                raise HTTPException(413, "This photo is too large. Use a photo under 8 MB.")
            data.extend(chunk)
        if not data:
            raise HTTPException(400, "Choose a photo to continue.")
        detections = await asyncio.to_thread(recognize_image, data, gallery)
    # Recognition runs outside the transaction. Claim the session row before
    # checking records so finalization and simultaneous captures serialize.
    await AttendanceService.lock_session(db, session_id)
    if pairing:
        decode_access_token(pairing)
    session = await active_session(db, session_id)
    eligible = set((await db.scalars(student_query)).all())
    records = {
        record.student_id: record for record in (
            await db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == session.id))
        ).all()
    }
    marked = 0
    recognized = set()
    for face in detections:
        student_id = face.get("student_id")
        similarity = face.get("similarity", 0)
        if (
            student_id not in eligible or student_id in recognized
            or not face.get("is_recognized") or similarity < settings.KNOWN_THRESHOLD
        ):
            continue
        recognized.add(student_id)
        existing = records.get(student_id)
        if existing is not None:
            if existing.status != "REVIEW_REQUIRED" or existing.source == "MANUAL":
                continue
            existing.status = "PRESENT"
            existing.source = "PHONE_CAPTURE"
            existing.confidence = similarity
            existing.liveness_score = 0.0
            existing.verification_metadata = {"liveness_checked": False}
        else:
            db.add(AttendanceRecord(
                session_id=session.id, student_id=student_id, status="PRESENT",
                source="PHONE_CAPTURE", confidence=similarity,
                liveness_score=0.0, verification_metadata={"liveness_checked": False},
            ))
        marked += 1
    await db.commit()
    return {"marked": marked, "recognized": len(recognized), "faces": len(detections)}
