from typing import List, Optional, Tuple
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import AttendanceSession, ClassSection, ClassSubject, Subject
from backend.app.schemas.subject import SubjectCreate, SubjectResponse, SubjectUpdate


class SubjectNotFoundError(SAMSException):
    def __init__(self, subject_id: str):
        super().__init__(
            status_code=404,
            error_code="SUBJECT_NOT_FOUND",
            message=f"Subject with ID '{subject_id}' was not found.",
            details={"subject_id": subject_id},
        )


class SubjectAlreadyExistsError(SAMSException):
    def __init__(self, code: str):
        super().__init__(
            status_code=409,
            error_code="SUBJECT_ALREADY_EXISTS",
            message=f"Subject with code '{code}' already exists.",
            details={"code": code},
        )


class SubjectService:
    """Service layer managing academic subjects and their relations to sessions."""

    @classmethod
    async def create_subject(cls, db: AsyncSession, subject_in: SubjectCreate) -> SubjectResponse:
        """Creates a new academic subject with code uniqueness validation."""
        # Check duplicate code
        q = select(Subject).where(Subject.code == subject_in.code)
        existing = (await db.execute(q)).scalars().first()
        if existing:
            raise SubjectAlreadyExistsError(subject_in.code)

        subject = Subject(
            code=subject_in.code,
            name=subject_in.name,
            short_name=subject_in.short_name,
            vertical=subject_in.vertical,
            department=subject_in.department,
            theory_hours=subject_in.theory_hours,
            tutorial_hours=subject_in.tutorial_hours,
            practical_hours=subject_in.practical_hours,
            theory_credits=subject_in.theory_credits,
            tutorial_credits=subject_in.tutorial_credits,
            practical_credits=subject_in.practical_credits,
            credits=subject_in.credits,
            semester=subject_in.semester,
            academic_year=subject_in.academic_year,
            status=subject_in.status.upper(),
        )
        db.add(subject)
        await db.commit()
        await db.refresh(subject)

        # Assign to classes if specified
        if subject_in.assigned_classes:
            for class_name in subject_in.assigned_classes:
                cq = select(ClassSection).where(ClassSection.name == class_name)
                class_obj = (await db.execute(cq)).scalars().first()
                if class_obj:
                    link = ClassSubject(class_id=class_obj.id, subject_id=subject.id)
                    db.add(link)
            await db.commit()

        logger.info(f"Created subject '{subject.code} - {subject.name}' ({subject.id})")
        return await cls._serialize_subject(db, subject)

    @classmethod
    async def get_subject_by_id(cls, db: AsyncSession, subject_id: str) -> SubjectResponse:
        """Retrieves a single subject by ID."""
        subject = await db.get(Subject, subject_id)
        if not subject:
            raise SubjectNotFoundError(subject_id)
        return await cls._serialize_subject(db, subject)

    @classmethod
    async def list_subjects(
        cls,
        db: AsyncSession,
        department: Optional[str] = None,
        semester: Optional[int] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[SubjectResponse]:
        """Lists subjects with optional filtering and search."""
        query = select(Subject)
        filters = []

        if department:
            filters.append(Subject.department.ilike(f"%{department}%"))
        if semester:
            filters.append(Subject.semester == semester)
        if status:
            filters.append(Subject.status == status.upper())
        if search:
            search_filter = or_(
                Subject.code.ilike(f"%{search}%"),
                Subject.name.ilike(f"%{search}%"),
                Subject.short_name.ilike(f"%{search}%"),
                Subject.vertical.ilike(f"%{search}%"),
            )
            filters.append(search_filter)

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(Subject.code.asc())
        result = await db.execute(query)
        subjects = result.scalars().all()

        responses = []
        for s in subjects:
            resp = await cls._serialize_subject(db, s)
            responses.append(resp)
        return responses

    @classmethod
    async def update_subject(cls, db: AsyncSession, subject_id: str, update_in: SubjectUpdate) -> SubjectResponse:
        """Updates subject details."""
        subject = await db.get(Subject, subject_id)
        if not subject:
            raise SubjectNotFoundError(subject_id)

        update_dict = update_in.model_dump(exclude_unset=True)
        assigned_classes = update_dict.pop("assigned_classes", None)

        for field, value in update_dict.items():
            if field == "status" and value:
                value = value.upper()
            setattr(subject, field, value)

        if assigned_classes is not None:
            # Re-sync class links
            del_q = select(ClassSubject).where(ClassSubject.subject_id == subject_id)
            existing_links = (await db.execute(del_q)).scalars().all()
            for l in existing_links:
                await db.delete(l)

            for class_name in assigned_classes:
                cq = select(ClassSection).where(ClassSection.name == class_name)
                class_obj = (await db.execute(cq)).scalars().first()
                if class_obj:
                    link = ClassSubject(class_id=class_obj.id, subject_id=subject.id)
                    db.add(link)

        await db.commit()
        await db.refresh(subject)
        logger.info(f"Updated subject '{subject.code}' (ID: {subject.id})")
        return await cls._serialize_subject(db, subject)

    @classmethod
    async def delete_subject(cls, db: AsyncSession, subject_id: str) -> bool:
        """Deletes a subject or deactivates it if historical sessions exist."""
        subject = await db.get(Subject, subject_id)
        if not subject:
            raise SubjectNotFoundError(subject_id)

        # Check if historical sessions reference this subject
        sessions_q = select(func.count(AttendanceSession.id)).where(AttendanceSession.subject_id == subject_id)
        session_count = (await db.execute(sessions_q)).scalar_one()

        if session_count > 0:
            # Soft-deactivate to preserve historical records
            subject.status = "INACTIVE"
            await db.commit()
            logger.info(f"Subject '{subject.code}' has {session_count} sessions; deactivated status to INACTIVE.")
            return True

        await db.delete(subject)
        await db.commit()
        logger.info(f"Deleted subject '{subject.code}' (ID: {subject_id})")
        return True

    @staticmethod
    async def _serialize_subject(db: AsyncSession, subject: Subject) -> SubjectResponse:
        sessions_q = select(func.count(AttendanceSession.id)).where(AttendanceSession.subject_id == subject.id)
        session_count = (await db.execute(sessions_q)).scalar_one()

        # Fetch assigned class names
        classes_q = (
            select(ClassSection.name)
            .join(ClassSubject, ClassSubject.class_id == ClassSection.id)
            .where(ClassSubject.subject_id == subject.id)
        )
        assigned_classes = (await db.execute(classes_q)).scalars().all()

        return SubjectResponse(
            id=subject.id,
            code=subject.code,
            name=subject.name,
            short_name=subject.short_name,
            vertical=subject.vertical,
            department=subject.department,
            theory_hours=subject.theory_hours or 0,
            tutorial_hours=subject.tutorial_hours or 0,
            practical_hours=subject.practical_hours or 0,
            theory_credits=subject.theory_credits or 0,
            tutorial_credits=subject.tutorial_credits or 0,
            practical_credits=subject.practical_credits or 0,
            credits=subject.credits,
            semester=subject.semester,
            academic_year=subject.academic_year,
            status=subject.status,
            assigned_classes=list(assigned_classes),
            total_sessions_count=session_count,
            created_at=subject.created_at,
            updated_at=subject.updated_at,
        )

