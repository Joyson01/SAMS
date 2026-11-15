import pytest
from sqlalchemy import select
from backend.app.database.session import AsyncSessionLocal
from backend.app.models.entities import ClassSection, Subject, ClassSubject, TimetableEntry
from scripts.import_teb_curriculum import import_curriculum, OFFICIAL_SUBJECTS


@pytest.mark.asyncio
async def test_curriculum_import_and_credits_validation():
    # Execute curriculum import
    await import_curriculum()

    async with AsyncSessionLocal() as db:
        # Verify Class Section TE-B
        class_q = select(ClassSection).where(ClassSection.name == 'TE-B')
        teb_class = (await db.execute(class_q)).scalars().first()
        assert teb_class is not None
        assert teb_class.department == 'Computer Engineering'
        assert teb_class.effective_from == '15/06/2026'
        assert teb_class.section == 'B'

        # Verify 7 official subjects
        subjects = (await db.execute(select(Subject))).scalars().all()
        assert len(subjects) == 7

        codes = {s.code for s in subjects}
        expected_codes = {s['code'] for s in OFFICIAL_SUBJECTS}
        assert codes == expected_codes

        # Validate total credits = 22
        total_credits = sum(s.credits for s in subjects)
        assert total_credits == 22

        # Verify Class-Subject associations
        links = (await db.execute(select(ClassSubject).where(ClassSubject.class_id == teb_class.id))).scalars().all()
        assert len(links) == 7

        # Verify Timetable slots
        timetable_slots = (await db.execute(select(TimetableEntry).where(TimetableEntry.class_id == teb_class.id))).scalars().all()
        assert len(timetable_slots) > 0

        # Verify lunch break entry
        lunch_breaks = [s for s in timetable_slots if s.entry_type == 'BREAK' and 'LUNCH' in s.label.upper()]
        assert len(lunch_breaks) >= 5
