"""Publish subject marks and show each student their linked marksheet."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.v1.student_portal import linked_student
from backend.app.core.security import require_roles
from backend.app.core.teacher_access import assigned_classes
from backend.app.database.session import get_db
from backend.app.models.entities import AuditLog, ClassSection, Student, Subject, User
from backend.app.models.semester_result import SemesterResult

router = APIRouter(prefix="/semester-results", tags=["Semester Results"])
staff = require_roles("ADMIN", "HOD", "FACULTY")


class MarkEntry(BaseModel):
    subject_id: str = Field(min_length=1, max_length=36)
    marks: int = Field(ge=0, le=100000)
    maximum: int = Field(gt=0, le=100000)

    @model_validator(mode="after")
    def check_total(self):
        if self.marks > self.maximum:
            raise ValueError("Marks cannot exceed the maximum.")
        return self


def students_in_scope(user: User):
    query = select(Student)
    if user.role == "FACULTY":
        query = query.where(select(ClassSection.id).where(
            ClassSection.id.in_(assigned_classes(user.id)), ClassSection.name == Student.class_name,
            ClassSection.department == Student.department, ClassSection.section == Student.section,
        ).exists())
    elif user.role == "HOD":
        if not user.department:
            raise HTTPException(403, "Assign a department before accessing marks.")
        query = query.where(Student.department == user.department)
    return query


async def scoped_student(db, user, student_id):
    student = await db.scalar(students_in_scope(user).where(Student.id == student_id))
    if student is None:
        raise HTTPException(404, "Student unavailable.")
    return student


async def marksheet(db, sid):
    query = select(
        SemesterResult.academic_year, SemesterResult.semester, Subject.code, Subject.name,
        SemesterResult.subject_id, SemesterResult.marks, SemesterResult.maximum,
    ).join(Subject, Subject.id == SemesterResult.subject_id).where(
        SemesterResult.student_id == sid
    ).order_by(SemesterResult.academic_year.desc(), SemesterResult.semester.desc(), Subject.code)
    return (await db.execute(query)).mappings().all()


@router.get("/mine")
async def own_results(db: AsyncSession = Depends(get_db), user: User = Depends(require_roles("STUDENT"))):
    return await marksheet(db, await linked_student(db, user))


@router.get("/students")
async def roster(db: AsyncSession = Depends(get_db), user: User = Depends(staff)):
    query = students_in_scope(user).with_only_columns(
        Student.id, Student.roll_number, Student.first_name, Student.last_name, Student.class_name,
    ).order_by(Student.class_name, Student.roll_number)
    return (await db.execute(query)).mappings().all()


@router.get("/students/{student_id}")
async def staff_sheet(student_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(staff)):
    student = await scoped_student(db, user, student_id)
    subjects = await db.execute(select(
        Subject.id, Subject.code, Subject.name, Subject.academic_year, Subject.semester,
    ).where(Subject.department == student.department, Subject.status == "ACTIVE").order_by(
        Subject.academic_year.desc(), Subject.semester.desc(), Subject.code))
    return {"results": await marksheet(db, student.id), "subjects": subjects.mappings().all()}


@router.put("/students/{student_id}")
async def publish(student_id: str, payload: MarkEntry, db: AsyncSession = Depends(get_db), user: User = Depends(staff)):
    student = await scoped_student(db, user, student_id)
    subject = await db.scalar(select(Subject).where(
        Subject.id == payload.subject_id, Subject.department == student.department, Subject.status == "ACTIVE",
    ))
    if subject is None:
        raise HTTPException(422, "Choose an active subject in the student's department.")
    key = dict(student_id=student.id, academic_year=subject.academic_year, semester=subject.semester, subject_id=subject.id)
    result = await db.get(SemesterResult, key, with_for_update=True)
    old_values = {**key, "marks": result.marks, "maximum": result.maximum} if result else None
    if result is None:
        result = SemesterResult(**key)
        db.add(result)
    result.marks, result.maximum = payload.marks, payload.maximum
    new_values = {**key, "marks": payload.marks, "maximum": payload.maximum}
    if new_values != old_values:
        db.add(AuditLog(user_id=user.id, entity_type="SemesterResult", entity_id=student.id,
                        action="UPDATE" if old_values else "CREATE", old_values=old_values, new_values=new_values))
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "The result changed. Reload the marksheet and try again.") from exc
    return await marksheet(db, student.id)
