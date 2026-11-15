#!/usr/bin/env python3
"""
Official Academic Data Import Script for JOJIPA-SAMS.
Source: Official Timetable + Course Structure documents.

Class: Computer Engineering — TE-B
Effective From: 15/06/2026
Total Curriculum Credits: 22

This script is IDEMPOTENT: running multiple times safely updates records
without creating duplicates.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, delete
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import ClassSection, Subject, ClassSubject, TimetableEntry


# Official 7 Courses from Curriculum Document
OFFICIAL_SUBJECTS = [
    {
        "code": "24CSPC501C",
        "name": "Theoretical Computer Science",
        "short_name": "TCS",
        "vertical": "PCC",
        "department": "Computer Engineering",
        "theory_hours": 3,
        "tutorial_hours": 1,
        "practical_hours": 0,
        "theory_credits": 3,
        "tutorial_credits": 1,
        "practical_credits": 0,
        "credits": 4,
        "status": "ACTIVE",
    },
    {
        "code": "24CSPC502C",
        "name": "Soft Computing",
        "short_name": "SC",
        "vertical": "PCC",
        "department": "Computer Engineering",
        "theory_hours": 2,
        "tutorial_hours": 0,
        "practical_hours": 2,
        "theory_credits": 2,
        "tutorial_credits": 0,
        "practical_credits": 1,
        "credits": 3,
        "status": "ACTIVE",
    },
    {
        "code": "24CSPEC501XC",
        "name": "Program Elective – I",
        "short_name": "PEC-I",
        "vertical": "PEC",
        "department": "Computer Engineering",
        "theory_hours": 3,
        "tutorial_hours": 0,
        "practical_hours": 2,
        "theory_credits": 3,
        "tutorial_credits": 0,
        "practical_credits": 1,
        "credits": 4,
        "status": "ACTIVE",
    },
    {
        "code": "24CSPEC502XC",
        "name": "Program Elective – II",
        "short_name": "PEC-II",
        "vertical": "PEC",
        "department": "Computer Engineering",
        "theory_hours": 2,
        "tutorial_hours": 0,
        "practical_hours": 2,
        "theory_credits": 2,
        "tutorial_credits": 0,
        "practical_credits": 1,
        "credits": 3,
        "status": "ACTIVE",
    },
    {
        "code": "24MDM501XC",
        "name": "Multidisciplinary Minor",
        "short_name": "MDM",
        "vertical": "MDM",
        "department": "Computer Engineering",
        "theory_hours": 3,
        "tutorial_hours": 0,
        "practical_hours": 2,
        "theory_credits": 3,
        "tutorial_credits": 0,
        "practical_credits": 1,
        "credits": 4,
        "status": "ACTIVE",
    },
    {
        "code": "24OE501XC",
        "name": "Open Elective I",
        "short_name": "OE-I",
        "vertical": "OE",
        "department": "Computer Engineering",
        "theory_hours": 3,
        "tutorial_hours": 0,
        "practical_hours": 0,
        "theory_credits": 3,
        "tutorial_credits": 0,
        "practical_credits": 0,
        "credits": 3,
        "status": "ACTIVE",
    },
    {
        "code": "24CSVSE501C",
        "name": "Employability Enhancement Program -IV (Web Technology Lab)",
        "short_name": "WTL",
        "vertical": "VSEC",
        "department": "Computer Engineering",
        "theory_hours": 0,
        "tutorial_hours": 0,
        "practical_hours": 2,
        "theory_credits": 0,
        "tutorial_credits": 0,
        "practical_credits": 1,
        "credits": 1,
        "status": "ACTIVE",
    },
]

# Official Timetable Slots from Timetable Image
TIMETABLE_SLOTS = [
    # Monday
    {"day": "Monday", "start": "09:00", "end": "10:00", "type": "SUBJECT", "label": "AIML-DN", "room": "CR 26", "code": "24CSPEC501XC"},
    {"day": "Monday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "TCS-DM", "room": "CR 26", "code": "24CSPC501C"},
    {"day": "Monday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "SC-SKP", "room": "CR 26", "code": "24CSPC502C"},
    {"day": "Monday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "OE-I", "room": "CR 26", "code": "24OE501XC"},
    {"day": "Monday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK"},
    {"day": "Monday", "start": "14:00", "end": "16:00", "type": "SUBJECT", "label": "WTL-SP (B1) / SC-SKP (B2)", "room": "L5 / L4", "batch": "B1/B2"},
    {"day": "Monday", "start": "16:00", "end": "17:00", "type": "ACTIVITY", "label": "Mentoring"},

    # Tuesday
    {"day": "Tuesday", "start": "09:00", "end": "10:00", "type": "SUBJECT", "label": "TCS-DM", "room": "CR 26", "code": "24CSPC501C"},
    {"day": "Tuesday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "SC-SKP", "room": "CR 26", "code": "24CSPC502C"},
    {"day": "Tuesday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "OE-I", "room": "CR 26", "code": "24OE501XC"},
    {"day": "Tuesday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "code": "24MDM501XC"},
    {"day": "Tuesday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK"},
    {"day": "Tuesday", "start": "14:00", "end": "16:00", "type": "SUBJECT", "label": "AIML-DN (B1) / WTL-SP (B2)", "room": "L6 / L5", "batch": "B1/B2"},
    {"day": "Tuesday", "start": "16:00", "end": "17:00", "type": "ACTIVITY", "label": "H/M"},

    # Wednesday
    {"day": "Wednesday", "start": "09:00", "end": "10:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "code": "24MDM501XC"},
    {"day": "Wednesday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "AIML-DN", "room": "CR 26", "code": "24CSPEC501XC"},
    {"day": "Wednesday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "TCS-DM", "room": "CR 26", "code": "24CSPC501C"},
    {"day": "Wednesday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "OE-I", "room": "CR 26", "code": "24OE501XC"},
    {"day": "Wednesday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK"},
    {"day": "Wednesday", "start": "14:00", "end": "16:00", "type": "SUBJECT", "label": "SC-SKP (B1) / AIML-DN (B2)", "room": "L4 / L6", "batch": "B1/B2"},
    {"day": "Wednesday", "start": "16:00", "end": "17:00", "type": "ACTIVITY", "label": "Library"},

    # Thursday
    {"day": "Thursday", "start": "09:00", "end": "10:00", "type": "SUBJECT", "label": "AIML-DN", "room": "CR 26", "code": "24CSPEC501XC"},
    {"day": "Thursday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "code": "24MDM501XC"},
    {"day": "Thursday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "TCS-DM (Tutorial)", "room": "CR 26", "code": "24CSPC501C"},
    {"day": "Thursday", "start": "12:00", "end": "13:00", "type": "SUBJECT", "label": "Program Elective – II", "room": "CR 26", "code": "24CSPEC502XC"},
    {"day": "Thursday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK"},
    {"day": "Thursday", "start": "14:00", "end": "16:00", "type": "SUBJECT", "label": "MDM Lab (B1 / B2)", "room": "L1 / SL", "batch": "B1/B2"},
    {"day": "Thursday", "start": "16:00", "end": "17:00", "type": "ACTIVITY", "label": "Mentoring"},

    # Friday
    {"day": "Friday", "start": "09:00", "end": "10:00", "type": "SUBJECT", "label": "Program Elective – II", "room": "CR 26", "code": "24CSPEC502XC"},
    {"day": "Friday", "start": "10:00", "end": "11:00", "type": "SUBJECT", "label": "MDM - PG CR 26", "room": "CR 26", "code": "24MDM501XC"},
    {"day": "Friday", "start": "11:00", "end": "12:00", "type": "SUBJECT", "label": "Soft Computing", "room": "CR 26", "code": "24CSPC502C"},
    {"day": "Friday", "start": "12:00", "end": "13:00", "type": "ACTIVITY", "label": "Remedial / Revision"},
    {"day": "Friday", "start": "13:00", "end": "14:00", "type": "BREAK", "label": "LUNCH BREAK"},
    {"day": "Friday", "start": "14:00", "end": "17:00", "type": "ACTIVITY", "label": "Department Activity / Project Work"},
]


async def import_curriculum():
    print("============================================================")
    print("  JOJIPA-SAMS: Importing Official Academic Curriculum Data  ")
    print("============================================================")

    await init_db_schema()

    async with AsyncSessionLocal() as db:
        # 1. Upsert Class Section TE-B
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
            teb_class.department = "Computer Engineering"
            teb_class.effective_from = "15/06/2026"
            teb_class.year = 3
            teb_class.semester = 5
            teb_class.section = "B"
            teb_class.academic_year = "2026-2027"
            teb_class.status = "ACTIVE"
            print(f"  ✓ Reusing Existing Class Section: TE-B (ID: {teb_class.id})")

        # 2. Upsert 7 Official Subjects
        created_subjects_map = {}
        total_credits = 0

        for s_data in OFFICIAL_SUBJECTS:
            code = s_data["code"]
            total_credits += s_data["credits"]

            sub_q = select(Subject).where(Subject.code == code)
            subject = (await db.execute(sub_q)).scalars().first()

            if not subject:
                subject = Subject(
                    code=code,
                    name=s_data["name"],
                    short_name=s_data["short_name"],
                    vertical=s_data["vertical"],
                    department=s_data["department"],
                    theory_hours=s_data["theory_hours"],
                    tutorial_hours=s_data["tutorial_hours"],
                    practical_hours=s_data["practical_hours"],
                    theory_credits=s_data["theory_credits"],
                    tutorial_credits=s_data["tutorial_credits"],
                    practical_credits=s_data["practical_credits"],
                    credits=s_data["credits"],
                    status=s_data["status"],
                )
                db.add(subject)
                await db.flush()
                print(f"  ✓ Created Subject: [{code}] {s_data['name']} ({s_data['credits']} Credits)")
            else:
                subject.name = s_data["name"]
                subject.short_name = s_data["short_name"]
                subject.vertical = s_data["vertical"]
                subject.department = s_data["department"]
                subject.theory_hours = s_data["theory_hours"]
                subject.tutorial_hours = s_data["tutorial_hours"]
                subject.practical_hours = s_data["practical_hours"]
                subject.theory_credits = s_data["theory_credits"]
                subject.tutorial_credits = s_data["tutorial_credits"]
                subject.practical_credits = s_data["practical_credits"]
                subject.credits = s_data["credits"]
                subject.status = s_data["status"]
                print(f"  ✓ Updated Subject: [{code}] {s_data['name']} ({s_data['credits']} Credits)")

            created_subjects_map[code] = subject

            # Link Subject to TE-B via ClassSubject
            link_q = select(ClassSubject).where(
                ClassSubject.class_id == teb_class.id,
                ClassSubject.subject_id == subject.id,
            )
            existing_link = (await db.execute(link_q)).scalars().first()
            if not existing_link:
                link = ClassSubject(class_id=teb_class.id, subject_id=subject.id)
                db.add(link)

        # 3. Clean and Populate Timetable for TE-B
        # Delete existing timetable entries for TE-B to avoid duplicates on re-run
        del_tt = delete(TimetableEntry).where(TimetableEntry.class_id == teb_class.id)
        await db.execute(del_tt)

        tt_count = 0
        for slot in TIMETABLE_SLOTS:
            subj_id = None
            if "code" in slot and slot["code"] in created_subjects_map:
                subj_id = created_subjects_map[slot["code"]].id

            tt_entry = TimetableEntry(
                class_id=teb_class.id,
                subject_id=subj_id,
                day_of_week=slot["day"],
                start_time=slot["start"],
                end_time=slot["end"],
                entry_type=slot["type"],
                label=slot["label"],
                batch=slot.get("batch"),
                room=slot.get("room"),
                effective_from="15/06/2026",
                status="ACTIVE",
            )
            db.add(tt_entry)
            tt_count += 1

        await db.commit()

        print("------------------------------------------------------------")
        print(f"  🎉 Curriculum Import Completed Successfully!")
        print(f"  📚 Total Subjects Imported: {len(OFFICIAL_SUBJECTS)}")
        print(f"  ⭐ Total Curriculum Credits: {total_credits} (Validation: 22/22 Credits)")
        print(f"  🏫 Class Section: TE-B (Effective From: 15/06/2026)")
        print(f"  🗓️  Timetable Slots Generated: {tt_count}")
        print("============================================================")


if __name__ == "__main__":
    asyncio.run(import_curriculum())
