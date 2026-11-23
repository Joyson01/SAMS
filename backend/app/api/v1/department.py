from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import require_roles
from backend.app.database.session import get_db
from backend.app.models.entities import AttendanceSession, ClassSection, Student, User

router = APIRouter(prefix="/department", tags=["Department"])


class DepartmentOverview(BaseModel):
    department: str
    classes: int
    active_students: int
    active_sessions: int


@router.get("/overview", response_model=DepartmentOverview)
async def overview(
    user: User = Depends(require_roles("HOD")),
    db: AsyncSession = Depends(get_db),
):
    if not user.department:
        raise HTTPException(403, "This account has no assigned department.")

    classes = select(ClassSection.id).where(ClassSection.department == user.department)
    class_count = await db.scalar(select(func.count()).select_from(classes.subquery()))
    student_count = await db.scalar(
        select(func.count()).select_from(Student).where(
            Student.department == user.department, Student.status == "ACTIVE",
        )
    )
    session_count = await db.scalar(
        select(func.count()).select_from(AttendanceSession).where(
            AttendanceSession.class_id.in_(classes), AttendanceSession.status == "ACTIVE",
        )
    )
    return DepartmentOverview(
        department=user.department,
        classes=class_count,
        active_students=student_count,
        active_sessions=session_count,
    )
