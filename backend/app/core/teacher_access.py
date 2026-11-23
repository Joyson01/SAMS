"""Authorize teachers against their assigned academic classes."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import AttendanceSession, ClassSection, Student, TeacherClassAssignment, User


def assigned_classes(teacher_id: str):
    return select(TeacherClassAssignment.class_id).where(
        TeacherClassAssignment.teacher_id == teacher_id
    )


def assigned_class_names(teacher_id: str):
    return select(ClassSection.name).where(ClassSection.id.in_(assigned_classes(teacher_id)))


async def require_student_access(db: AsyncSession, user: User, student_id: str) -> None:
    if user.role == "FACULTY":
        permitted = await db.scalar(
            select(Student.id).where(
                Student.id == student_id, Student.class_name.in_(assigned_class_names(user.id))
            )
        )
        if permitted is None:
            raise HTTPException(403, "This student is outside your assigned classes.")


async def require_class_access(db: AsyncSession, user: User, class_id: str | None) -> None:
    if user.role == "FACULTY" and (
        not class_id or not await db.scalar(assigned_classes(user.id).where(
            TeacherClassAssignment.class_id == class_id
        ))
    ):
        raise HTTPException(403, "This class is outside your assigned classes.")


async def require_session_access(db: AsyncSession, user: User, session_id: str) -> None:
    if user.role == "FACULTY":
        session = await db.get(AttendanceSession, session_id)
        if session is None:
            raise HTTPException(404, "Attendance session not found.")
        await require_class_access(db, user, session.class_id)
