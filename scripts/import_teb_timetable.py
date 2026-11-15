#!/usr/bin/env python3
"""
Official Timetable Import Script for JOJIPA-SAMS.
Source: Official College Timetable Image

Department: Computer Engineering
Class: TE-B
Effective From: 15/06/2026

This script is IDEMPOTENT: running multiple times safely creates/updates records
without creating duplicates or fake data.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, delete
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import ClassSection, Subject, Batch, TimetableEntry


# Official TE-B Weekly Timetable Definitions
TIMETABLE_DEFINITIONS = [
    # MONDAY
    {"day": "Monday", "start": "09:00", "end": "10:00", "type": "ACTIVITY", "label": "H/M", "room": None, "batch": None, "code": None},
    {"day": "Monday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "AIML - DN", "room": None, "batch": None, "code": None},
    {"day": "Monday", "start": "11:00", "end": "12:00", "type": "ACTIVITY", "label": "Mentoring", "room": None, "batch": None, "code": None},
    {"day": "Monday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "TCS - DM", "room": None, "batch": None, "code": "24CSPC501C"},
    {"day": "Monday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK", "room": None, "batch": None, "code": None},
    {"day": "Monday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "CSS - DM", "room": None, "batch": None, "code": None},
    {"day": "Monday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "B1 - TCS - DM", "room": None, "batch": "B1", "code": "24CSPC501C"},
    {"day": "Monday", "start": "16:00", "end": "17:00", "type": "SUBJECT", "label": "B2 - WTL - SP - L6", "room": "L6", "batch": "B2", "code": "24CSVSE501C"},

    # TUESDAY
    {"day": "Tuesday", "start": "09:00", "end": "10:00", "type": "ACTIVITY", "label": "H/M", "room": None, "batch": None, "code": None},
    {"day": "Tuesday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "batch": None, "code": "24MDM501XC"},
    {"day": "Tuesday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "batch": None, "code": "24MDM501XC"},
    {"day": "Tuesday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "batch": None, "code": "24MDM501XC"},
    {"day": "Tuesday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK", "room": None, "batch": None, "code": None},
    {"day": "Tuesday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "B1 - SC - SKP - L4", "room": "L4", "batch": "B1", "code": "24CSPC502C"},
    {"day": "Tuesday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "B2 - AIML - DN - L5", "room": "L5", "batch": "B2", "code": None},
    {"day": "Tuesday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "B1 - SC - SKP - L4", "room": "L4", "batch": "B1", "code": "24CSPC502C"},
    {"day": "Tuesday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "B2 - AIML - DN - L5", "room": "L5", "batch": "B2", "code": None},
    {"day": "Tuesday", "start": "16:00", "end": "17:00", "type": "SUBJECT", "label": "AIML - DN (SL)", "room": "SL", "batch": None, "code": None},

    # WEDNESDAY
    {"day": "Wednesday", "start": "09:00", "end": "10:00", "type": "ACTIVITY", "label": "H/M", "room": None, "batch": None, "code": None},
    {"day": "Wednesday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "B1 - AIML - DN - L5", "room": "L5", "batch": "B1", "code": None},
    {"day": "Wednesday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "B2 - SC - SKP - L4", "room": "L4", "batch": "B2", "code": "24CSPC502C"},
    {"day": "Wednesday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "B1 - AIML - DN - L5", "room": "L5", "batch": "B1", "code": None},
    {"day": "Wednesday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "B2 - SC - SKP - L4", "room": "L4", "batch": "B2", "code": "24CSPC502C"},
    {"day": "Wednesday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "TCS - DM", "room": None, "batch": None, "code": "24CSPC501C"},
    {"day": "Wednesday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK", "room": None, "batch": None, "code": None},
    {"day": "Wednesday", "start": "14:00", "end": "15:00", "type": "ACTIVITY", "label": "LIBRARY", "room": None, "batch": None, "code": None},
    {"day": "Wednesday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "MDM - PG L1", "room": "L1", "batch": None, "code": "24MDM501XC"},
    {"day": "Wednesday", "start": "16:00", "end": "17:00", "type": "SUBJECT", "label": "MDM - PG L1", "room": "L1", "batch": None, "code": "24MDM501XC"},

    # THURSDAY
    {"day": "Thursday", "start": "09:00", "end": "10:00", "type": "ACTIVITY", "label": "H/M", "room": None, "batch": None, "code": None},
    {"day": "Thursday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "OE - I", "room": None, "batch": None, "code": "24OE501XC"},
    {"day": "Thursday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "OE - I", "room": None, "batch": None, "code": "24OE501XC"},
    {"day": "Thursday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "AIML - DN", "room": None, "batch": None, "code": None},
    {"day": "Thursday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK", "room": None, "batch": None, "code": None},
    {"day": "Thursday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "AIML - DN", "room": None, "batch": None, "code": None},
    {"day": "Thursday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "SC - SKP", "room": None, "batch": None, "code": "24CSPC502C"},
    {"day": "Thursday", "start": "16:00", "end": "17:00", "type": "SUBJECT", "label": "SC - SKP (SL)", "room": "SL", "batch": None, "code": "24CSPC502C"},

    # FRIDAY
    {"day": "Friday", "start": "09:00", "end": "10:00", "type": "ACTIVITY", "label": "H/M", "room": None, "batch": None, "code": None},
    {"day": "Friday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "SC - SKP", "room": None, "batch": None, "code": "24CSPC502C"},
    {"day": "Friday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "TCS - DM", "room": None, "batch": None, "code": "24CSPC501C"},
    {"day": "Friday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "AIML - DN", "room": None, "batch": None, "code": None},
    {"day": "Friday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK", "room": None, "batch": None, "code": None},
    {"day": "Friday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "B1 - WTL - SP - L5", "room": "L5", "batch": "B1", "code": "24CSVSE501C"},
    {"day": "Friday", "start": "14:00", "end": "15:00", "type": "SUBJECT", "label": "B2 - TCS - DM", "room": None, "batch": "B2", "code": "24CSPC501C"},
    {"day": "Friday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "B1 - WTL - SP - L5", "room": "L5", "batch": "B1", "code": "24CSVSE501C"},
    {"day": "Friday", "start": "15:00", "end": "16:00", "type": "SUBJECT", "label": "B2 - TCS - DM", "room": None, "batch": "B2", "code": "24CSPC501C"},
    {"day": "Friday", "start": "16:00", "end": "17:00", "type": "SUBJECT", "label": "TCS - DM (SL)", "room": "SL", "batch": None, "code": "24CSPC501C"},
]


async def import_timetable():
    print("============================================================")
    print("   JOJIPA-SAMS: Official TE-B Timetable Schedule Import     ")
    print("============================================================")

    await init_db_schema()

    async with AsyncSessionLocal() as db:
        # 1. Resolve Class Section TE-B
        class_q = select(ClassSection).where(ClassSection.name == "TE-B")
        teb_class = (await db.execute(class_q)).scalars().first()

        if not teb_class:
            teb_class = ClassSection(
                name="TE-B",
                department="Computer Engineering",
                effective_from="15/06/2026",
                year=3,
                semester=5,
                section="B",
                academic_year="2026-2027",
                status="ACTIVE",
            )
            db.add(teb_class)
            await db.flush()
            print(f"  ✓ Created Class Section: TE-B (Department: Computer Engineering)")
        else:
            print(f"  ✓ Found Class Section: TE-B (ID: {teb_class.id})")

        # 2. Ensure Batches B1 and B2 exist for TE-B
        batches_map = {}
        for batch_name in ["B1", "B2"]:
            bq = select(Batch).where(Batch.class_id == teb_class.id, Batch.name == batch_name)
            batch_obj = (await db.execute(bq)).scalars().first()
            if not batch_obj:
                batch_obj = Batch(class_id=teb_class.id, name=batch_name, description=f"Batch {batch_name} of TE-B")
                db.add(batch_obj)
                await db.flush()
                print(f"  ✓ Created Batch: {batch_name} for TE-B")
            batches_map[batch_name] = batch_obj

        # 3. Load Available Subjects for mapping
        subjects = (await db.execute(select(Subject))).scalars().all()
        subjects_by_code = {s.code: s for s in subjects}

        # 4. Upsert Timetable Entries
        del_tt = delete(TimetableEntry).where(TimetableEntry.class_id == teb_class.id)
        await db.execute(del_tt)

        teaching_slots_count = 0
        activity_slots_count = 0
        break_slots_count = 0

        for slot in TIMETABLE_DEFINITIONS:
            subj_id = None
            if slot["code"] and slot["code"] in subjects_by_code:
                subj_id = subjects_by_code[slot["code"]].id

            batch_id = None
            if slot["batch"] and slot["batch"] in batches_map:
                batch_id = batches_map[slot["batch"]].id

            tt_entry = TimetableEntry(
                class_id=teb_class.id,
                subject_id=subj_id,
                batch_id=batch_id,
                day_of_week=slot["day"],
                start_time=slot["start"],
                end_time=slot["end"],
                entry_type=slot["type"],
                label=slot["label"],
                batch=slot["batch"],
                room=slot["room"],
                effective_from="15/06/2026",
                status="ACTIVE",
            )
            db.add(tt_entry)

            if slot["type"] == "SUBJECT":
                teaching_slots_count += 1
            elif slot["type"] == "ACTIVITY":
                activity_slots_count += 1
            elif slot["type"] == "BREAK":
                break_slots_count += 1

        await db.commit()

        total_slots = len(TIMETABLE_DEFINITIONS)
        print("------------------------------------------------------------")
        print(f"  🎉 Timetable Import Completed Successfully!")
        print(f"  🏫 Class: TE-B (Effective From: 15/06/2026)")
        print(f"  📚 Teaching / Subject Slots: {teaching_slots_count}")
        print(f"  🎯 Activity Slots (Mentoring/Library/HM): {activity_slots_count}")
        print(f"  ☕ Break Slots (Lunch Break): {break_slots_count}")
        print(f"  📅 Total Weekly Timetable Slots: {total_slots}")
        print("============================================================")


if __name__ == "__main__":
    asyncio.run(import_timetable())
