"""Directory and private messages for students in the same active division."""
from datetime import timezone
import re
from urllib.parse import quote
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, File, Response, UploadFile
from pydantic import BaseModel, StringConstraints
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.v1.student_portal import linked_student, student_only
from backend.app.database.session import get_db
from backend.app.models.classroom import ClassmateAttachment, ClassmateMessage
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


def message_data(message, own_id, filename=None):
    timestamp = message.created_at
    result = {"id": message.id, "body": message.body, "mine": message.sender_id == own_id,
              "created_at": timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)}
    if filename:
        result["filename"] = filename
    return result


@router.get("/classmates/{peer_id}/messages")
async def messages(peer_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    message = ClassmateMessage
    rows = (await db.execute(select(message, ClassmateAttachment.filename).outerjoin(
        ClassmateAttachment, ClassmateAttachment.message_id == message.id,
    ).where(or_(
        and_(message.sender_id == own, message.recipient_id == peer),
        and_(message.sender_id == peer, message.recipient_id == own),
    )).order_by(message.created_at.desc(), message.id.desc()).limit(100))).all()
    return [message_data(row, own, filename) for row, filename in reversed(rows)]


@router.post("/classmates/{peer_id}/messages", status_code=201)
async def send_message(peer_id: str, payload: MessageInput, db: AsyncSession = Depends(get_db),
                       user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    message = ClassmateMessage(sender_id=own, recipient_id=peer, body=payload.body)
    db.add(message)
    await db.flush()
    return message_data(message, own)


@router.get("/classmates/inbox")
async def inbox(db: AsyncSession = Depends(get_db), user: User = Depends(student_only)):
    own = await active_student(db, user)
    peers = classmates_query(own).with_only_columns(Student.id).where(User.id.is_not(None))
    message = ClassmateMessage
    rows = await db.execute(select(message, Student.first_name, Student.last_name, ClassmateAttachment.filename)
                            .join(Student, Student.id == message.sender_id)
                            .outerjoin(ClassmateAttachment, ClassmateAttachment.message_id == message.id)
                            .where(message.recipient_id == own.id, message.sender_id.in_(peers))
                            .order_by(message.created_at.desc(), message.id.desc()).limit(10))
    return [{**message_data(row, own.id, filename), "body": row.body[:140], "peer_id": row.sender_id,
             "sender": f"{first} {last}"} for row, first, last, filename in rows]


MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


@router.post("/classmates/{peer_id}/attachments", status_code=201)
async def send_attachment(peer_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                          user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    content = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Choose a file of 10 MB or less.")
    if not content:
        raise HTTPException(422, "Choose a file that is not empty.")
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    filename = "".join(character for character in filename if character.isprintable()).strip()[:255] or "attachment"
    message = ClassmateMessage(sender_id=own, recipient_id=peer, body="")
    db.add(message)
    await db.flush()
    db.add(ClassmateAttachment(message_id=message.id, filename=filename, content=content))
    await db.flush()
    return message_data(message, own, filename)


@router.get("/classmates/{peer_id}/attachments/{message_id}")
async def download_attachment(peer_id: str, message_id: str, db: AsyncSession = Depends(get_db),
                              user: User = Depends(student_only)):
    own, peer = await chat_members(db, user, peer_id)
    message = ClassmateMessage
    attachment = await db.scalar(select(ClassmateAttachment).join(message, message.id == ClassmateAttachment.message_id)
                                 .where(message.id == message_id, or_(
                                     and_(message.sender_id == own, message.recipient_id == peer),
                                     and_(message.sender_id == peer, message.recipient_id == own),
                                 )))
    if attachment is None:
        raise HTTPException(404, "Attachment not found.")
    return Response(attachment.content, media_type="application/octet-stream", headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(attachment.filename, safe=""),
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    })
