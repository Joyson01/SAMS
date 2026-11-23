import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.api.v1.classroom import PostInput, board, publish
from backend.app.models.entities import ClassSection, Student, TeacherClassAssignment, User, UserStudentLink


@pytest.mark.asyncio
async def test_classroom_stream_is_scoped(test_db_session):
    db = test_db_session
    first = ClassSection(id="first", name="TE-B", department="Computer Engineering")
    second = ClassSection(id="second", name="TE-A", department="Mechanical")
    users = [User(id=role, username=role, email=f"{role}@school.test", full_name=role,
                  role=role, password_hash="unused", department=first.department)
             for role in ("ADMIN", "HOD", "FACULTY", "STUDENT")]
    admin, hod, faculty, student_user = users
    student = Student(id="sid", student_code="P1", roll_number="1", first_name="A", last_name="B",
                      email="sid@school.test", department=first.department, class_name=first.name, section="B")
    db.add_all([first, second, student, *users])
    await db.flush()
    db.add_all([UserStudentLink(user_id=student_user.id, student_id=student.id),
                TeacherClassAssignment(teacher_id=faculty.id, class_id=first.id)])
    await db.flush()
    payload = PostInput(class_id=first.id, kind="assignment", title="Read chapter one", body="Pages 1–5.")
    await publish(payload, faculty, db)
    other = payload.model_copy(update={"class_id": second.id, "title": "Other class"})
    await publish(other, admin, db)
    for scoped_user in (hod, faculty):
        with pytest.raises(HTTPException) as rejected:
            await publish(other, scoped_user, db)
        assert rejected.value.status_code == 403
    for scoped_user in (hod, faculty, student_user):
        stream = await board(scoped_user, db)
        assert [p["title"] for p in stream["posts"]] == [payload.title]
        assert stream["can_publish"] == (scoped_user != student_user)
    student.section = "A"
    await db.flush()
    assert not (await board(student_user, db))["posts"]
    student.section = "B"
    student.department = second.department
    await db.flush()
    assert not (await board(student_user, db))["posts"]
    assert len((await board(admin, db))["posts"]) == 2


def test_rejects_other_links_and_material_deadlines():
    fields = dict(class_id="c", kind="material", title="Week 1", body="Notes")
    for extra in [{"classroom_url": "https://classroom.google.com.example.com/"}, {"due_date": "2027-02-02"}]:
        with pytest.raises(ValidationError):
            PostInput(**fields, **extra)
