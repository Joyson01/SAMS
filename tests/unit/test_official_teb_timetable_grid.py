import pytest
from datetime import date, time
from sqlalchemy import select

from backend.app.core.exceptions import SessionConflictError
from backend.app.models.entities import ClassSection, Subject, Batch, TimetableEntry, AttendanceSession
from backend.app.schemas.attendance import SessionCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.class_service import ClassService
from scripts.import_teb_timetable import TIMETABLE_DEFINITIONS


@pytest.mark.asyncio
async def test_all_five_weekdays_official_timetable_structure(test_db_session):
    """Verify all 5 weekdays match the exact official timetable image specifications."""
    # 1. Create Class Section
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

    # 2. Add Batches B1 and B2
    b1 = Batch(class_id=teb.id, name="B1")
    b2 = Batch(class_id=teb.id, name="B2")
    test_db_session.add_all([b1, b2])
    await test_db_session.flush()

    # 3. Add all official entries from import definitions
    for defn in TIMETABLE_DEFINITIONS:
        entry = TimetableEntry(
            class_id=teb.id,
            day_of_week=defn["day"],
            start_time=defn["start"],
            end_time=defn["end"],
            entry_type=defn["type"],
            label=defn["label"],
            batch=defn["batch"],
            room=defn["room"],
            effective_from="15/06/2026",
            status="ACTIVE",
        )
        test_db_session.add(entry)
    await test_db_session.commit()

    # ----------------------------------------------------
    # MONDAY VERIFICATION (2026-08-31 is Monday)
    # ----------------------------------------------------
    mon = await ClassService.list_timetable_entries(test_db_session, class_id=teb.id, scheduled_date=date(2026, 8, 31))
    assert len(mon) == 8
    mon_map = {f"{e.start_time}-{e.end_time}": e for e in mon}
    assert mon_map["09:00-10:00"].label == "H/M" and mon_map["09:00-10:00"].entry_type == "ACTIVITY"
    assert mon_map["10:00-11:00"].label == "AIML - DN" and mon_map["10:00-11:00"].entry_type == "SUBJECT"
    assert mon_map["11:00-12:00"].label == "Mentoring" and mon_map["11:00-12:00"].entry_type == "ACTIVITY"
    assert mon_map["12:00-13:00"].label == "TCS - DM" and mon_map["12:00-13:00"].entry_type == "SUBJECT"
    assert mon_map["13:00-14:00"].label == "LUNCH BREAK" and mon_map["13:00-14:00"].entry_type == "BREAK"
    assert mon_map["14:00-15:00"].label == "CSS - DM" and mon_map["14:00-15:00"].entry_type == "SUBJECT"
    assert mon_map["15:00-16:00"].label == "B1 - TCS - DM" and mon_map["15:00-16:00"].batch == "B1"
    assert mon_map["16:00-17:00"].label == "B2 - WTL - SP - L6" and mon_map["16:00-17:00"].batch == "B2" and mon_map["16:00-17:00"].room == "L6"

    # ----------------------------------------------------
    # TUESDAY VERIFICATION (2026-09-01 is Tuesday)
    # ----------------------------------------------------
    tue = await ClassService.list_timetable_entries(test_db_session, class_id=teb.id, scheduled_date=date(2026, 9, 1))
    assert len(tue) == 10  # 8 periods, with 2 concurrent batch entries at 14:00 and 15:00
    tue_10_13 = [e for e in tue if e.start_time in ["10:00", "11:00", "12:00"]]
    assert all("MDM - PG CR 26" in e.label and e.room == "CR 26" for e in tue_10_13)
    tue_14 = [e for e in tue if e.start_time == "14:00"]
    assert len(tue_14) == 2
    assert any(e.batch == "B1" and "SC - SKP - L4" in e.label for e in tue_14)
    assert any(e.batch == "B2" and "AIML - DN - L5" in e.label for e in tue_14)
    tue_16 = next(e for e in tue if e.start_time == "16:00")
    assert tue_16.label == "AIML - DN (SL)" and tue_16.room == "SL"

    # ----------------------------------------------------
    # WEDNESDAY VERIFICATION (2026-09-02 is Wednesday)
    # ----------------------------------------------------
    wed = await ClassService.list_timetable_entries(test_db_session, class_id=teb.id, scheduled_date=date(2026, 9, 2))
    assert len(wed) == 10  # 8 periods, with 2 concurrent batch entries at 10:00 and 11:00
    wed_10 = [e for e in wed if e.start_time == "10:00"]
    assert len(wed_10) == 2
    assert any(e.batch == "B1" and "AIML - DN - L5" in e.label for e in wed_10)
    assert any(e.batch == "B2" and "SC - SKP - L4" in e.label for e in wed_10)
    wed_14 = next(e for e in wed if e.start_time == "14:00")
    assert wed_14.label == "LIBRARY" and wed_14.entry_type == "ACTIVITY"
    wed_15_17 = [e for e in wed if e.start_time in ["15:00", "16:00"]]
    assert all("MDM - PG L1" in e.label and e.room == "L1" for e in wed_15_17)

    # ----------------------------------------------------
    # THURSDAY VERIFICATION (2026-09-03 is Thursday)
    # ----------------------------------------------------
    thu = await ClassService.list_timetable_entries(test_db_session, class_id=teb.id, scheduled_date=date(2026, 9, 3))
    assert len(thu) == 8
    thu_10_12 = [e for e in thu if e.start_time in ["10:00", "11:00"]]
    assert all("OE - I" in e.label for e in thu_10_12)
    thu_16 = next(e for e in thu if e.start_time == "16:00")
    assert thu_16.label == "SC - SKP (SL)" and thu_16.room == "SL"

    # ----------------------------------------------------
    # FRIDAY VERIFICATION (2026-09-04 is Friday)
    # ----------------------------------------------------
    fri = await ClassService.list_timetable_entries(test_db_session, class_id=teb.id, scheduled_date=date(2026, 9, 4))
    assert len(fri) == 10  # 8 periods, with 2 concurrent batch entries at 14:00 and 15:00
    fri_14 = [e for e in fri if e.start_time == "14:00"]
    assert len(fri_14) == 2
    assert any(e.batch == "B1" and "WTL - SP - L5" in e.label for e in fri_14)
    assert any(e.batch == "B2" and "TCS - DM" in e.label for e in fri_14)
    fri_16 = next(e for e in fri if e.start_time == "16:00")
    assert fri_16.label == "TCS - DM (SL)" and fri_16.room == "SL"


