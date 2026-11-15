from datetime import date, time
import pytest
from sqlalchemy import select

from backend.app.core.exceptions import SAMSException
from backend.app.models.entities import AttendanceRecord, AttendanceSession, AuditLog, Student
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    SessionCreate,
)
from backend.app.schemas.student import StudentCreate
from backend.app.services.attendance_service import (
    AttendanceService,
    RecordNotFoundError,
    SessionNotActiveError,
    SessionNotFoundError,
)
from backend.app.services.student_service import StudentService


@pytest.mark.asyncio
async def test_attendance_session_lifecycle(test_db_session):
    # 1. Create session
    session_in = SessionCreate(
        session_code="SESS-TEST-01",
        class_name="CSE-4A",
        subject="Computer Vision",
        room="Hall-A",
        scheduled_date=date.today(),
        start_time=time(23, 0),
        end_time=time(23, 59),
    )
    session = await AttendanceService.create_session(test_db_session, session_in)
    assert session.status == "SCHEDULED"
    assert session.session_code == "SESS-TEST-01"

    # 2. Duplicate session code rejection
    with pytest.raises(SAMSException) as exc:
        await AttendanceService.create_session(test_db_session, session_in)
    assert exc.value.status_code == 409

    # 3. Start session -> ACTIVE
    started = await AttendanceService.start_session(test_db_session, session.id)
    assert started.status == "ACTIVE"

    # 4. Close session -> COMPLETED
    closed = await AttendanceService.close_session(test_db_session, session.id, auto_mark_absent=False)
    assert closed.status == "COMPLETED"


@pytest.mark.asyncio
async def test_attendance_marking_and_deduplication(test_db_session):
    # 1. Create two students in CSE-4A
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

    # 2. Create and start session
    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-DEDUP-01",
            class_name="CSE-4A",
            subject="Algorithms",
            room="Room-101",
            scheduled_date=date.today(),
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, session.id)

    # 3. Mark Aarav attendance for first time
    payload1 = AttendanceMarkPayload(
        student_id=s1.id,
        confidence=0.82,
        track_id=101,
        liveness_score=0.95,
        verification_metadata={"frames": 5},
    )
    rec1 = await AttendanceService.mark_attendance(test_db_session, session.id, payload1)
    assert rec1.status == "PRESENT"
    assert rec1.student_code == "STU-AARAV"
    assert rec1.confidence == 0.82
    first_seen_time = rec1.first_seen

    # 4. Strict Deduplication: Mark Aarav a SECOND time with higher confidence
    payload2 = AttendanceMarkPayload(
        student_id=s1.id,
        confidence=0.91,
        track_id=101,
        liveness_score=0.98,
        verification_metadata={"frames": 12},
    )
    rec2 = await AttendanceService.mark_attendance(test_db_session, session.id, payload2)

    # Must be same record ID (deduplicated)
    assert rec2.id == rec1.id
    assert rec2.confidence == 0.91
    assert rec2.first_seen == first_seen_time

    # Verify only ONE record exists in DB for this student
    records = await AttendanceService.get_session_records(test_db_session, session.id)
    assert len(records) == 1

    # 5. Close session with auto_mark_absent -> Diya should be marked ABSENT
    await AttendanceService.close_session(test_db_session, session.id, auto_mark_absent=True)

    records_after_close = await AttendanceService.get_session_records(test_db_session, session.id)
    assert len(records_after_close) == 2
    absent_rec = next(r for r in records_after_close if r.student_code == "STU-DIYA")
    assert absent_rec.status == "ABSENT"


@pytest.mark.asyncio
async def test_close_session_resolves_pending_review_as_absent(test_db_session):
    student = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Pending", last_name="Student", student_code="STU-PENDING",
            roll_number="CSE-099", department="CSE", class_name="CSE-4P",
            section="P", email="pending@campus.edu",
        ),
    )
    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-PENDING-01", class_name="CSE-4P", subject="Algorithms",
            room="Room-101", scheduled_date=date.today(), start_time=time(23), end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, session.id)
    test_db_session.add(AttendanceRecord(
        session_id=session.id, student_id=student.id, status="REVIEW_REQUIRED",
        source="PHONE_CAPTURE", verification_metadata={"usable_live_frames": 1},
    ))
    await test_db_session.commit()

    await AttendanceService.close_session(test_db_session, session.id, auto_mark_absent=True)

    record = (await test_db_session.scalars(select(AttendanceRecord).where(
        AttendanceRecord.session_id == session.id, AttendanceRecord.student_id == student.id,
    ))).one()
    assert record.status == "ABSENT"
    assert record.source == "AUTO_ROSTER"
    assert record.verification_metadata["resolution"] == "ABSENT_ON_CLOSE"


@pytest.mark.asyncio
async def test_manual_override_and_audit_logging(test_db_session):
    # 1. Setup student & active session
    st = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Rohan",
            last_name="Verma",
            student_code="STU-ROHAN",
            roll_number="CSE-003",
            department="CSE",
            class_name="CSE-4B",
            section="B",
            email="rohan@campus.edu",
        ),
    )
    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-OVERRIDE-01",
            class_name="CSE-4B",
            subject="Operating Systems",
            room="Room-202",
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, session.id)

    # 2. Mark attendance
    rec = await AttendanceService.mark_attendance(
        test_db_session,
        session.id,
        AttendanceMarkPayload(student_id=st.id, confidence=0.88),
    )
    assert rec.status == "PRESENT"

    # 3. Perform manual override to MANUAL_ABSENT
    override_in = AttendanceOverridePayload(
        status="MANUAL_ABSENT",
        remarks="Student left class after 5 minutes without permission.",
    )
    updated_rec = await AttendanceService.override_record(test_db_session, rec.id, override_in)
    assert updated_rec.status == "MANUAL_ABSENT"
    assert "Manual override" in updated_rec.remarks

    # 4. Verify Audit Log was recorded
    audit_q = select(AuditLog).where(AuditLog.entity_id == rec.id)
    audit = (await test_db_session.execute(audit_q)).scalars().first()
    assert audit is not None
    assert audit.action == "MANUAL_OVERRIDE"
    assert audit.old_values["status"] == "PRESENT"
    assert audit.new_values["status"] == "MANUAL_ABSENT"

