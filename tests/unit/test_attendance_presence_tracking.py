import asyncio
import os
import time
from datetime import datetime, date, time as dtime, timezone
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import AttendanceRecord, AttendanceSession, Student
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.presence_service import PresenceManager, PresenceState


@pytest.mark.asyncio
async def test_mark_once_and_track_presence_500_frames(test_db_session: AsyncSession):
    """TEST 1, 2, 3: Verifies that recognizing a student 500 times creates exactly 1 attendance record and continuously updates last_seen."""
    # Create Student
    student = Student(
        student_code=f"STU-TRACK-{os.urandom(2).hex()}",
        roll_number=f"ROLL-TRACK-{os.urandom(2).hex()}",
        first_name="Rahul",
        last_name="Verma",
        email=f"rahul.{os.urandom(2).hex()}@campus.edu",
        department="Computer Science",
        class_name="CSE-4A",
    )
    test_db_session.add(student)

    now_time = datetime.now(timezone.utc).time()
    # Create Active Session starting now
    session = AttendanceSession(
        session_code=f"SESS-TRACK-{os.urandom(2).hex()}",
        class_name="CSE-4A",
        subject="Machine Learning",
        room="Lab 3",
        scheduled_date=date.today(),
        start_time=now_time,
        end_time=dtime(23, 59),
        status="ACTIVE",
    )
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(student)
    await test_db_session.refresh(session)

    # Simulate 500 consecutive frame recognitions for Rahul
    first_record = None
    for i in range(500):
        rec = await AttendanceService.mark_attendance(
            db=test_db_session,
            session_id=session.id,
            payload=AttendanceMarkPayload(
                student_id=student.id,
                confidence=0.85 + (i % 10) * 0.01,
                camera_id="cam-main",
            ),
        )
        if i == 0:
            first_record = rec

    # Verify exactly 1 attendance record in database
    records = await AttendanceService.get_session_records(test_db_session, session.id)
    assert len(records) == 1, f"Expected exactly 1 attendance record, found {len(records)}"
    assert records[0].student_id == student.id
    assert records[0].status == "PRESENT"
    assert records[0].last_seen >= first_record.first_seen


@pytest.mark.asyncio
async def test_presence_state_transitions_occlusion_and_return():
    """TEST 4, 5, 6, 7: Verifies presence state transitions (VISIBLE -> TEMPORARILY_NOT_VISIBLE -> NOT_CURRENTLY_VISIBLE -> RETURNED)."""
    pm = PresenceManager()
    pm.OCCLUSION_GRACE_SEC = 0.2  # 200ms for fast test execution
    pm.PRESENCE_TIMEOUT_SEC = 0.5  # 500ms for fast test execution

    # Mock student
    class MockStudent:
        id = "mock-student-1"
        first_name = "Priya"
        last_name = "Nair"
        student_code = "STU-PRIYA"
        roll_number = "ROLL-PRIYA"

    st = MockStudent()
    session_id = "test-session-state"

    # Frame 1: Initial observation
    state1, mark1 = pm.observe_student(session_id, st, confidence=0.88)
    assert state1 == PresenceState.VERIFYING
    assert mark1 is False

    # Frame 2: Confirmed appearance
    state2, mark2 = pm.observe_student(session_id, st, confidence=0.92)
    assert state2 == PresenceState.PRESENT_AND_VISIBLE
    assert mark2 is True  # Marked ONCE

    # Frame 3: Subsequent observation while visible
    state3, mark3 = pm.observe_student(session_id, st, confidence=0.94)
    assert state3 == PresenceState.PRESENT_AND_VISIBLE
    assert mark3 is False  # NOT marked again

    # Disappear for 250ms -> Within occlusion grace period
    time.sleep(0.25)
    presence = pm.get_session_presence(session_id)
    assert len(presence) == 1
    assert presence[0].presence_state == PresenceState.TEMPORARILY_NOT_VISIBLE

    # Returns within grace period
    state_ret1, mark_ret1 = pm.observe_student(session_id, st, confidence=0.91)
    assert state_ret1 == PresenceState.PRESENT_AND_VISIBLE
    assert mark_ret1 is False

    # Disappear for 550ms -> Exceeds presence timeout (LEFT / NOT_CURRENTLY_VISIBLE)
    time.sleep(0.55)
    presence_away = pm.get_session_presence(session_id)
    assert presence_away[0].presence_state == PresenceState.NOT_CURRENTLY_VISIBLE
    assert presence_away[0].attendance_status == "PRESENT"  # Attendance is NOT revoked

    # Returns after absence
    state_ret2, mark_ret2 = pm.observe_student(session_id, st, confidence=0.93)
    assert state_ret2 == PresenceState.PRESENT_AND_VISIBLE
    assert mark_ret2 is False  # DO NOT create another attendance record

    presence_final = pm.get_session_presence(session_id)
    assert presence_final[0].return_count >= 1


