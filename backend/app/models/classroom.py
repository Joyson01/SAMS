from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database.base import Base
from backend.app.models.entities import GUID, generate_uuid, utc_now


class ClassroomPost(Base):
    __tablename__ = "classroom_posts"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    class_id: Mapped[str] = mapped_column(GUID, ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str | None] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    classroom_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    post_id: Mapped[str] = mapped_column(GUID, ForeignKey("classroom_posts.id", ondelete="CASCADE"), primary_key=True)
    student_id: Mapped[str] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True)
    answer: Mapped[str] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
