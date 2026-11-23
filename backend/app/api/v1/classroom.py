"""Publish and read posts in authorized academic classes."""
from datetime import date, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import require_roles
from backend.app.core.teacher_access import assigned_classes
from backend.app.database.session import get_db
from backend.app.models.classroom import ClassroomPost
from backend.app.models.entities import ClassSection, Student, User, UserStudentLink

router = APIRouter(prefix="/classroom", tags=["Classroom"])
staff = require_roles("ADMIN", "HOD", "FACULTY")
members = require_roles("ADMIN", "HOD", "FACULTY", "STUDENT")


class PostInput(BaseModel):
    class_id: str = Field(min_length=1, max_length=36)
    kind: Literal["assignment", "announcement", "material"]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]
    due_date: date | None = None
    classroom_url: str | None = Field(default=None, max_length=2048)

    @field_validator("classroom_url")
    @classmethod
    def classroom_address(cls, url):
        if url and (not url.startswith("https://classroom.google.com/") or any(ord(c) < 33 for c in url)):
            raise ValueError("Use an https://classroom.google.com/ link.")
        return url or None

    @model_validator(mode="after")
    def assignment_deadline(self):
        if self.kind != "assignment" and self.due_date:
            raise ValueError("Only assignments can have a due date.")
        return self


def visible_classes(user):
    query = select(ClassSection.id).where(ClassSection.status == "ACTIVE")
    if user.role == "FACULTY":
        query = query.where(ClassSection.id.in_(assigned_classes(user.id)))
    elif user.role == "HOD":
        query = query.where(ClassSection.department == user.department)
    elif user.role == "STUDENT":
        query = query.join(Student, Student.class_name == ClassSection.name).join(
            UserStudentLink, UserStudentLink.student_id == Student.id
        ).where(UserStudentLink.user_id == user.id, Student.status == "ACTIVE",
                Student.department == ClassSection.department, Student.section == ClassSection.section)
    return query


@router.get("")
async def board(user: User = Depends(members), db: AsyncSession = Depends(get_db)):
    allowed = visible_classes(user)
    classes = await db.execute(select(ClassSection.id, ClassSection.name)
                               .where(ClassSection.id.in_(allowed)).order_by(ClassSection.name))
    posts = await db.execute(select(ClassroomPost, User.full_name)
                             .outerjoin(User, User.id == ClassroomPost.author_id)
                             .where(ClassroomPost.class_id.in_(allowed))
                             .order_by(ClassroomPost.created_at.desc(), ClassroomPost.id.desc()))
    return {
        "classes": [dict(row._mapping) for row in classes],
        "can_publish": user.role != "STUDENT",
        "posts": [{
            "id": post.id, "class_id": post.class_id, "title": post.title, "body": post.body,
            "kind": post.kind, "due_date": post.due_date, "classroom_url": post.classroom_url,
            "author": author, "created_at": post.created_at.replace(tzinfo=timezone.utc)
            if post.created_at.tzinfo is None else post.created_at,
        } for post, author in posts],
    }


@router.post("", status_code=201)
async def publish(payload: PostInput, user: User = Depends(staff), db: AsyncSession = Depends(get_db)):
    if not await db.scalar(visible_classes(user).where(ClassSection.id == payload.class_id)):
        raise HTTPException(403, "You cannot publish to this class.")
    post = ClassroomPost(author_id=user.id, **payload.model_dump())
    db.add(post)
    await db.flush()
    return {"id": post.id}
