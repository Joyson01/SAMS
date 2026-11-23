"""Student-owned attendance and enrollment requests with administrator review."""
import asyncio
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from backend.app.core.security import require_roles
from backend.app.database.session import get_db
from backend.app.models.entities import (
    AttendanceRecord, AttendanceSession, Batch, ClassSection, FaceProfile, Student, StudentPortalRequest, TimetableEntry,
    User, UserStudentLink,
)
from backend.app.schemas.attendance import AttendanceOverridePayload
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.enrollment_service import POSE_HINTS, check_image, enroll, matches_template, required_poses

router = APIRouter(prefix="/student-portal", tags=["Student Portal"])
student_only = require_roles("STUDENT")
admin_only = require_roles("ADMIN")
MAX_PHOTO_SIZE = 2 * 1024 * 1024
ATTENDANCE_REQUEST_KINDS = ("CORRECTION", "LEAVE", "MEDICAL", "ON_DUTY")
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=1000)]


class CorrectionRequest(BaseModel):
    record_id: str = Field(min_length=1, max_length=36)
    requested_status: Literal["PRESENT", "ABSENT", "LATE", "EXCUSED"]
    reason: Note
    kind: Literal["CORRECTION", "LEAVE", "MEDICAL", "ON_DUTY"] = "CORRECTION"


class ReviewRequest(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    note: Note


async def linked_student(db: AsyncSession, user: User) -> str:
    student_id = await db.scalar(select(UserStudentLink.student_id).where(UserStudentLink.user_id == user.id))
    if student_id is None:
        raise HTTPException(404, "Your account has no linked student record.")
    return student_id


def request_data(request: StudentPortalRequest) -> dict:
    return {
        "id": request.id,
        "kind": request.kind,
        "status": request.status,
        "record_id": request.record_id,
        "requested_status": request.requested_status,
        "reason": request.reason,
        "pose": request.pose,
        "review_note": request.review_note,
        "created_at": request.created_at,
    }


async def save_request(db: AsyncSession, request: StudentPortalRequest) -> dict:
    db.add(request)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "A request for this item is already pending.") from exc
    return request_data(request)


@router.get("/timetable")
async def student_timetable(db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    student = await db.get(Student, await linked_student(db, user))
    if student is None or student.status != "ACTIVE":
        raise HTTPException(403, "An active student record is required to view your timetable.")
    class_id = await db.scalar(select(ClassSection.id).where(
        ClassSection.name == student.class_name, ClassSection.department == student.department,
        ClassSection.section == student.section, ClassSection.status == "ACTIVE",
    ))
    if class_id is None:
        raise HTTPException(409, "Ask your administrator to check your class assignment.")
    batch = await db.scalar(select(Batch).where(Batch.id == student.batch_id, Batch.class_id == class_id))
    legacy_batch = func.upper(func.trim(func.coalesce(TimetableEntry.batch, "")))
    visible = and_(TimetableEntry.batch_id.is_(None), legacy_batch.in_(("", "ALL")))
    if batch:
        visible = or_(visible, TimetableEntry.batch_id == batch.id,
                      and_(TimetableEntry.batch_id.is_(None), legacy_batch == batch.name.strip().upper()))
    rows = await db.execute(select(
        TimetableEntry.id, TimetableEntry.day_of_week, TimetableEntry.start_time,
        TimetableEntry.end_time, TimetableEntry.label, TimetableEntry.room,
    ).where(TimetableEntry.class_id == class_id, TimetableEntry.status == "ACTIVE", visible)
     .order_by(TimetableEntry.start_time, TimetableEntry.end_time, TimetableEntry.label, TimetableEntry.id))
    return {"class_name": student.class_name, "batch": batch.name if batch else None,
            "entries": rows.mappings().all()}


@router.get("/requests")
async def student_requests(db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    sid = await linked_student(db, user)
    requests = (await db.scalars(
        select(StudentPortalRequest).options(defer(StudentPortalRequest.photo))
        .where(StudentPortalRequest.student_id == sid, StudentPortalRequest.requested_by == user.id,
               StudentPortalRequest.kind.in_(ATTENDANCE_REQUEST_KINDS))
        .order_by(StudentPortalRequest.created_at.desc())
    )).all()
    poses = (await db.scalars(select(FaceProfile.pose_type).where(FaceProfile.student_id == sid).distinct())).all()
    return {
        "items": [request_data(req) for req in requests],
        "existing_poses": poses, "required_poses": required_poses(), "hints": POSE_HINTS,
    }


@router.post("/corrections", status_code=201)
async def submit_correction(
    payload: CorrectionRequest, db: AsyncSession = Depends(get_db), user: User = Depends(student_only),
):
    sid = await linked_student(db, user)
    record = await db.get(AttendanceRecord, payload.record_id)
    if record is None or record.student_id != sid:
        raise HTTPException(404, "Attendance record not found.")
    if payload.kind != "CORRECTION" and (
        payload.requested_status != "EXCUSED" or record.status not in {"ABSENT", "MANUAL_ABSENT"}
    ):
        raise HTTPException(422, "Leave requests can excuse an existing absence.")
    if record.status.removeprefix("MANUAL_") == payload.requested_status:
        raise HTTPException(422, "Choose a status different from the recorded mark.")
    return await save_request(db, StudentPortalRequest(
        student_id=sid, requested_by=user.id, kind=payload.kind,
        pending_key=f"record:{record.id}", record_id=record.id,
        requested_status=payload.requested_status, reason=payload.reason,
    ))


@router.post("/face", status_code=201)
async def submit_face(
    pose: str = Form(...), file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), user: User = Depends(student_only),
):
    sid = await linked_student(db, user)
    data = await file.read(MAX_PHOTO_SIZE + 1)
    if len(data) > MAX_PHOTO_SIZE:
        raise HTTPException(413, "Upload a JPEG under 2 MB.")
    if not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
        raise HTTPException(422, "Capture or upload a JPEG image.")
    result = await enroll(db, sid, data, pose, self_enrollment=True)
    if not result["success"]:
        raise HTTPException(422, result["message"])
    return result


@router.post("/face/check")
async def check_face_pose(
    pose: str = Form(...), file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), user: User = Depends(student_only),
):
    await linked_student(db, user)
    data = await file.read(MAX_PHOTO_SIZE + 1)
    if len(data) > MAX_PHOTO_SIZE:
        raise HTTPException(413, "Upload a JPEG under 2 MB.")
    result, _ = await asyncio.to_thread(check_image, data, pose)
    return result


