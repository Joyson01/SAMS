from datetime import date, datetime, time, timedelta, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.schemas.attendance import AttendanceMarkPayload, SessionCreate
from backend.app.schemas.camera import CameraCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.camera_service import CameraService
from backend.app.services.class_service import ClassService
from backend.app.services.dashboard_service import DashboardService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


@pytest.mark.asyncio
async def test_dashboard_summary_empty_database(test_db_session: AsyncSession):
    """Verify empty database returns proper clean zeros and empty lists."""
    summary_resp = await DashboardService.get_dashboard_summary(test_db_session)
    assert summary_resp.summary.total_students == 0
    assert summary_resp.summary.enrolled_students == 0
    assert summary_resp.summary.present_today == 0
    assert summary_resp.summary.absent_today == 0
    assert summary_resp.active_session is None
    assert len(summary_resp.upcoming_sessions) == 0
    assert len(summary_resp.today_sessions) == 0
    assert len(summary_resp.cameras) == 0
    assert len(summary_resp.recent_activities) == 0
    assert len(summary_resp.exceptions) == 0


@pytest.mark.asyncio
async def test_dashboard_summary_with_real_academic_workflow(test_db_session: AsyncSession):
    """Verify populated academic state reflects real database counts, active sessions, upcoming sessions, camera health, and activities."""
    # 1. Create Class and Subject
    cls_sec = await ClassService.create_class(
        test_db_session,
        ClassSectionCreate(name="CSE-4A", department="Computer Science", year=4, semester=4, section="A"),
    )
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(code="CS401", name="Computer Networks", department="Computer Science", credits=4, semester=4),
    )

    # 2. Create 2 Students
    st1 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            student_code="STU-001",
            roll_number="CS2026-001",
            first_name="Aarav",
            last_name="Patel",
            email="aarav.patel@testuniv.edu",
            department="Computer Science",
            class_name="CSE-4A",
        ),
    )
    st2 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            student_code="STU-002",
            roll_number="CS2026-002",
            first_name="Diya",
            last_name="Iyer",
            email="diya.iyer@testuniv.edu",
            department="Computer Science",
            class_name="CSE-4A",
        ),
    )

    # 3. Create Camera
    cam = await CameraService.create_camera(
        test_db_session,
        CameraCreate(name="Room 204 Camera", location="Room 204", source_type="WEBCAM"),
    )

    # 4. Schedule and Start Attendance Session
    now_utc = datetime.now(timezone.utc)
    curr_start = (now_utc - timedelta(minutes=5)).time()
    curr_end = (now_utc + timedelta(minutes=55)).time()

    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            subject_id=subj.id,
            class_id=cls_sec.id,
            class_name="CSE-4A",
            subject="Computer Networks",
            room="Room 204",
            scheduled_date=date.today(),
            start_time=curr_start,
            end_time=curr_end,
            camera_id=cam.id,
        ),
    )
    started_sess = await AttendanceService.start_session(test_db_session, sess.id)

    # 5. Mark Student 1 Attendance
    await AttendanceService.mark_attendance(
        test_db_session,
        sess.id,
        AttendanceMarkPayload(student_id=st1.id, confidence=0.96, track_id=101),
    )

    # 6. Fetch Dashboard Summary
    dashboard = await DashboardService.get_dashboard_summary(test_db_session)

    # Validate Summary
    assert dashboard.summary.total_students == 2
    assert dashboard.summary.present_today == 1
    assert dashboard.summary.pending_enrollment == 2  # Both not yet face enrolled

    # Validate Active Session
    assert dashboard.active_session is not None
    assert dashboard.active_session.id == sess.id
    assert dashboard.active_session.subject == "Computer Networks"
    assert dashboard.active_session.class_name == "CSE-4A"
    assert dashboard.active_session.present_count == 1
    assert dashboard.active_session.total_roster_count == 2
    assert dashboard.active_session.camera_name == "Room 204 Camera"

    # Validate Today's Sessions
    assert len(dashboard.today_sessions) == 1
    assert dashboard.today_sessions[0].status == "ACTIVE"

    # Validate Cameras
    assert len(dashboard.cameras) == 1
    assert dashboard.cameras[0].name == "Room 204 Camera"

    # Validate Recent Activity
    assert len(dashboard.recent_activities) >= 1
    assert "Aarav Patel" in dashboard.recent_activities[0].title or "marked" in dashboard.recent_activities[0].title

    # Validate Exceptions
    assert len(dashboard.exceptions) >= 1
    assert any(e.type == "UNENROLLED_STUDENTS" for e in dashboard.exceptions)