@pytest.mark.asyncio
async def test_create_session_from_slot_and_duplicate_rejection(test_db_session):
    """Verify session creation from timetable slot and duplicate rejection."""
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

    slot = TimetableEntry(
        class_id=teb.id,
        day_of_week="Monday",
        start_time="10:00",
        end_time="11:00",
        entry_type="SUBJECT",
        label="AIML - DN",
        room="CR 26",
        effective_from="15/06/2026",
        status="ACTIVE",
    )
    test_db_session.add(slot)
    await test_db_session.commit()

    # 1. Create Session
    payload = SessionCreate(
        class_id=teb.id,
        class_name=teb.name,
        timetable_entry_id=slot.id,
        subject=slot.label,
        room="CR 26",
        scheduled_date=date(2026, 8, 31),
        start_time=time(10, 0),
        end_time=time(11, 0),
        late_threshold_minutes=10,
        attendance_mode="AI_FACE_RECOGNITION",
    )
    created = await AttendanceService.create_session(test_db_session, payload)
    assert created.id is not None
    assert created.status == "SCHEDULED"
    assert created.timetable_entry_id == slot.id

    # 2. Duplicate Session Rejection
    with pytest.raises(SessionConflictError) as exc_info:
        await AttendanceService.create_session(test_db_session, payload)
    assert exc_info.value.status_code == 409

    # 3. Start Session
    started = await AttendanceService.start_session(test_db_session, created.id)
    assert started.status == "ACTIVE"