@router.post("/face/match")
async def test_face_match(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), user: User = Depends(student_only),
):
    sid = await linked_student(db, user)
    templates = (await db.scalars(select(FaceProfile.embedding_data).where(FaceProfile.student_id == sid))).all()
    if not templates:
        raise HTTPException(409, "Register a face before checking for a match.")
    data = await file.read(MAX_PHOTO_SIZE + 1)
    if len(data) > MAX_PHOTO_SIZE:
        raise HTTPException(413, "Upload a JPEG under 2 MB.")
    result, embedding = await asyncio.to_thread(check_image, data, "FRONT", True, match_test=True)
    if embedding is None:
        raise HTTPException(422, result["hint"])
    return {"matched": any(matches_template(embedding, stored) for stored in templates)}


@router.get("/review")
async def review_queue(db: AsyncSession = Depends(get_db), _: User = Depends(admin_only)):
    rows = (await db.execute(
        select(StudentPortalRequest, Student, AttendanceRecord.status, AttendanceSession.subject, AttendanceSession.scheduled_date)
        .options(defer(StudentPortalRequest.photo))
        .join(Student, StudentPortalRequest.student_id == Student.id)
        .outerjoin(AttendanceRecord, StudentPortalRequest.record_id == AttendanceRecord.id)
        .outerjoin(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .where(StudentPortalRequest.status == "PENDING", StudentPortalRequest.kind.in_(ATTENDANCE_REQUEST_KINDS))
        .order_by(StudentPortalRequest.created_at, StudentPortalRequest.id).limit(100)
    )).all()
    return [{
        **request_data(req), "student_name": f"{student.first_name} {student.last_name}",
        "student_pid": student.student_code, "current_status": status, "subject": subject, "date": date,
    } for req, student, status, subject, date in rows]


async def claim_review(db: AsyncSession, request: StudentPortalRequest, payload: ReviewRequest, admin_id: str):
    claimed = await db.execute(
        update(StudentPortalRequest)
        .where(StudentPortalRequest.id == request.id, StudentPortalRequest.status == "PENDING")
        .values(
            status=payload.decision, pending_key=None, reviewed_by=admin_id, photo=None,
            review_note=payload.note, reviewed_at=datetime.now(timezone.utc),
        ).returning(StudentPortalRequest.id)
    )
    if claimed.scalar_one_or_none() is None:
        raise HTTPException(409, "This request is no longer pending.")


@router.post("/review/{request_id}")
async def review_request(
    request_id: str, payload: ReviewRequest,
    db: AsyncSession = Depends(get_db), admin: User = Depends(admin_only),
):
    request = await db.get(StudentPortalRequest, request_id)
    if request is None or request.status != "PENDING" or request.kind not in ATTENDANCE_REQUEST_KINDS:
        raise HTTPException(409, "This request is no longer pending.")

    async def claim():
        await claim_review(db, request, payload, admin.id)

    await claim()
    if payload.decision == "APPROVED":
        await AttendanceService.override_record(
            db, request.record_id,
            AttendanceOverridePayload(status=request.requested_status, remarks=payload.note),
            user_id=admin.id,
        )
    return request_data(request)
