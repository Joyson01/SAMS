from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
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

router = APIRouter(prefix="/attendance", tags=["Attendance Management"])


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
    camera_id: Optional[str] = Form(None, description="Camera ID to capture frame from directly"),
    frame_url: Optional[str] = Form(None, description="URL of previously captured frame"),
    threshold: float = Form(0.40, description="Recognition threshold"),
    min_face_size: int = Form(60, description="Minimum face bounding box dimension in pixels"),
    min_detection_confidence: float = Form(0.50, description="Minimum face detection confidence score"),
    image: Optional[UploadFile] = File(None, description="Captured/Uploaded classroom photo"),
    file: Optional[UploadFile] = File(None, description="Captured/Uploaded classroom photo alias"),
    photo: Optional[UploadFile] = File(None, description="Captured/Uploaded classroom photo alias"),
    frame: Optional[UploadFile] = File(None, description="Captured camera frame alias"),
    db: AsyncSession = Depends(get_db),
):
    import time
    import uuid
    import traceback
    import cv2
    import numpy as np
    from pathlib import Path
    from backend.app.models.entities import AttendanceSession, Camera
    from backend.app.services.face_recognition_service import recognize_frame, load_and_orient_image
    from backend.app.services.camera_service import CameraService
    from backend.app.database import sqlite_adapter

    t0 = time.perf_counter()

    target_session_id = session_id or sessionId
    if not target_session_id or target_session_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select an attendance session before recognizing photo.",
        )

    # 1. Validate Session
    from sqlalchemy import select
    sess_res = await db.execute(
        select(AttendanceSession).where(AttendanceSession.id == target_session_id.strip())
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
        image_bytes = await upload_file.read()
        if len(image_bytes) > 0:
            img_cv = load_and_orient_image(image_bytes)

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
            img_cv = await asyncio.to_thread(CameraService.capture_camera_frame, camera_id, camera_obj=cam_model)

    if img_cv is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid photo or camera frame available. Please capture a photo or select an active camera stream.",
        )

    try:
        # 3. Resolve eligible students for the session's class
        from backend.app.services.class_service import ClassService
        eligible_students = []
        if sess_obj.class_id:
            eligible_students = await ClassService.get_eligible_students(db, sess_obj.class_id)
        eligible_student_ids = [s.id for s in eligible_students] if eligible_students else None

        # 4. Detect and recognize all faces using InsightFace buffalo_l
        detections = recognize_frame(
            frame=img_cv,
            threshold=threshold,
            min_face_size=min_face_size,
            min_detection_confidence=min_detection_confidence,
            eligible_student_ids=eligible_student_ids,
        )

        student_names = sqlite_adapter.get_all_students()

        results_list = []
        seen_student_ids = set()
        students_recognized_count = 0
        attendance_marked_count = 0
        duplicates_skipped_count = 0
        unknown_faces_count = 0

        annotated_image = img_cv.copy()

        for d in detections:
            bbox = d["bbox"]
            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            box_w = max(0, x2 - x1)
            box_h = max(0, y2 - y1)
            st_id = d.get("student_id")
            sim = float(d.get("similarity", 0.0))
            is_quality_valid = d.get("is_quality_valid", True)
            is_walk_in = d.get("is_walk_in", False)
            status_str = str(d.get("status", "unknown"))
            is_rec = bool((status_str.lower() in ["recognized", "verified", "verified_walk_in"] or d.get("is_recognized")) and st_id)

            # Check in-frame duplicate
            if is_rec and st_id:
                if st_id in seen_student_ids:
                    is_rec = False
                    status_str = "duplicate_in_frame"
                else:
                    seen_student_ids.add(st_id)

            if is_rec and st_id:
                students_recognized_count += 1
                st_details = sqlite_adapter.get_student_details(st_id)
                st_name = st_details["name"] if st_details else student_names.get(st_id, st_id)
                st_code = st_details["student_code"] if st_details else ""
                st_roll = st_details["roll_number"] if st_details else ""

                # Duplicate protection check against database
                already_marked = sqlite_adapter.is_marked_present(st_id, target_session_id.strip())
                attendance_marked = False

                if already_marked:
                    duplicates_skipped_count += 1
                    status_str = "already_marked"
                    box_color = (255, 140, 0)  # Blue/Sky for already marked
                    label = f"{st_name} ({sim*100:.0f}%) [ALREADY MARKED]"
                else:
                    from backend.app.core.config import settings
                    determined_status = "PRESENT"
                    if sim < settings.KNOWN_THRESHOLD:
                        determined_status = "REVIEW_REQUIRED"
                        
                    mark_res = sqlite_adapter.mark_attendance(
                        student_id=st_id,
                        session_id=target_session_id.strip(),
                        status=determined_status,
                        confidence=sim,
                        source="IP_CAMERA" if camera_id else "PHOTO_CAPTURE",
                        remarks=f"Photo Attendance ({sim*100:.1f}%)",
                    )
                    if mark_res.get("success") and mark_res.get("attendanceMarked"):
                        attendance_marked = True
                        attendance_marked_count += 1
                        if determined_status == "PRESENT":
                            box_color = (0, 200, 0)  # Green
                            label = f"{st_name} ({sim*100:.0f}%) [PRESENT]"
                        else:
                            box_color = (0, 165, 255) # Orange
                            label = f"{st_name} ({sim*100:.0f}%) [REVIEW]"
                            status_str = "review_required"
                    elif mark_res.get("alreadyPresent"):
                        already_marked = True
                        duplicates_skipped_count += 1
                        status_str = "already_marked"
                        box_color = (255, 140, 0)
                        label = f"{st_name} ({sim*100:.0f}%) [ALREADY MARKED]"
                    else:
                        box_color = (0, 200, 0)
                        label = f"{st_name} ({sim*100:.0f}%)"

                results_list.append({
                    "student_id": str(st_id),
                    "name": str(st_name),
                    "student_name": str(st_name),
                    "student_code": str(st_code),
                    "roll_number": str(st_roll),
                    "confidence": round(sim, 4),
                    "similarity": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": status_str,
                    "attendance_marked": bool(attendance_marked),
                    "already_present": bool(already_marked),
                    "bbox": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "x": x1,
                        "y": y1,
                        "width": box_w,
                        "height": box_h,
                    },
                })
            elif status_str == "low_quality":
                box_color = (0, 165, 255)  # Orange for low quality
                label = f"Low Quality ({d.get('quality_reason', 'blur/small')})"
                results_list.append({
                    "student_id": None,
                    "name": "Low Quality Face",
                    "student_name": "Low Quality Face",
                    "student_code": None,
                    "roll_number": None,
                    "confidence": round(sim, 4),
                    "similarity": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": "low_quality",
                    "rejection_reason": d.get("quality_reason", "Low quality face"),
                    "attendance_marked": False,
                    "already_present": False,
                    "bbox": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "x": x1,
                        "y": y1,
                        "width": box_w,
                        "height": box_h,
                    },
                })
            else:
                unknown_faces_count += 1
                box_color = (128, 128, 128)  # Slate for unknown
                label = f"Unknown ({sim*100:.0f}%)"
                results_list.append({
                    "student_id": None,
                    "name": "Unknown",
                    "student_name": "Unknown",
                    "student_code": None,
                    "roll_number": None,
                    "confidence": round(sim, 4),
                    "similarity": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": "unknown",
                    "attendance_marked": False,
                    "already_present": False,
                    "bbox": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "x": x1,
                        "y": y1,
                        "width": box_w,
                        "height": box_h,
                    },
                })

            # Draw OpenCV annotation on image
            cv2.rectangle(annotated_image, (x1, y1), (x2, y2), box_color, 2)
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            thickness = 1
            (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)
            ty = y1 - 8 if y1 - th - 8 > 0 else y1 + th + 8
            cv2.rectangle(annotated_image, (x1, ty - th - 4), (x1 + tw + 8, ty + 4), box_color, -1)
            text_color = (255, 255, 255)
            cv2.putText(annotated_image, label, (x1 + 4, ty), font, font_scale, text_color, thickness, cv2.LINE_AA)

        # 4. Save annotated image to outputs/ and processed/
        outputs_dir = Path("outputs")
        processed_dir = Path("backend/processed/images")
        outputs_dir.mkdir(parents=True, exist_ok=True)
        processed_dir.mkdir(parents=True, exist_ok=True)

        photo_id = uuid.uuid4().hex[:8]
        out_filename = f"capture_{photo_id}_detected.jpg"
        cv2.imwrite(str(outputs_dir / out_filename), annotated_image)
        cv2.imwrite(str(processed_dir / out_filename), annotated_image)

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        return {
            "success": True,
            "faces_detected": int(len(detections)),
            "students_recognized": int(students_recognized_count),
            "attendance_marked": int(attendance_marked_count),
            "duplicates_skipped": int(duplicates_skipped_count),
            "unknown_faces": int(unknown_faces_count),
            "results": results_list,
            "annotated_image_url": f"/outputs/{out_filename}",
            "processing_time_ms": float(elapsed_ms),
        }
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Photo recognition error: {str(exc)}",
        )

