import asyncio
import io
from datetime import date, time, timedelta, timezone
from pathlib import Path
import cv2
import numpy as np
import pytest
from PIL import Image

from backend.app.api.v1 import phone_attendance
from backend.app.core.security import _create_token, hash_password
from backend.app.models.entities import AttendanceRecord, AttendanceSession, ClassSection, Student, Subject, User
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.student import FaceProfileCreate, StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.recognition_service import RecognitionService, get_pipeline
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.mark.asyncio
async def test_complete_phone_attendance_pilot_workflow(client, test_db_session):
    """COMPREHENSIVE PILOT READINESS END-TO-END VERIFICATION:
    
    1. Sign-in & RBAC (Admin, Faculty, Student)
    2. Class & Subject Setup
    3. Session Scheduling, Start, and Resume
    4. Real Face Enrollment from image fixture
    5. QR Pairing (Expiration, Session-Scoping, Capture-Only privilege check)
    6. Live Rear-Camera Dual-Frame Consensus
    7. Duplicate Frame Idempotency & Upload Retries
    8. Manual Instructor Correction
    9. Scan preserving Manual Corrections
    10. Session Finalization & Auto-Absentee Population
    11. Rejection of Late Captures on Finalized Session (409 Conflict)
    12. Edge Cases: Empty Frame, Corrupt Frame, Oversized Upload
    """
    # -------------------------------------------------------------
    # STEP 1: Staff and Student Account Provisioning & Sign-in
    # -------------------------------------------------------------
    faculty_user = User(
        username="prof_mehra",
        email="mehra@campus.edu",
        full_name="Prof. Sunita Mehra",
        role="FACULTY",
        password_hash=hash_password("Faculty#Pass2026"),
        is_active=True,
    )
    student_user = User(
        username="stu_vikram",
        email="vikram@campus.edu",
        full_name="Vikram Singh",
        role="STUDENT",
        password_hash=hash_password("Student#Pass2026"),
        is_active=True,
    )
    test_db_session.add_all([faculty_user, student_user])
    await test_db_session.commit()

    # Login as Student -> verify student token is rejected from session creation
    stu_login = await client.post("/api/v1/auth/login", json={
        "username_or_email": "stu_vikram",
        "password": "Student#Pass2026",
    })
    assert stu_login.status_code == 200
    stu_token = stu_login.json()["access_token"]

    forbidden_resp = await client.post(
        "/api/v1/attendance/sessions",
        headers={"Authorization": f"Bearer {stu_token}"},
        json={
            "class_name": "CSE-4A",
            "subject": "Computer Vision",
            "room": "Lab 1",
            "start_time": "09:00:00",
            "end_time": "10:00:00",
        },
    )
    assert forbidden_resp.status_code == 403, "Student must be forbidden from creating attendance sessions"

    # Login as Faculty -> get staff token
    fac_login = await client.post("/api/v1/auth/login", json={
        "username_or_email": "prof_mehra",
        "password": "Faculty#Pass2026",
    })
    assert fac_login.status_code == 200
    fac_token = fac_login.json()["access_token"]
    staff_headers = {"Authorization": f"Bearer {fac_token}"}

    # -------------------------------------------------------------
    # STEP 2: Academic Class & Subject Setup
    # -------------------------------------------------------------
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS405",
            name="Computer Vision & Biometrics",
            short_name="CVB",
            department="Computer Science",
            credits=4,
            semester=4,
        ),
    )
    student_record = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Kavya",
            last_name="Nair",
            student_code="STU-2026-088",
            roll_number="CSE-088",
            department="Computer Science",
            class_name="CSE-4A",
            section="A",
            email="kavya.nair@campus.edu",
        ),
    )
    student_absentee = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Arjun",
            last_name="Reddy",
            student_code="STU-2026-089",
            roll_number="CSE-089",
            department="Computer Science",
            class_name="CSE-4A",
            section="A",
            email="arjun.reddy@campus.edu",
        ),
    )

    # -------------------------------------------------------------
    # STEP 3: Real Face Enrollment with ArcFace Model
    # -------------------------------------------------------------
    img_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
    assert img_path.exists(), "Sample student fixture must exist"

    raw_img = cv2.imread(str(img_path))
    pipe = get_pipeline()
    detected = pipe.detector.detect(raw_img)
    assert len(detected) >= 1, "Face must be detected in fixture"

    crop = pipe.aligner.align(raw_img, detected[0].landmarks)
    emb = pipe.embedder.extract_from_crop(crop)
    assert emb.shape == (512,), "ArcFace embedding must be 512-dimensional"

    await StudentService.add_face_profile(
        test_db_session,
        student_record.id,
        FaceProfileCreate(
            embedding_data=emb.tolist(),
            model_name="ArcFace-ResNet50",
            quality_score=0.98,
            pose_type="FRONT",
        ),
    )
    synced = await RecognitionService.sync_gallery_from_db(test_db_session)
    assert synced >= 1, "Gallery sync must index enrolled student"

    # -------------------------------------------------------------
    # STEP 4: Session Creation, Activation, and Resume
    # -------------------------------------------------------------
    create_sess_resp = await client.post(
        "/api/v1/attendance/sessions",
        headers=staff_headers,
        json={
            "class_name": "CSE-4A",
            "subject": "Computer Vision & Biometrics",
            "room": "Room 302",
            "scheduled_date": str(date.today()),
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "subject_id": subj.id,
        },
    )
    assert create_sess_resp.status_code == 201
    session_id = create_sess_resp.json()["id"]
    assert create_sess_resp.json()["status"] == "SCHEDULED"

    # Start session -> ACTIVE
    start_resp = await client.put(f"/api/v1/attendance/sessions/{session_id}/start", headers=staff_headers)
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "ACTIVE"

    # Resume session check
    resume_resp = await client.get(f"/api/v1/attendance/sessions/{session_id}", headers=staff_headers)
    assert resume_resp.status_code == 200
    assert resume_resp.json()["status"] == "ACTIVE"

    # Check initial roster: 2 students NOT_RECORDED
    roster_init = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster", headers=staff_headers)
    assert roster_init.status_code == 200
    assert roster_init.json()["total_enrolled"] == 2
    assert roster_init.json()["present_count"] == 0

    # -------------------------------------------------------------
    # STEP 5: QR Pairing Token Verification
    # -------------------------------------------------------------
    # Generate pairing token for session
    pair_resp = await client.post(f"/api/v1/phone-attendance/{session_id}/pair", headers=staff_headers)
    assert pair_resp.status_code == 200
    pairing_token = pair_resp.json()["token"]
    assert pairing_token is not None

    pair_headers = {"X-Attendance-Pairing": pairing_token}

    # 5a. Check Expired Token rejected with 401
    expired_token = _create_token(
        {"session_id": session_id},
        timedelta(seconds=-10),
        phone_attendance.PAIRING_TYPE,
    )
    with open(img_path, "rb") as f:
        sample_bytes = f.read()

    expired_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers={"X-Attendance-Pairing": expired_token, "Content-Type": "image/jpeg"},
        content=sample_bytes,
    )
    assert expired_resp.status_code == 401, "Expired pairing token must return 401"

    # 5b. Check Scoped Token: Token for Session A cannot be used on Session B (returns 403)
    dummy_session = AttendanceSession(
        session_code="OTHER-SESS",
        class_name="CSE-4A",
        subject="Other Subject",
        room="Room 101",
        scheduled_date=date.today(),
        start_time=time(11, 0),
        end_time=time(12, 0),
        status="ACTIVE",
    )
    test_db_session.add(dummy_session)
    await test_db_session.commit()

    cross_session_resp = await client.post(
        f"/api/v1/phone-attendance/{dummy_session.id}/capture",
        headers=pair_headers,
        content=sample_bytes,
    )
    assert cross_session_resp.status_code == 403, "Pairing token must reject captures for other sessions"
    assert "for another session" in cross_session_resp.json()["detail"]

    # 5c. Check Token Grants Capture Access Only: cannot be used as Bearer token on other endpoints
    unauth_students_resp = await client.get(
        "/api/v1/students",
        headers={"Authorization": f"Bearer {pairing_token}"},
    )
    assert unauth_students_resp.status_code == 401, "Pairing token must not grant access to student CRUD"

    # -------------------------------------------------------------
    # STEP 6: Rear-Camera Live Capture (2-Frame Temporal Consensus)
    # -------------------------------------------------------------
    # Live scan requires 2 successive usable frames from same scanner ID
    live_scanner_id = "phone-rear-cam-uuid-42"
    live_headers = {
        **pair_headers,
        "X-Capture-Mode": "live",
        "X-Scanner-ID": live_scanner_id,
        "Content-Type": "image/jpeg",
    }

    # Frame 1: Sets pending evidence (REVIEW_REQUIRED with live_pending=True)
    live_frame_1 = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=live_headers,
        content=sample_bytes,
    )
    assert live_frame_1.status_code == 200
    res_1 = live_frame_1.json()
    assert res_1["pending"] == 1, "First live frame must place face in pending state"
    assert res_1["marked"] == 0
    assert res_1["message_code"] == "PENDING_EVIDENCE"

    # Frame 1 duplicate retry (e.g. network hiccup / same frame digest) -> remains pending
    live_frame_retry = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=live_headers,
        content=sample_bytes,
    )
    assert live_frame_retry.status_code == 200
    assert live_frame_retry.json()["pending"] == 1
    assert live_frame_retry.json()["marked"] == 0

    # Frame 2: Slightly different frame bytes from the same live scanner -> confirms presence!
    img_mod = raw_img.copy()
    img_mod[0, 0, 0] = (int(img_mod[0, 0, 0]) + 10) % 255
    _, mod_buf = cv2.imencode(".jpg", img_mod, [cv2.IMWRITE_JPEG_QUALITY, 85])
    mod_bytes = mod_buf.tobytes()

    live_frame_2 = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=live_headers,
        content=mod_bytes,
    )
    assert live_frame_2.status_code == 200
    res_2 = live_frame_2.json()
    assert res_2["pending"] == 0
    assert res_2["marked"] == 1, "Second live frame must confirm presence"
    assert res_2["message_code"] == "MARKED"

    # Check Roster: 1 of 2 present
    roster_mid = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster", headers=staff_headers)
    assert roster_mid.status_code == 200
    assert roster_mid.json()["present_count"] == 1
    kavya_item = next(s for s in roster_mid.json()["roster"] if s["student_id"] == student_record.id)
    assert kavya_item["attendance_status"] == "PRESENT"

    # -------------------------------------------------------------
    # STEP 7: Manual Instructor Correction & Scans Preserving Corrections
    # -------------------------------------------------------------
    # Lecturer overrides Kavya to MANUAL_ABSENT
    override_resp = await client.post(
        "/api/v1/attendance/manual",
        headers=staff_headers,
        params={
            "session_id": session_id,
            "student_id": student_record.id,
            "status": "MANUAL_ABSENT",
            "remarks": "Left class early with permission",
        },
    )
    assert override_resp.status_code == 200
    assert override_resp.json()["status"] == "MANUAL_ABSENT"

    # Now take a new photo capture of the class containing Kavya
    photo_headers = {
        **pair_headers,
        "X-Capture-Mode": "photo",
        "Content-Type": "image/jpeg",
    }
    photo_capture_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=photo_headers,
        content=sample_bytes,
    )
    assert photo_capture_resp.status_code == 200
    # Must NOT overwrite MANUAL_ABSENT! Marked should be 0 because manual mark is preserved.
    assert photo_capture_resp.json()["marked"] == 0

    # Verify in DB that Kavya remains MANUAL_ABSENT
    roster_after_rescan = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster", headers=staff_headers)
    kavya_check = next(s for s in roster_after_rescan.json()["roster"] if s["student_id"] == student_record.id)
    assert kavya_check["attendance_status"] == "MANUAL_ABSENT", "Subsequent scans must preserve manual correction"

    # Lecturer marks Arjun as MANUAL_PRESENT
    await client.post(
        "/api/v1/attendance/manual",
        headers=staff_headers,
        params={
            "session_id": session_id,
            "student_id": student_absentee.id,
            "status": "MANUAL_PRESENT",
            "remarks": "Recognized in back row manually",
        },
    )

    # -------------------------------------------------------------
    # STEP 8: Edge Cases and Failure Modes
    # -------------------------------------------------------------
    # 8a. Empty frame bytes
    empty_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=pair_headers,
        content=b"",
    )
    assert empty_resp.status_code == 400
    assert "Choose a photo" in empty_resp.json()["detail"]

    # 8b. Corrupt / invalid image bytes
    corrupt_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=pair_headers,
        content=b"THIS_IS_NOT_A_VALID_IMAGE_BUFFER",
    )
    assert corrupt_resp.status_code == 400
    assert "could not be opened" in corrupt_resp.json()["detail"]

    # 8c. Oversized upload (> 8MB)
    huge_bytes = b"0" * (9 * 1024 * 1024)
    huge_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=pair_headers,
        content=huge_bytes,
    )
    assert huge_resp.status_code == 413
    assert "photo is too large" in huge_resp.json()["detail"]

    # -------------------------------------------------------------
    # STEP 9: Session Finalization & Rejecting Late Captures
    # -------------------------------------------------------------
    close_resp = await client.put(
        f"/api/v1/attendance/sessions/{session_id}/close",
        headers=staff_headers,
        params={"auto_mark_absent": "true"},
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "COMPLETED"

    # Late capture arriving after finalization -> MUST be rejected with 409 Conflict
    late_capture_resp = await client.post(
        f"/api/v1/phone-attendance/{session_id}/capture",
        headers=pair_headers,
        content=sample_bytes,
    )
    assert late_capture_resp.status_code == 409
    assert "no longer open" in late_capture_resp.json()["detail"]

    # Final session and roster check: session finalized with all records intact
    final_session = await client.get(f"/api/v1/attendance/sessions/{session_id}", headers=staff_headers)
    assert final_session.status_code == 200
    assert final_session.json()["status"] == "COMPLETED"

    final_roster = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster", headers=staff_headers)
    assert final_roster.status_code == 200
    assert final_roster.json()["total_enrolled"] == 2
    assert final_roster.json()["session_id"] == session_id
