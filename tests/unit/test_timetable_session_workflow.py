import pytest
from datetime import date, time
from sqlalchemy import select

from backend.app.core.exceptions import SessionConflictError
from backend.app.models.entities import ClassSection, Subject, Batch, TimetableEntry, AttendanceSession
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.timetable import TimetableEntryCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.class_service import ClassService


@pytest.mark.asyncio
async def test_timetable_date_awareness_and_effective_date(test_db_session):
    """Verify date-aware weekday resolution and effective date (15/06/2026) gating."""
    # 1. Setup TE-B class
    teb = ClassSection(
        name="TE-B",
        department="Computer Engineering",
        effective_from="15/06/2026",
        year=3,
        semester=5,
        section="B",
        academic_year="2026-2027",
        status="ACTIVE",
    )
    test_db_session.add(teb)
    await test_db_session.flush()

    # 2. Add Monday slot
    slot_mon = TimetableEntry(
        class_id=teb.id,
        day_of_week="Monday",
        start_time="10:00",
        end_time="11:00",
        entry_type="SUBJECT",
        label="AIML-DN",
        room="CR 26",
        effective_from="15/06/2026",
        status="ACTIVE",
    )
    # Add Lunch Break slot
    slot_lunch = TimetableEntry(
        class_id=teb.id,
        day_of_week="Monday",
        start_time="13:00",
        end_time="14:00",
        entry_type="BREAK",
        label="Lunch Break",
        room=None,
        effective_from="15/06/2026",
        status="ACTIVE",
    )
    test_db_session.add_all([slot_mon, slot_lunch])
    await test_db_session.commit()

    # 3. Query on Monday after effective date (e.g. 2026-08-31 is a Monday)
    mon_entries = await ClassService.list_timetable_entries(
        db=test_db_session,
        class_id=teb.id,
        scheduled_date=date(2026, 8, 31),
    )
    assert len(mon_entries) == 2
    assert any(e.label == "AIML-DN" and e.entry_type == "SUBJECT" for e in mon_entries)
    assert any(e.label == "Lunch Break" and e.entry_type == "BREAK" for e in mon_entries)

    # 4. Query before effective date (e.g. 2026-06-01) -> should return empty list
    early_entries = await ClassService.list_timetable_entries(
        db=test_db_session,
        class_id=teb.id,
        scheduled_date=date(2026, 6, 1),
    )
    assert len(early_entries) == 0


@pytest.mark.asyncio
async def test_session_creation_from_timetable_and_duplicate_protection(test_db_session):
    """Verify timetable-driven session creation and duplicate session conflict rejection."""
    # 1. Setup Class & Subject
    teb = ClassSection(
        name="TE-B",
        department="Computer Engineering",
        effective_from="15/06/2026",
        year=3,
        semester=5,
        section="B",
        academic_year="2026-2027",
        status="ACTIVE",
    )
    test_db_session.add(teb)
    await test_db_session.flush()

    tcs = Subject(
        code="24CSPC501C",
        name="Theoretical Computer Science",
        department="Computer Engineering",
        credits=4,
        status="ACTIVE",
    )
    test_db_session.add(tcs)
    await test_db_session.flush()

    slot = TimetableEntry(
        class_id=teb.id,
        subject_id=tcs.id,
        day_of_week="Monday",
        start_time="12:00",
        end_time="13:00",
        entry_type="SUBJECT",
        label="TCS - DM",
        room="CR 26",
        effective_from="15/06/2026",
        status="ACTIVE",
    )
    test_db_session.add(slot)
    await test_db_session.commit()

    # 2. Create Session from Slot
    session_payload = SessionCreate(
        class_id=teb.id,
        class_name=teb.name,
        timetable_entry_id=slot.id,
        subject_id=tcs.id,
        subject=tcs.name,
        room="CR 26",
        scheduled_date=date(2026, 8, 31),
        start_time=time(12, 0),
        end_time=time(13, 0),
        late_threshold_minutes=10,
        attendance_mode="AI_FACE_RECOGNITION",
    )
    created_session = await AttendanceService.create_session(db=test_db_session, session_in=session_payload)
    assert created_session.id is not None
    assert created_session.timetable_entry_id == slot.id
    assert created_session.status == "SCHEDULED"
    assert created_session.room == "CR 26"

    # 3. Timetable query for that date should now mark has_existing_session = True
    entries = await ClassService.list_timetable_entries(
        db=test_db_session,
        class_id=teb.id,
        scheduled_date=date(2026, 8, 31),
    )
    matching_slot = next(e for e in entries if e.id == slot.id)
    assert matching_slot.has_existing_session is True
    assert matching_slot.existing_session_id == created_session.id

    # 4. Attempting to create duplicate session for same slot should raise SessionConflictError
    with pytest.raises(SessionConflictError) as exc_info:
        await AttendanceService.create_session(db=test_db_session, session_in=session_payload)
    assert exc_info.value.status_code == 409
    assert exc_info.value.details.get("existing_session_id") == created_session.id

    # 5. Start Session -> ACTIVE
    active_sess = await AttendanceService.start_session(db=test_db_session, session_id=created_session.id)
    assert active_sess.status == "ACTIVE"
