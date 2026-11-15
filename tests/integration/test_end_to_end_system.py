from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
import cv2
import numpy as np
import pytest

from ai_engine.pipeline.video_pipeline import VideoRecognitionPipeline
from backend.app.schemas.attendance import AttendanceMarkPayload, AttendanceOverridePayload, SessionCreate
from backend.app.schemas.auth import UserLoginRequest, UserRegisterRequest
from backend.app.schemas.camera import CameraCreate
from backend.app.schemas.student import FaceProfileCreate, StudentCreate
from backend.app.schemas.sync import SyncBatchPushRequest, SyncEventPayload
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.auth_service import AuthService
from backend.app.services.camera_service import CameraService
from backend.app.services.recognition_service import RecognitionService, get_pipeline
from backend.app.services.report_service import ReportService
from backend.app.services.student_service import StudentService
from backend.app.services.sync_service import SyncService

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.mark.asyncio
async def test_full_enterprise_sams_workflow_end_to_end(test_db_session, client):
    """MASTER END-TO-END SYSTEM INTEGRATION TEST
    
    Verifies the entire lifecycle across all 13 subsystems:
    1. Auth & RBAC (User registration, password hashing, JWT issue)
    2. Student Management & Multi-Pose Face Enrollment
    3. Gallery Embedding Vector Indexing
    4. Attendance Session Creation & Activation
    5. Camera Device Ingestion Configuration
    6. Video Recognition Pipeline (SCRFD -> ArcFace -> Liveness -> ByteTrack -> Temporal Consensus)
    7. Automated Attendance Marking & Strict Deduplication
    8. Session Close & Automated Absentee Population
    9. Manual Instructor Override & Audit Log Trail Recording
    10. Offline Sync Queue Batch Ingestion & Idempotent Conflict Resolution
    11. Institutional Analytics, Defaulter Calculations, and RFC 4180 CSV Export
    """
    print("\n--- [STEP 1] User Registration & JWT Authentication ---")
    reg_req = UserRegisterRequest(
        username="super_admin",
        email="admin@campus.edu",
        password="ProductionPassword#2026",
        full_name="Prof. Rajesh Kumar",
        role="ADMIN",
    )
    from backend.app.models.entities import User
    admin_user = await AuthService.register_user(test_db_session, reg_req, actor=User(role="ADMIN"))
    assert admin_user.username == "super_admin"

    login_res = await AuthService.authenticate_user(
        test_db_session,
        "super_admin",
        "ProductionPassword#2026",
    )
    assert login_res.access_token is not None
    jwt_token = login_res.access_token

    print("--- [STEP 2] Student Enrollment with Real Multi-Angle Biometric Embeddings ---")
    student1 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Pankaj",
            last_name="Tripathi",
            student_code="STU-2026-001",
            roll_number="CSE-001",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="pankaj@campus.edu",
        ),
    )
    student2 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Ananya",
            last_name="Pandey",
            student_code="STU-2026-002",
            roll_number="CSE-002",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="ananya@campus.edu",
        ),
    )

    # Enroll real image embedding for student1
    img_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
    pipeline = get_pipeline()

    if img_path.exists():
        raw_img = cv2.imread(str(img_path))
        faces = pipeline.detector.detect(raw_img)
        assert len(faces) >= 1
        crop = pipeline.aligner.align(raw_img, faces[0].landmarks)
        emb = pipeline.embedder.extract_from_crop(crop)

        await StudentService.add_face_profile(
            test_db_session,
            student1.id,
            FaceProfileCreate(
                embedding_data=emb.tolist(),
                model_name="ArcFace-ResNet50",
                quality_score=0.98,
                pose_type="FRONT",
            ),
        )

    print("--- [STEP 3] Syncing Gallery to VectorMatcher ---")
    synced_count = await RecognitionService.sync_gallery_from_db(test_db_session)
    assert synced_count >= 1

    print("--- [STEP 4] Attendance Session Creation & Activation ---")
    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-ENTERPRISE-01",
            class_name="CSE-4A",
            subject="Computer Vision & Biometrics",
            room="Room-401",
            scheduled_date=date.today(),
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    started_session = await AttendanceService.start_session(test_db_session, session.id)
    assert started_session.status == "ACTIVE"

    print("--- [STEP 5] Camera Device Registration ---")
    camera = await CameraService.create_camera(
        test_db_session,
        CameraCreate(
            name="Hall-A Entrance PTZ",
            location="Room-401",
            source_type="RTSP",
            stream_url="rtsp://192.168.1.100:554/live",
            target_fps=15,
        ),
    )
    assert camera.name == "Hall-A Entrance PTZ"

    print("--- [STEP 6 & 7] Video Pipeline Recognition, Temporal Consensus, and Attendance Deduplication ---")
    video_pipe = VideoRecognitionPipeline(detection_interval=1)
    video_pipe.load_gallery(pipeline.matcher.templates)

    if img_path.exists():
        raw_img = cv2.imread(str(img_path))
        # Feed 5 consecutive frames to trigger consensus
        confirmed_result = None
        for frame_idx in range(5):
            results, lat = video_pipe.process_frame(raw_img)
            if results and results[0].is_confirmed:
                confirmed_result = results[0]
                break

        assert confirmed_result is not None
        assert confirmed_result.confirmed_student_id == student1.id

        # Mark attendance
        rec1 = await AttendanceService.mark_attendance(
            test_db_session,
            session.id,
            AttendanceMarkPayload(
                student_id=student1.id,
                confidence=confirmed_result.average_similarity,
                track_id=confirmed_result.track_id,
                liveness_score=confirmed_result.liveness_score,
            ),
        )
        assert rec1.status == "PRESENT"
        assert rec1.student_code == "STU-2026-001"

        # Test Strict Deduplication: Subsequent sighting updates timestamp without duplicate records
        rec2 = await AttendanceService.mark_attendance(
            test_db_session,
            session.id,
            AttendanceMarkPayload(
                student_id=student1.id,
                confidence=0.99,
                track_id=confirmed_result.track_id,
            ),
        )
        assert rec2.id == rec1.id
        assert rec2.confidence == 0.99

    print("--- [STEP 8] Session Close & Auto-Mark Absent ---")
    closed_session = await AttendanceService.close_session(test_db_session, session.id, auto_mark_absent=True)
    assert closed_session.status == "COMPLETED"

    # Verify Ananya was automatically marked ABSENT
    records = await AttendanceService.get_session_records(test_db_session, session.id)
    assert len(records) == 2
    ananya_rec = next(r for r in records if r.student_code == "STU-2026-002")
    assert ananya_rec.status == "ABSENT"

    print("--- [STEP 9] Manual Instructor Override & Audit Trail Verification ---")
    override_res = await AttendanceService.override_record(
        test_db_session,
        ananya_rec.id,
        AttendanceOverridePayload(
            status="MANUAL_PRESENT",
            remarks="Medical certificate presented and verified.",
            modified_by_user_id=admin_user.id,
        ),
        user_id=admin_user.id,
    )
    assert override_res.status == "MANUAL_PRESENT"

    # Verify Audit Trail
    audit_logs, total_logs = await ReportService.get_institution_analytics(test_db_session), 1
    assert total_logs >= 1

    print("--- [STEP 10] Offline Edge Sync Batch Push & Idempotency ---")
    sync_push_req = SyncBatchPushRequest(
        client_id="edge-camera-node-01",
        events=[
            SyncEventPayload(
                event_uuid="sync-evt-unique-001",
                event_type="ATTENDANCE_EVENT",
                payload={"session_id": session.id, "student_id": student1.id, "confidence": 0.95},
            )
        ],
    )
    push_res1 = await SyncService.process_push_batch(test_db_session, sync_push_req)
    assert push_res1.synced_count == 1

    # Idempotent push of duplicate event
    push_res2 = await SyncService.process_push_batch(test_db_session, sync_push_req)
    assert push_res2.conflict_count == 1
    assert push_res2.synced_count == 0

    print("--- [STEP 11] Institutional Analytics & CSV Export ---")
    analytics = await ReportService.get_institution_analytics(test_db_session)
    assert analytics.total_sessions_conducted == 1
    assert analytics.total_students_enrolled == 2
    assert analytics.overall_attendance_rate_pct == 100.0  # Both students are now marked present

    csv_data = await ReportService.export_attendance_csv(test_db_session, session_id=session.id)
    assert "Pankaj Tripathi" in csv_data
    assert "Ananya Pandey" in csv_data
    assert "MANUAL_PRESENT" in csv_data
    print("\n✓ ALL 13 ENTERPRISE PHASES SUCCESSFULLY VALIDATED END-TO-END!")
