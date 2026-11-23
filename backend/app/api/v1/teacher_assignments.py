from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import require_roles
from backend.app.database.session import get_db
from backend.app.models.entities import ClassSection, TeacherClassAssignment, User

router = APIRouter(
    prefix="/teacher-assignments",
    tags=["Teacher Assignments"],
    dependencies=[Depends(require_roles("ADMIN"))],
)


class AssignmentUpdate(BaseModel):
    class_ids: list[UUID] = Field(max_length=100)


async def require_teacher(db: AsyncSession, teacher_id: str, *, lock: bool = False):
    query = select(User.id).where(User.id == teacher_id, User.role == "FACULTY")
    if lock:
        query = query.with_for_update()
    if await db.scalar(query) is None:
        raise HTTPException(404, "Teacher account not found.")


@router.get("/{teacher_id}", response_model=AssignmentUpdate)
async def get_assignments(teacher_id: UUID, db: AsyncSession = Depends(get_db)):
    await require_teacher(db, str(teacher_id))
    class_ids = await db.scalars(
        select(TeacherClassAssignment.class_id)
        .where(TeacherClassAssignment.teacher_id == str(teacher_id))
        .order_by(TeacherClassAssignment.class_id)
    )
    return AssignmentUpdate(class_ids=list(class_ids))


@router.put("/{teacher_id}", response_model=AssignmentUpdate)
async def save_assignments(
    teacher_id: UUID,
    payload: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    await require_teacher(db, str(teacher_id), lock=True)
    class_ids = {str(class_id) for class_id in payload.class_ids}
    existing = set(await db.scalars(select(ClassSection.id).where(ClassSection.id.in_(class_ids))))
    if existing != class_ids:
        raise HTTPException(422, "One or more selected classes no longer exist.")

    await db.execute(
        delete(TeacherClassAssignment).where(TeacherClassAssignment.teacher_id == str(teacher_id))
    )
    db.add_all(
        TeacherClassAssignment(teacher_id=str(teacher_id), class_id=class_id)
        for class_id in sorted(class_ids)
    )
    await db.commit()
    return AssignmentUpdate(class_ids=sorted(class_ids))