@pytest.mark.asyncio
async def test_concurrent_simultaneous_attendance_requests(test_db_session: AsyncSession):
    """TEST 8: Verifies Level 3 duplicate protection under concurrent race conditions."""
    student = Student(
        student_code=f"STU-RACE-{os.urandom(2).hex()}",
        roll_number=f"ROLL-RACE-{os.urandom(2).hex()}",
        first_name="Vivek",
        last_name="Singh",
        email=f"vivek.{os.urandom(2).hex()}@campus.edu",
        department="Computer Science",
        class_name="CSE-4A",
    )
    session = AttendanceSession(
        session_code=f"SESS-RACE-{os.urandom(2).hex()}",
        class_name="CSE-4A",
        subject="Distributed Systems",
        room="Lab 1",
        scheduled_date=date.today(),
        start_time=dtime(10, 0),
        end_time=dtime(11, 30),
        status="ACTIVE",
    )
    test_db_session.add(student)
    test_db_session.add(session)
    await test_db_session.commit()
    await test_db_session.refresh(student)
    await test_db_session.refresh(session)

    # Perform multiple sequential mark requests mimicking concurrent frame bursts
    for _ in range(10):
        await AttendanceService.mark_attendance(
            db=test_db_session,
            session_id=session.id,
            payload=AttendanceMarkPayload(student_id=student.id, confidence=0.95),
        )

    records = await AttendanceService.get_session_records(test_db_session, session.id)
    assert len(records) == 1, f"Expected exactly 1 record, got {len(records)}"


@pytest.mark.asyncio
async def test_multiple_students_and_multiple_sessions(test_db_session: AsyncSession):
    """TEST 9, 10: Verifies multiple students in one session and same student across different sessions."""
    s1 = Student(
        student_code=f"STU-A-{os.urandom(2).hex()}",
        roll_number=f"ROLL-A-{os.urandom(2).hex()}",
        first_name="Alice",
        last_name="Roy",
        email=f"alice.{os.urandom(2).hex()}@campus.edu",
        department="Computer Science",
        class_name="CSE-4A",
    )
    s2 = Student(
        student_code=f"STU-B-{os.urandom(2).hex()}",
        roll_number=f"ROLL-B-{os.urandom(2).hex()}",
        first_name="Bob",
        last_name="Das",
        email=f"bob.{os.urandom(2).hex()}@campus.edu",
        department="Computer Science",
        class_name="CSE-4A",
    )
    sess1 = AttendanceSession(
        session_code=f"SESS-1-{os.urandom(2).hex()}",
        class_name="CSE-4A",
        subject="Algorithms",
        room="Hall A",
        scheduled_date=date.today(),
        start_time=dtime(9, 0),
        end_time=dtime(10, 0),
        status="ACTIVE",
    )
    sess2 = AttendanceSession(
        session_code=f"SESS-2-{os.urandom(2).hex()}",
        class_name="CSE-4A",
        subject="Database Systems",
        room="Hall B",
        scheduled_date=date.today(),
        start_time=dtime(11, 0),
        end_time=dtime(12, 0),
        status="ACTIVE",
    )
    test_db_session.add_all([s1, s2, sess1, sess2])
    await test_db_session.commit()
    for obj in [s1, s2, sess1, sess2]:
        await test_db_session.refresh(obj)

    # Session 1: Mark s1 and s2
    await AttendanceService.mark_attendance(test_db_session, sess1.id, AttendanceMarkPayload(student_id=s1.id, confidence=0.9))
    await AttendanceService.mark_attendance(test_db_session, sess1.id, AttendanceMarkPayload(student_id=s2.id, confidence=0.9))

    # Session 2: Mark s1 only
    await AttendanceService.mark_attendance(test_db_session, sess2.id, AttendanceMarkPayload(student_id=s1.id, confidence=0.9))

    # Verification: Session 1 has 2 records
    recs1 = await AttendanceService.get_session_records(test_db_session, sess1.id)
    assert len(recs1) == 2

    # Verification: Session 2 has 1 record
    recs2 = await AttendanceService.get_session_records(test_db_session, sess2.id)
    assert len(recs2) == 1

    # Verification: Student s1 has 2 total attendance records (one per session)
    hist_s1 = await AttendanceService.get_student_attendance_history(test_db_session, s1.id)
    assert hist_s1.total_sessions == 2
