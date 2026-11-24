"""Publish and read posts in authorized academic classes."""
from datetime import date, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import require_roles
from backend.app.core.teacher_access import assigned_classes
from backend.app.database.session import get_db
from backend.app.models.classroom import AssignmentSubmission, ClassroomPost
from backend.app.models.entities import ClassSection, Student, User, UserStudentLink

from backend.app.services.audit_service import record_student_activity

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
                             .where(ClassroomPost.class_id.in_(allowed), ClassroomPost.kind != "group_message")
                             .order_by(ClassroomPost.created_at.desc(), ClassroomPost.id.desc()))
    own_submissions = {}
    if user.role == "STUDENT":
        rows = await db.scalars(select(AssignmentSubmission)
                                .join(UserStudentLink, UserStudentLink.student_id == AssignmentSubmission.student_id)
                                .join(ClassroomPost, ClassroomPost.id == AssignmentSubmission.post_id)
                                .where(UserStudentLink.user_id == user.id, ClassroomPost.class_id.in_(allowed)))
        own_submissions = {row.post_id: submission_view(row) for row in rows}
    return {
        "classes": [dict(row._mapping) for row in classes],
        "can_publish": user.role != "STUDENT",
        "posts": [{
            "id": post.id, "class_id": post.class_id, "title": post.title, "body": post.body,
            "kind": post.kind, "due_date": post.due_date, "classroom_url": post.classroom_url,
            "my_submission": own_submissions.get(post.id), "author": author, "created_at": post.created_at.replace(tzinfo=timezone.utc)
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


class ClassNoteInput(BaseModel):
    class_id: str = Field(min_length=1, max_length=36)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]


@router.post("/notes", status_code=201)
async def share_note(
    payload: ClassNoteInput,
    user: User = Depends(require_roles("STUDENT")),
    db: AsyncSession = Depends(get_db),
):
    if not await db.scalar(visible_classes(user).where(ClassSection.id == payload.class_id)):
        raise HTTPException(403, "You can only share notes with your own class.")
    post = ClassroomPost(author_id=user.id, kind="material", **payload.model_dump())
    db.add(post)
    await db.flush()
    record_student_activity(db, user, "SHARE_NOTE", "ClassroomPost", post.id, metadata={"class_id": post.class_id})
    return {"id": post.id}


class GroupMessageInput(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


def group_message_data(post: ClassroomPost, author: str | None, user: User):
    created_at = post.created_at
    return {"id": post.id, "body": post.body, "author": author or "Former member",
            "mine": post.author_id == user.id,
            "created_at": created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)}


@router.get("/{class_id}/messages")
async def group_messages(class_id: str, user: User = Depends(members), db: AsyncSession = Depends(get_db)):
    if not await db.scalar(visible_classes(user).where(ClassSection.id == class_id)):
        raise HTTPException(403, "This group chat is only available to class members.")
    rows = (await db.execute(
        select(ClassroomPost, User.full_name).outerjoin(User, User.id == ClassroomPost.author_id)
        .where(ClassroomPost.class_id == class_id, ClassroomPost.kind == "group_message")
        .order_by(ClassroomPost.created_at.desc(), ClassroomPost.id.desc()).limit(100)
    )).all()
    return [group_message_data(post, author, user) for post, author in reversed(rows)]


@router.post("/{class_id}/messages", status_code=201)
async def send_group_message(class_id: str, payload: GroupMessageInput, user: User = Depends(members),
                             db: AsyncSession = Depends(get_db)):
    if not await db.scalar(visible_classes(user).where(ClassSection.id == class_id)):
        raise HTTPException(403, "This group chat is only available to class members.")
    post = ClassroomPost(class_id=class_id, author_id=user.id, kind="group_message", title="", body=payload.body)
    db.add(post)
    await db.flush()
    record_student_activity(db, user, "SEND_GROUP_MESSAGE", "ClassroomPost", post.id, metadata={"class_id": class_id})
    return group_message_data(post, user.full_name, user)


class SubmissionInput(BaseModel):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]


def submission_view(submission):
    submitted = submission.submitted_at
    return {"answer": submission.answer, "submitted_at": submitted if submitted.tzinfo else submitted.replace(tzinfo=timezone.utc)}


async def require_assignment(post_id, user, db):
    post = await db.scalar(select(ClassroomPost).where(
        ClassroomPost.id == post_id, ClassroomPost.class_id.in_(visible_classes(user)),
        ClassroomPost.kind == "assignment"))
    if post is None:
        raise HTTPException(404, "Assignment unavailable.")


@router.put("/{post_id}/submission")
async def turn_in(post_id: str, payload: SubmissionInput, user: User = Depends(require_roles("STUDENT")),
                  db: AsyncSession = Depends(get_db)):
    await require_assignment(post_id, user, db)
    student_id = await db.scalar(select(UserStudentLink.student_id).where(UserStudentLink.user_id == user.id))
    key = (post_id, student_id)
    existing = await db.get(AssignmentSubmission, key)
    if existing is None:
        submission = AssignmentSubmission(post_id=post_id, student_id=student_id, answer=payload.answer)
        try:
            async with db.begin_nested():
                db.add(submission)
                await db.flush()
            record_student_activity(db, user, "TURN_IN_ASSIGNMENT", "AssignmentSubmission", post_id)
            return submission_view(submission)
        except IntegrityError:
            existing = await db.get(AssignmentSubmission, key)
            if existing is None:
                raise
    if existing.answer != payload.answer:
        raise HTTPException(409, "You have already turned in this assignment.")
    return submission_view(existing)


@router.get("/{post_id}/submissions")
async def review_submissions(post_id: str, user: User = Depends(staff), db: AsyncSession = Depends(get_db)):
    await require_assignment(post_id, user, db)
    rows = await db.execute(select(AssignmentSubmission, Student)
                            .join(Student, Student.id == AssignmentSubmission.student_id)
                            .where(AssignmentSubmission.post_id == post_id)
                            .order_by(Student.roll_number, Student.id))
    return [{**submission_view(submission), "student_id": student.id, "roll_number": student.roll_number,
             "student_name": f"{student.first_name} {student.last_name}"} for submission, student in rows]
