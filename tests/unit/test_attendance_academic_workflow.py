from datetime import date, datetime, time, timedelta, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.entities import AttendanceRecord, AttendanceSession, Student, Subject, ClassSection, AuditLog
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    SessionCreate,
)
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService
from backend.app.services.class_service import ClassService


@pytest.mark.asyncio
async def test_complete_academic_attendance_flow(test_db_session: AsyncSession):
    """TEST: Full academic attendance workflow including subjects, classes, 100-frame marking, late arrivals, excused leave, and auto-marking absentees on close."""
    # 1. Create Subject
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS401",
            name="Computer Networks",
            department="Computer Science",
            credits=4,
            semester=4,
        ),
    )

    # 2. Create Class
    cls_sec = await ClassService.create_class(
        test_db_session,
        ClassSectionCreate(
            name="CSE-4A",
            department="Computer Science",
            year=4,
            semester=4,
            section="A",
        ),
    )

    # 3. Create 3 Students in class CSE-4A
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
    st3 = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            student_code="STU-003",
            roll_number="CS2026-003",
            first_name="Kabir",
            last_name="Verma",
            email="kabir.verma@testuniv.edu",
            department="Computer Science",
            class_name="CSE-4A",
        ),
    )

    # 4. Schedule Attendance Session (scheduled start time is 2 minutes ago)
    now_utc = datetime.now(timezone.utc)
    curr_start = (now_utc - timedelta(minutes=2)).time()
    curr_end = (now_utc + timedelta(minutes=58)).time()

    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            subject_id=subj.id,
            class_id=cls_sec.id,
            class_name="CSE-4A",
            subject="Computer Networks",
            room="Room 204",
            start_time=curr_start,
            end_time=curr_end,
            late_threshold_minutes=10,
        ),
    )
    assert session.status == "SCHEDULED"

    # 5. Start Session
    session = await AttendanceService.start_session(test_db_session, session.id)
    assert session.status == "ACTIVE"

    # 6. Student 1 is recognized continuously 100 times
    for frame_idx in range(100):
        rec = await AttendanceService.mark_attendance(
            test_db_session,
            session.id,
            AttendanceMarkPayload(
                student_id=st1.id,
                confidence=0.92 + (frame_idx % 5) * 0.01,
                track_id=1,
            ),
        )
        assert rec.status == "PRESENT"

    # Check that database has exactly ONE attendance record for Student 1
    records_q = select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    all_recs = (await test_db_session.execute(records_q)).scalars().all()
    assert len(all_recs) == 1
    assert all_recs[0].student_id == st1.id
    assert all_recs[0].status == "PRESENT"

    # 7. Student 2 has approved medical leave -> Mark EXCUSED manually
    rec2 = await AttendanceService.mark_manual_attendance(
        test_db_session,
        session_id=session.id,
        student_id=st2.id,
        status="EXCUSED",
        remarks="Approved medical leave with certificate #MED-994",
    )
    assert rec2.status == "EXCUSED"

    # 8. Student 1 manual override (e.g. adjust remarks)
    rec1_updated = await AttendanceService.override_record(
        test_db_session,
        record_id=all_recs[0].id,
        override_in=AttendanceOverridePayload(
            status="PRESENT",
            remarks="Faculty verified lab workstation attendance",
        ),
    )
    assert rec1_updated.status == "PRESENT"

    # Verify audit log was created
    audit_q = select(AuditLog).where(AuditLog.entity_id == all_recs[0].id)
    audits = (await test_db_session.execute(audit_q)).scalars().all()
    assert len(audits) == 1
    assert audits[0].action == "MANUAL_OVERRIDE"

    # 9. Close Session -> Student 3 (who never showed up) must be auto-marked ABSENT
    closed_session = await AttendanceService.close_session(test_db_session, session.id, auto_mark_absent=True)
    assert closed_session.status == "COMPLETED"
    assert closed_session.present_count == 1
    assert closed_session.excused_count == 1
    assert closed_session.absent_count == 1
    assert closed_session.total_records == 3

    # Check Student 3 record is ABSENT
    st3_rec_q = select(AttendanceRecord).where(
        AttendanceRecord.session_id == session.id,
        AttendanceRecord.student_id == st3.id,
    )
    st3_rec = (await test_db_session.execute(st3_rec_q)).scalars().first()
    assert st3_rec is not None
    assert st3_rec.status == "ABSENT"

    # 10. Student Attendance History
    st1_history = await AttendanceService.get_student_attendance_history(test_db_session, st1.id)
    assert st1_history.total_sessions == 1
    assert st1_history.present_sessions == 1
    assert st1_history.attendance_rate_pct == 100.0

    st3_history = await AttendanceService.get_student_attendance_history(test_db_session, st3.id)
    assert st3_history.total_sessions == 1
    assert st3_history.absent_sessions == 1
    assert st3_history.attendance_rate_pct == 0.0
