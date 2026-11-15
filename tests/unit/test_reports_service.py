from datetime import date, time
import pytest

from backend.app.schemas.attendance import AttendanceMarkPayload, SessionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.report_service import ReportService
from backend.app.services.student_service import StudentService


@pytest.mark.asyncio
async def test_report_service_analytics_and_defaulters(test_db_session):
    # 1. Enroll 3 Students
    s1 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Aarav",
            last_name="Sharma",
            student_code="STU-AARAV",
            roll_number="CSE-001",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="aarav@campus.edu",
        ),
    )
    s2 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Diya",
            last_name="Patel",
            student_code="STU-DIYA",
            roll_number="CSE-002",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="diya@campus.edu",
        ),
    )
    s3 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Kabir",
            last_name="Singh",
            student_code="STU-KABIR",
            roll_number="CSE-003",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="kabir@campus.edu",
        ),
    )

    # 2. Create and complete 2 sessions
    sess1 = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-REP-01",
            class_name="CSE-4A",
            subject="Algorithms",
            room="Room-101",
            scheduled_date=date.today(),
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, sess1.id)
    # Aarav and Diya present in sess1
    await AttendanceService.mark_attendance(test_db_session, sess1.id, AttendanceMarkPayload(student_id=s1.id, confidence=0.9))
    await AttendanceService.mark_attendance(test_db_session, sess1.id, AttendanceMarkPayload(student_id=s2.id, confidence=0.85))
    await AttendanceService.close_session(test_db_session, sess1.id, auto_mark_absent=True)

    sess2 = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-REP-02",
            class_name="CSE-4A",
            subject="Database Systems",
            room="Room-102",
            scheduled_date=date.today(),
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, sess2.id)
    # Only Aarav present in sess2 (Diya and Kabir absent)
    await AttendanceService.mark_attendance(test_db_session, sess2.id, AttendanceMarkPayload(student_id=s1.id, confidence=0.92))
    await AttendanceService.close_session(test_db_session, sess2.id, auto_mark_absent=True)

    # 3. Compute Analytics
    analytics = await ReportService.get_institution_analytics(test_db_session)

    assert analytics.total_sessions_conducted == 2
    assert analytics.total_students_enrolled >= 3
    # Aarav: 2/2 (100%), Diya: 1/2 (50% Defaulter), Kabir: 0/2 (0% Critical Defaulter)
    assert analytics.perfect_attendance_count >= 1
    assert analytics.defaulter_students_count >= 2

    # Verify defaulter fields
    diya_defaulter = next((d for d in analytics.defaulters if d.student_code == "STU-DIYA"), None)
    assert diya_defaulter is not None
    assert diya_defaulter.attendance_pct == 50.0
    assert diya_defaulter.is_critical is True  # < 65%

    # 4. Test CSV Export
    csv_data = await ReportService.export_attendance_csv(test_db_session, class_name="CSE-4A")
    assert "Student Code,Roll Number,Student Name" in csv_data
    assert "STU-AARAV" in csv_data
    assert "STU-DIYA" in csv_data

