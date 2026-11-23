import re
from datetime import date, datetime, time
from typing import List, Optional
from sqlalchemy import and_, func, select, delete
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.teacher_access import assigned_classes
from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import AttendanceSession, Batch, ClassSection, ClassSubject, Student, Subject, TimetableEntry
from backend.app.schemas.class_section import (
    ClassSectionCreate,
    ClassSectionResponse,
    ClassSectionUpdate,
)
from backend.app.schemas.timetable import (
    TimetableEntryCreate,
    TimetableEntryResponse,
    TimetableEntryUpdate,
)


class ClassNotFoundError(SAMSException):
    def __init__(self, class_id: str):
        super().__init__(
            status_code=404,
            error_code="CLASS_NOT_FOUND",
            message=f"Class with ID '{class_id}' was not found.",
            details={"class_id": class_id},
        )


class ClassAlreadyExistsError(SAMSException):
    def __init__(self, name: str):
        super().__init__(
            status_code=409,
            error_code="CLASS_ALREADY_EXISTS",
            message=f"Class with name '{name}' already exists.",
            details={"name": name},
        )


class ClassService:
    """Service layer managing academic classes / batches / sections and timetable schedules."""

    @staticmethod
    async def validate_subjects(db, ids):
        if ids is None:
            return
        actual = set((await db.scalars(select(Subject.id).where(Subject.id.in_(ids)))).all())
        if actual != set(ids):
            raise HTTPException(422, "Choose existing subjects for this class.")
        if len(ids) != len(set(ids)):
            raise HTTPException(422, "A subject can be assigned only once.")

    @classmethod
    async def create_class(cls, db: AsyncSession, class_in: ClassSectionCreate) -> ClassSectionResponse:
        """Creates a new academic class section."""
        q = select(ClassSection).where(ClassSection.name == class_in.name)
        existing = (await db.execute(q)).scalars().first()
        if existing:
            raise ClassAlreadyExistsError(class_in.name)

        await cls.validate_subjects(db, class_in.assigned_subject_ids)
        class_sec = ClassSection(
            name=class_in.name,
            department=class_in.department,
            effective_from=class_in.effective_from or None,
            year=class_in.year,
            semester=class_in.semester,
            section=class_in.section,
            academic_year=class_in.academic_year,
            status=class_in.status.upper(),
        )
        db.add(class_sec)
        await db.flush()
        db.add_all([
            ClassSubject(class_id=class_sec.id, subject_id=subject_id)
            for subject_id in class_in.assigned_subject_ids or []
        ])
        await db.commit()

        logger.info(f"Created class '{class_sec.name}' ({class_sec.id})")
        return await cls.get_class_by_id(db, class_sec.id)

    @classmethod
    async def get_class_by_id(cls, db: AsyncSession, class_id: str) -> ClassSectionResponse:
        """Retrieves a single class section by ID."""
        result = await db.execute(cls._class_summary_query().where(ClassSection.id == class_id))
        row = result.one_or_none()
        if row is None:
            raise ClassNotFoundError(class_id)
        return cls._class_response(row)

    @classmethod
    async def list_classes(
        cls,
        db: AsyncSession,
        department: Optional[str] = None,
        semester: Optional[int] = None,
        status: Optional[str] = None,
        teacher_id: str | None = None,
    ) -> List[ClassSectionResponse]:
        """Lists registered class sections."""
        query = cls._class_summary_query()
        filters = []
        if teacher_id is not None:
            filters.append(ClassSection.id.in_(assigned_classes(teacher_id)))
        if department:
            filters.append(ClassSection.department.ilike(f"%{department}%"))
        if semester:
            filters.append(ClassSection.semester == semester)
        if status:
            filters.append(ClassSection.status == status.upper())

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(ClassSection.name.asc())
        result = await db.execute(query)
        return [cls._class_response(row) for row in result]

    @classmethod
    async def update_class(cls, db: AsyncSession, class_id: str, update_in: ClassSectionUpdate) -> ClassSectionResponse:
        """Updates class section settings."""
        cls_obj = await db.get(ClassSection, class_id)
        if not cls_obj:
            raise ClassNotFoundError(class_id)

        update_dict = update_in.model_dump(exclude_unset=True)
        assigned_subject_ids = update_dict.pop("assigned_subject_ids", None)

        await cls.validate_subjects(db, assigned_subject_ids)
        for field, value in update_dict.items():
            if field == "status" and value:
                value = value.upper()
            setattr(cls_obj, field, value)

        if assigned_subject_ids is not None:
            await db.execute(delete(ClassSubject).where(ClassSubject.class_id == class_id))

            for s_id in assigned_subject_ids:
                link = ClassSubject(class_id=class_id, subject_id=s_id)
                db.add(link)

        await db.commit()
        await db.refresh(cls_obj)
        logger.info(f"Updated class '{cls_obj.name}' (ID: {cls_obj.id})")
        return await cls.get_class_by_id(db, class_id)

    @classmethod
    async def delete_class(cls, db: AsyncSession, class_id: str) -> bool:
        """Deletes a class section."""
        cls_obj = await db.get(ClassSection, class_id)
        if not cls_obj:
            raise ClassNotFoundError(class_id)

        await db.delete(cls_obj)
        await db.commit()
        logger.info(f"Deleted class '{cls_obj.name}' (ID: {class_id})")
        return True

    @staticmethod
    def _effective_date(value: str | None) -> date | None:
        if value:
            for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                try:
                    return datetime.strptime(value.strip(), fmt).date()
                except ValueError:
                    continue
        return None

    @classmethod
    async def list_timetable_entries(
        cls,
        db: AsyncSession,
        class_id: Optional[str] = None,
        day_of_week: Optional[str] = None,
        scheduled_date: Optional[date] = None,
        teacher_id: str | None = None,
    ) -> List[TimetableEntryResponse]:
        """Lists timetable schedule entries for a class, day, or specific calendar date."""
        target_day = day_of_week or (scheduled_date.strftime("%A") if scheduled_date else None)
        query = select(TimetableEntry, ClassSection).join(ClassSection, TimetableEntry.class_id == ClassSection.id)
        filters = []
        if teacher_id is not None:
            filters.append(TimetableEntry.class_id.in_(assigned_classes(teacher_id)))
        if class_id:
            filters.append(TimetableEntry.class_id == class_id)
        if target_day:
            filters.append(TimetableEntry.day_of_week.ilike(target_day))

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(TimetableEntry.day_of_week.asc(), TimetableEntry.start_time.asc())
        result = await db.execute(query)
        responses = []
        for e, section in result.all():
            if scheduled_date and any(
                start and start > scheduled_date
                for start in (cls._effective_date(section.effective_from), cls._effective_date(e.effective_from))
            ):
                continue
            class_name = section.name

            subj_code = None
            subj_name = None
            if e.subject_id:
                s = await db.get(Subject, e.subject_id)
                if s:
                    subj_code = s.code
                    subj_name = s.name

            has_session = False
            existing_session_id = None

            if scheduled_date and class_name:
                # Check for existing scheduled/active session on this date
                sq = select(AttendanceSession).where(
                    and_(
                        AttendanceSession.class_name == class_name,
                        AttendanceSession.scheduled_date == scheduled_date,
                        AttendanceSession.status.in_(["SCHEDULED", "ACTIVE"]),
                        AttendanceSession.start_time <= time.fromisoformat(e.start_time if len(e.start_time) == 5 else f"0{e.start_time}"),
                        AttendanceSession.end_time >= time.fromisoformat(e.end_time if len(e.end_time) == 5 else f"0{e.end_time}"),
                    )
                )
                existing_sess = (await db.execute(sq)).scalars().first()
                if existing_sess:
                    has_session = True
                    existing_session_id = existing_sess.id

            responses.append(
                TimetableEntryResponse(
                    id=e.id,
                    class_id=e.class_id,
                    class_name=class_name,
                    subject_id=e.subject_id,
                    subject_code=subj_code,
                    subject_name=subj_name,
                    is_mapped=bool(e.subject_id),
                    batch_id=e.batch_id,
                    day_of_week=e.day_of_week,
                    start_time=e.start_time,
                    end_time=e.end_time,
                    entry_type=e.entry_type,
                    label=e.label,
                    batch=e.batch,
                    room=e.room,
                    effective_from=e.effective_from,
                    status=e.status,
                    has_existing_session=has_session,
                    existing_session_id=existing_session_id,
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
            )
        return responses

    @staticmethod
    async def _validate_slot(db: AsyncSession, entry: TimetableEntry) -> None:
        if not await db.get(ClassSection, entry.class_id):
            raise ClassNotFoundError(entry.class_id)
        if entry.subject_id and not await db.get(Subject, entry.subject_id):
            raise HTTPException(422, "Choose an existing subject.")
        if entry.batch_id:
            batch = await db.get(Batch, entry.batch_id)
            if not batch or batch.class_id != entry.class_id:
                raise HTTPException(422, "Choose a lab batch in this class.")
        times = []
        for value in (entry.start_time, entry.end_time):
            if not value or not re.fullmatch(r"(?:[01]?\d|2[0-3]):[0-5]\d", value):
                raise HTTPException(422, "Enter a start and end time in 24-hour HH:MM format.")
            times.append(value.zfill(5))
        if times[1] <= times[0]:
            raise HTTPException(422, "End time must be after start time.")
        entry.start_time, entry.end_time = times
        weekday = (entry.day_of_week or "").strip().title()
        if weekday not in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"):
            raise HTTPException(422, "Choose a valid day of the week.")
        entry.day_of_week = weekday
        if not (entry.label or "").strip():
            raise HTTPException(422, "Enter a timetable slot label.")
        if entry.status not in {"ACTIVE", "INACTIVE"} or entry.entry_type not in {"SUBJECT", "ACTIVITY", "BREAK"}:
            raise HTTPException(422, "Choose a valid slot type and status.")

    @classmethod
    async def create_timetable_entry(cls, db: AsyncSession, entry_in: TimetableEntryCreate) -> TimetableEntryResponse:
        """Creates a new timetable schedule slot."""
        entry = TimetableEntry(
            class_id=entry_in.class_id,
            subject_id=entry_in.subject_id,
            batch_id=entry_in.batch_id,
            day_of_week=entry_in.day_of_week,
            start_time=entry_in.start_time,
            end_time=entry_in.end_time,
            entry_type=entry_in.entry_type.upper(),
            label=entry_in.label,
            batch=entry_in.batch,
            room=entry_in.room,
            effective_from=entry_in.effective_from or None,
            status=entry_in.status.upper(),
        )
        await cls._validate_slot(db, entry)
        db.add(entry)
        await db.commit()
        await db.refresh(entry)

        res = await cls.list_timetable_entries(db, class_id=entry.class_id, day_of_week=entry.day_of_week)
        for r in res:
            if r.id == entry.id:
                return r
        return res[0]

    @classmethod
    async def update_timetable_entry(cls, db: AsyncSession, entry_id: str, update_in: TimetableEntryUpdate) -> TimetableEntryResponse:
        """Updates a timetable entry (e.g. mapping to a Subject, changing room or batch)."""
        entry = await db.get(TimetableEntry, entry_id)
        if not entry:
            raise SAMSException(status_code=404, error_code="TIMETABLE_ENTRY_NOT_FOUND", message=f"Timetable slot '{entry_id}' not found.")

        changes = update_in.model_dump(exclude_unset=True)
        proposed = TimetableEntry(class_id=entry.class_id, **{
            field: changes.get(field, getattr(entry, field))
            for field in TimetableEntryUpdate.model_fields
        })
        for field in ("status", "entry_type"):
            value = getattr(proposed, field)
            if value:
                setattr(proposed, field, value.upper())
        await cls._validate_slot(db, proposed)
        for field in changes.keys() | {"start_time", "end_time", "day_of_week"}:
            setattr(entry, field, getattr(proposed, field))

        await db.commit()
        await db.refresh(entry)
        res = await cls.list_timetable_entries(db, class_id=entry.class_id, day_of_week=entry.day_of_week)
        for r in res:
            if r.id == entry.id:
                return r
        return res[0]

    @classmethod
    async def delete_timetable_entry(cls, db: AsyncSession, entry_id: str) -> bool:
        """Deletes a timetable schedule slot."""
        entry = await db.get(TimetableEntry, entry_id)
        if not entry:
            raise SAMSException(status_code=404, error_code="TIMETABLE_ENTRY_NOT_FOUND", message=f"Timetable slot '{entry_id}' not found.")
        await db.delete(entry)
        await db.commit()
        return True

    @staticmethod
    def _roster_filter(class_obj):
        return and_(
            Student.class_name == class_obj.name,
            Student.department == class_obj.department,
            Student.section == class_obj.section,
            Student.status == "ACTIVE",
        )

    @classmethod
    def _class_summary_query(cls):
        student_count = select(func.count(Student.id)).where(
            cls._roster_filter(ClassSection)
        ).correlate(ClassSection).scalar_subquery()
        curriculum = select(
            ClassSubject.class_id,
            func.count(Subject.id).label("subjects"),
            func.sum(Subject.credits).label("credits"),
        ).join(Subject, Subject.id == ClassSubject.subject_id).group_by(ClassSubject.class_id).subquery()
        return select(
            ClassSection, student_count, func.coalesce(curriculum.c.subjects, 0),
            func.coalesce(curriculum.c.credits, 0),
        ).outerjoin(curriculum, curriculum.c.class_id == ClassSection.id)

    @staticmethod
    def _class_response(row):
        section, students, subjects, credits = row
        return ClassSectionResponse.model_validate(section).model_copy(update={
            "student_count": students, "subject_count": subjects, "total_curriculum_credits": credits,
        })

    @classmethod
    async def get_eligible_students(cls, db: AsyncSession, class_id: str) -> List[Student]:
        """Retrieves all students eligible for a given class section."""
        class_obj = await db.get(ClassSection, class_id)
        if not class_obj:
            return []
        
        query = select(Student).where(cls._roster_filter(class_obj))
        result = await db.execute(query)
        return list(result.scalars().all())

    @classmethod
    async def resolve_current_timetable_entry(
        cls,
        db: AsyncSession,
        current_time: Optional[time] = None,
        day_of_week: Optional[str] = None,
        room: Optional[str] = None,
        teacher_id: str | None = None,
    ) -> Optional[TimetableEntryResponse]:
        """Resolves the currently active timetable entry based on time, day, and optional room context."""
        import datetime
        now = datetime.datetime.now()
        
        if not current_time:
            current_time = now.time()
            
        if not day_of_week:
            day_of_week = now.strftime("%A")
            
        query = select(TimetableEntry).where(
            and_(
                TimetableEntry.day_of_week.ilike(day_of_week),
                TimetableEntry.status == "ACTIVE"
            )
        )
        
        if room:
            query = query.where(TimetableEntry.room == room)
        if teacher_id is not None:
            query = query.where(TimetableEntry.class_id.in_(assigned_classes(teacher_id)))
            
        result = await db.execute(query)
        entries = result.scalars().all()
        
        # Find the entry where current_time falls between start_time and end_time
        # Since start_time is stored as string like "09:00"
        for e in entries:
            try:
                st = datetime.time.fromisoformat(e.start_time if len(e.start_time) == 5 else f"0{e.start_time}")
                et = datetime.time.fromisoformat(e.end_time if len(e.end_time) == 5 else f"0{e.end_time}")
                if st <= current_time <= et:
                    # Found current active entry
                    res = await cls.list_timetable_entries(db, class_id=e.class_id, day_of_week=e.day_of_week)
                    for r in res:
                        if r.id == e.id:
                            return r
            except Exception as exc:
                logger.warning(f"Error parsing time for timetable entry {e.id}: {exc}")
                continue
                
        return None
