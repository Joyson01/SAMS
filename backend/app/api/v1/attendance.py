from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from backend.app.core.security import require_roles, get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    AttendanceRecordResponse,
    BatchAttendanceMarkPayload,
    SessionCreate,
    SessionResponse,
    SessionRosterResponse,
    SessionUpdate,
    StudentAttendanceSummary,
)
from backend.app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/attendance", tags=["Attendance Management"], dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))])


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Attendance Session",
    description="Creates a new scheduled attendance session for a class and subject.",
)
async def create_session(
    session_in: SessionCreate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await AttendanceService.create_session(db, session_in)
    return await AttendanceService.get_session_by_id(db, session.id)


@router.get(
    "/sessions",
    response_model=List[SessionResponse],
    summary="List Attendance Sessions",
    description="Retrieves attendance sessions with optional filtering by class, subject, status, or date.",
)
async def list_sessions(
    class_name: Optional[str] = Query(None, description="Filter by class/batch"),
    subject: Optional[str] = Query(None, description="Filter by subject"),
    subject_id: Optional[str] = Query(None, description="Filter by subject ID"),
    status: Optional[str] = Query(None, description="Filter by status (SCHEDULED, ACTIVE, COMPLETED, CANCELLED)"),
    scheduled_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[SessionResponse]:
    sessions, _ = await AttendanceService.list_sessions(
        db=db,
        class_name=class_name,
        subject=subject,
        subject_id=subject_id,
        status=status,
        scheduled_date=scheduled_date,
        page=page,
        page_size=page_size,
    )
    return sessions


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get Session Details",
    description="Retrieves session details along with current aggregate attendance metrics.",
)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return await AttendanceService.get_session_by_id(db, session_id)


@router.put(
    "/sessions/{session_id}/start",
    response_model=SessionResponse,
    summary="Start Session",
    description="Activates an attendance session, opening it for live recognition and marking.",
)
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return await AttendanceService.start_session(db, session_id)


@router.put(
    "/sessions/{session_id}/close",
    response_model=SessionResponse,
    summary="Close Session & Mark Absentees",
    description="Completes an attendance session and auto-marks all remaining enrolled students in that class as ABSENT.",
)
async def close_session(
    session_id: str,
    auto_mark_absent: bool = Query(True, description="Whether to automatically populate ABSENT records for unverified class students"),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    res = await AttendanceService.close_session(db, session_id, auto_mark_absent=auto_mark_absent)
    from backend.app.services.recognition_service import RecognitionService
    RecognitionService.reset_stream_state(session_id=session_id)
    return res


@router.post(
    "/sessions/{session_id}/mark",
    response_model=AttendanceRecordResponse,
    summary="Mark Student Attendance",
    description="Marks attendance for a student with deduplication protection (updating timestamps on subsequent sightings).",
)
async def mark_attendance(
    session_id: str,
    payload: AttendanceMarkPayload,
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.mark_attendance(db, session_id, payload)


@router.post(
    "/sessions/{session_id}/batch-mark",
    response_model=List[AttendanceRecordResponse],
    summary="Batch Mark Attendance",
    description="Atomically marks attendance for multiple verified student tracks.",
)
async def batch_mark_attendance(
    session_id: str,
    payload: BatchAttendanceMarkPayload,
    db: AsyncSession = Depends(get_db),
) -> List[AttendanceRecordResponse]:
    results = []
    for item in payload.records:
        rec = await AttendanceService.mark_attendance(db, session_id, item)
        results.append(rec)
    return results


@router.get(
    "/sessions/{session_id}/records",
    response_model=List[AttendanceRecordResponse],
    summary="Get Session Attendance Records",
    description="Lists all marked attendance records for a specific session.",
)
async def get_session_records(
    session_id: str,
    status: Optional[str] = Query(None, description="Filter by status (PRESENT, LATE, ABSENT, MANUAL_PRESENT, MANUAL_ABSENT)"),
    db: AsyncSession = Depends(get_db),
) -> List[AttendanceRecordResponse]:
    return await AttendanceService.get_session_records(db, session_id, status=status)


@router.post(
    "/manual",
    response_model=AttendanceRecordResponse,
    summary="Record Manual Attendance or Excused Absence",
    description="Directly marks a student attendance status manually (e.g. EXCUSED with reason or manual roll call).",
)
async def mark_manual_attendance(
    session_id: str = Query(..., description="Session ID"),
    student_id: str = Query(..., description="Student ID"),
    status: str = Query("PRESENT", description="Status (PRESENT, ABSENT, LATE, EXCUSED)"),
    remarks: str = Query("Manual Attendance", description="Optional remarks or leave reason"),
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.mark_manual_attendance(
        db=db,
        session_id=session_id,
        student_id=student_id,
        status=status,
        remarks=remarks,
    )


@router.put(
    "/records/{record_id}/override",
    response_model=AttendanceRecordResponse,
    summary="Manual Attendance Override",
    description="Manually modifies an attendance record status and logs the modification with an audit trail note.",
)
async def override_record(
    record_id: str,
    override_in: AttendanceOverridePayload,
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.override_record(db, record_id, override_in)


@router.get(
    "/sessions/{session_id}/presence",
    summary="Get Live Presence Status for Session",
    description="Returns real-time student visibility states (VISIBLE, TEMPORARILY_NOT_VISIBLE, NOT_CURRENTLY_VISIBLE) without altering attendance records.",
)
async def get_session_presence(
    session_id: str,
):
    from backend.app.services.presence_service import presence_manager
    return presence_manager.get_session_presence(session_id)


@router.get(
    "/sessions/{session_id}/roster",
    response_model=SessionRosterResponse,
    summary="Get Complete Live Class Roster for Session",
    description="Returns the complete enrolled class roster merged with real-time attendance and camera presence tracking states.",
)
async def get_session_roster(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionRosterResponse:
    return await AttendanceService.get_session_roster(db, session_id)


@router.get(
    "/students/{student_id}",
    response_model=StudentAttendanceSummary,
    summary="Get Student Attendance History",
    description="Retrieves a student's full attendance history and attendance percentage.",
)
async def get_student_attendance(
    student_id: str,
    db: AsyncSession = Depends(get_db),
):
    return await AttendanceService.get_student_attendance_history(db, student_id)


@router.post(
    "/recognize-frame",
    summary="Recognize Faces and Mark Attendance from Camera Frame",
    description="Processes captured camera frame or image file using InsightFace buffalo_l, checks quality, matches student embeddings, prevents duplicate attendance, annotates bounding boxes, and records attendance in the database.",
)
@router.post(
    "/recognize-image",
    summary="Recognize Faces and Mark Attendance from Captured/Uploaded Photo",
    description="Processes classroom photo using InsightFace buffalo_l, checks quality, compares normalized embeddings, prevents duplicates, marks attendance, generates annotated photo, and returns structured results.",
)
async def recognize_frame_or_image_attendance(
    session_id: Optional[str] = Form(None, description="Attendance session ID"),
    sessionId: Optional[str] = Form(None, description="Attendance session ID alias"),
    camera_id: Optional[str] = Form(
        None, description="Camera ID to capture frame from directly"
    ),
    frame_url: Optional[str] = Form(
        None, description="URL of previously captured frame"
    ),
    threshold: float = Form(0.40, description="Recognition threshold"),
    min_face_size: int = Form(
        35, description="Minimum face bounding box dimension in pixels"
    ),
    min_detection_confidence: float = Form(
        0.50, description="Minimum face detection confidence score"
    ),
    image: Optional[UploadFile] = File(
        None, description="Captured/Uploaded classroom photo"
    ),
    file: Optional[UploadFile] = File(
        None, description="Captured/Uploaded classroom photo alias"
    ),
    photo: Optional[UploadFile] = File(
        None, description="Captured/Uploaded classroom photo alias"
    ),
    frame: Optional[UploadFile] = File(None, description="Captured camera frame alias"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    import cv2
    from backend.app.services.photo_attendance_service import decode_photo
    from pathlib import Path
    from backend.app.models.entities import AttendanceSession, Camera
    from backend.app.services.camera_service import CameraService

    target_session_id = session_id or sessionId
    if not target_session_id or target_session_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select an attendance session before recognizing photo.",
        )

    # 1. Validate Session
    from sqlalchemy import select

    sess_res = await db.execute(
        select(AttendanceSession).where(
            AttendanceSession.id == target_session_id.strip()
        )
    )
    sess_obj = sess_res.scalars().first()
    if not sess_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance session '{target_session_id}' not found.",
        )

    if sess_obj.status in ["COMPLETED", "CANCELLED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance session '{target_session_id}' has already been {sess_obj.status} and is locked against further recognition.",
        )

    # 2. Acquire Image Buffer from Upload, frame_url, or Camera
    img_cv = None
    upload_file = image or file or photo or frame

    if upload_file is not None:
        image_bytes = await upload_file.read(15 * 1024 * 1024 + 1)
        if len(image_bytes) > 0:
            img_cv = decode_photo(image_bytes)

    if img_cv is None and frame_url:
        clean_url = frame_url.lstrip("/")
        filename = Path(clean_url).name
        possible_paths = [
            Path(clean_url),
            Path.cwd() / clean_url,
            Path(__file__).resolve().parents[4] / clean_url,
            Path("outputs") / filename,
            Path.cwd() / "outputs" / filename,
        ]
        for p in possible_paths:
            if p.is_file():
                img_cv = cv2.imread(str(p))
                if img_cv is not None:
                    break

    if img_cv is None and camera_id:
        cam_model = await db.get(Camera, camera_id)
        if cam_model:
            img_cv = await asyncio.to_thread(
                CameraService.capture_camera_frame, camera_id, camera_obj=cam_model
            )

    if img_cv is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid photo or camera frame available. Please capture a photo or select an active camera stream.",
        )

    from backend.app.services.photo_attendance_service import legacy_photo

    ok, encoded = cv2.imencode(".jpg", img_cv)
    if not ok:
        raise HTTPException(400, "Invalid photo")
    response = await legacy_photo(
        db,
        target_session_id.strip(),
        encoded.tobytes(),
        upload_file.filename if upload_file else "capture.jpg",
        user,
    )
    result = response.model_dump()
    result.update(
        students_recognized=response.recognized_count,
        attendance_marked=response.attendance_marked_count,
        duplicates_skipped=response.duplicates_prevented,
        unknown_faces=response.unknown_count,
    )
    return result
