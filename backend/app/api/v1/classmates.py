"""Directory and private messages for students in the same active division."""
from datetime import timezone
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StringConstraints
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.v1.student_portal import linked_student, student_only
from backend.app.database.session import get_db
from backend.app.models.classroom import ClassmateMessage
from backend.app.models.entities import Student, User, UserStudentLink

router = APIRouter(prefix="/student-portal", tags=["Student Portal"])


async def active_student(db, user):
    own = await db.get(Student, await linked_student(db, user))
    if own is None or own.status != "ACTIVE":
        raise HTTPException(403, "An active student record is required to view classmates.")
    if not all(value and value.strip() for value in (own.department, own.class_name, own.section)):
        raise HTTPException(409, "Ask your administrator to complete your class assignment.")
    return own


def classmates_query(own):
    return select(Student, User.id).outerjoin(UserStudentLink, UserStudentLink.student_id == Student.id).outerjoin(
        User, and_(User.id == UserStudentLink.user_id, User.role == "STUDENT", User.is_active.is_(True))
    ).where(Student.department == own.department, Student.class_name == own.class_name,
            Student.section == own.section, Student.status == "ACTIVE", Student.id != own.id)


@router.get("/classmates")
async def classmates(db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    own = await active_student(db, user)
    rows = await db.execute(classmates_query(own))
    ordered = sorted(rows, key=lambda row: [
        (0, int(part)) if part.isdecimal() else (1, part.casefold())
        for part in re.split(r"([0-9]+)", row[0].roll_number)
    ])
    return {"department": own.department, "class_name": own.class_name, "section": own.section,
            "students": [{"id": student.id, "roll_number": student.roll_number, "first_name": student.first_name,
                          "last_name": student.last_name, "can_chat": account is not None} for student, account in ordered]}


class MessageInput(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


async def chat_members(db, user, peer_id):
    own = await active_student(db, user)
    peer = (await db.execute(classmates_query(own).where(Student.id == peer_id, User.id.is_not(None)))).first()
    if peer is None:
        raise HTTPException(404, "This classmate is unavailable for chat.")
    return own.id, peer_id


def message_data(message, own_id):
    timestamp = message.created_at
    return {"id": message.id, "body": message.body, "mine": message.sender_id == own_id,
            "created_at": timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)}


@router.get("/classmates/{peer_id}/messages")
async def messages(peer_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    message = ClassmateMessage
    rows = (await db.scalars(select(message).where(or_(
        and_(message.sender_id == own, message.recipient_id == peer),
        and_(message.sender_id == peer, message.recipient_id == own),
    )).order_by(message.created_at.desc(), message.id.desc()).limit(100))).all()
    return [message_data(row, own) for row in reversed(rows)]


@router.post("/classmates/{peer_id}/messages", status_code=201)
async def send_message(peer_id: str, payload: MessageInput, db: AsyncSession = Depends(get_db),
                       user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    message = ClassmateMessage(sender_id=own, recipient_id=peer, body=payload.body)
    db.add(message)
    await db.flush()
    return message_data(message, own)
