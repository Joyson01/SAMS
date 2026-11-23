from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.database.base import Base
from backend.app.models.entities import GUID


class SemesterResult(Base):
    __tablename__ = "semester_results"
    __table_args__ = (
        CheckConstraint("maximum > 0 AND marks >= 0 AND marks <= maximum", name="valid_result_marks"),
    )

    student_id: Mapped[str] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True)
    academic_year: Mapped[str] = mapped_column(String(32), primary_key=True)
    semester: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[str] = mapped_column(GUID, ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True)
    marks: Mapped[int] = mapped_column(Integer)
    maximum: Mapped[int] = mapped_column(Integer)
