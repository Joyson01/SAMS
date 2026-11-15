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
from backend.app.services.phone_capture_service import (
    assess_capture, normalize_embedding, select_candidates,
)

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


def recognize_image(data: bytearray, gallery: dict[str, np.ndarray]) -> tuple[list, str]:
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
    detections = face_recognition_service.recognize_frame(
        frame=image, threshold=settings.KNOWN_THRESHOLD, roster_gallery=gallery, return_embedding=True,
    )
    for face in detections:
        embedding = face.pop("embedding", None)
        if embedding is None or len(gallery) < 2:
            continue
        query = normalize_embedding(embedding)
        if query is None:
            continue
        scores = sorted((float(np.dot(vector, query)) for vector in gallery.values()), reverse=True)
        face["second_similarity"] = scores[1]
    return detections, assess_capture(image, detections).code


@router.post("/{session_id}/capture")
async def capture(
    session_id: str,
    request: Request,
    pairing: Optional[str] = Header(None, alias="X-Attendance-Pairing"),
    capture_mode: str = Header("photo", alias="X-Capture-Mode"),
    scanner_id: str = Header("default", alias="X-Scanner-ID"),
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
            vector = normalize_embedding(profile.embedding_data)
            if vector is not None:
                gallery[profile.student_id] = vector
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
        result = await asyncio.to_thread(recognize_image, data, gallery)
        if isinstance(result, tuple):
            detections, quality = result
        else:  # Keeps injected recognition fakes small in race tests.
            detections, quality = result, "USABLE"
    candidates, review_ids = select_candidates(detections, settings.KNOWN_THRESHOLD)
    if quality != "USABLE":
        candidates = []
    accepted = candidates
    pending = 0
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
    recognized = set(candidates)
    similarities = {face.get("student_id"): face.get("similarity", 0) for face in detections}
    for student_id in accepted:
        similarity = similarities.get(student_id, 0)
        if student_id not in eligible or similarity < settings.KNOWN_THRESHOLD:
            continue
        # Candidate de-duplication happened before evidence evaluation.
        existing = records.get(student_id)
        if capture_mode.lower() == "live" and existing is None:
            db.add(AttendanceRecord(
                session_id=session.id, student_id=student_id, status="REVIEW_REQUIRED",
                source="PHONE_CAPTURE", confidence=similarity, liveness_score=0.0,
                verification_metadata={
                    "liveness_checked": False, "usable_live_frames": 1,
                    "scanner_id": scanner_id[:80],
                },
            ))
            pending += 1
            continue
        if existing is not None:
            if existing.status != "REVIEW_REQUIRED" or existing.source == "MANUAL":
                continue
            existing.status = "PRESENT"
            existing.source = "PHONE_CAPTURE"
            existing.confidence = similarity
            existing.liveness_score = 0.0
            existing.verification_metadata = {"liveness_checked": False, "usable_live_frames": 2}
        else:
            db.add(AttendanceRecord(
                session_id=session.id, student_id=student_id, status="PRESENT",
                source="PHONE_CAPTURE", confidence=similarity,
                liveness_score=0.0, verification_metadata={"liveness_checked": False},
            ))
        marked += 1
    await db.commit()
    message_code = "MARKED" if marked else (
        "PENDING_EVIDENCE" if pending else "AMBIGUOUS" if review_ids else quality
    )
    return {
        "marked": marked, "recognized": len(recognized), "pending": pending,
        "review": len(review_ids), "faces": len(detections), "quality": quality,
        "message_code": message_code,
    }
