import pytest
from sqlalchemy import select

from backend.app.core.security import hash_password
from backend.app.models.entities import AuditLog, ClassSection, Student, Subject, TeacherClassAssignment, User, UserStudentLink


@pytest.mark.asyncio
async def test_publish_correct_and_read_scoped_marks(staff_client, test_db_session):
    client, db = staff_client, test_db_session
    root = "/api/v1/semester-results"
    password = "SemesterMarks123"
    hashed = hash_password(password)
    def user(name, role, department=None):
        return User(username=name, email=f"{name}@example.com", full_name=name, role=role,
                    department=department, password_hash=hashed)
    def student(code, department, section):
        return Student(student_code=code, roll_number=code, first_name="Student", last_name=code,
                       email=f"{code}@example.com", department=department, class_name=section)
    own, other = student("R1", "COMP", "A"), student("R2", "MECH", "B")
    different_section = student("R3", "COMP", "A")
    different_section.section = "C"
    different_department = student("R4", "MECH", "A")
    learner, teacher, hod = user("learner", "STUDENT"), user("teacher", "FACULTY"), user("head", "HOD", "COMP")
    section = ClassSection(name="A", department="COMP", section="A")
    subject = Subject(code="M1", name="Math", department="COMP", semester=3, academic_year="2025-2026")
    db.add_all([own, other, different_section, different_department, learner, teacher, hod, section, subject])
    await db.flush()
    db.add_all([UserStudentLink(user_id=learner.id, student_id=own.id),
                TeacherClassAssignment(teacher_id=teacher.id, class_id=section.id)])
    await db.commit()
    async def headers(account):
        login = await client.post("/api/v1/auth/login", json={"username_or_email": account.username, "password": password})
        return {"Authorization": f"Bearer {login.json()['access_token']}"}
    data = {"subject_id": subject.id, "marks": 85, "maximum": 100}
    path = f"{root}/students/{own.id}"
    for account in (teacher, hod):
        auth = await headers(account)
        roster = await client.get(f"{root}/students", headers=auth)
        expected = {own.id} if account == teacher else {own.id, different_section.id}
        assert {s["id"] for s in roster.json()} == expected
        assert (await client.get(f"{root}/students/{other.id}", headers=auth)).status_code == 404
        assert (await client.put(f"{root}/students/{other.id}", headers=auth, json=data)).status_code == 404
        assert (await client.put(path, headers=auth, json=data)).status_code == 200
    assert (await client.put(path, json={**data, "marks": 101})).status_code == 422
    assert (await client.put(path, json={**data, "marks": 91})).status_code == 200
    audits = (await db.scalars(select(AuditLog).where(AuditLog.entity_type == "SemesterResult"))).all()
    assert len(audits) == 2
    created = next(row for row in audits if row.action == "CREATE")
    edited = next(row for row in audits if row.action == "UPDATE")
    assert created.user_id == teacher.id and created.old_values is None
    assert edited.old_values["marks"] == 85 and edited.new_values["marks"] == 91
    assert (await client.delete(f"/api/v1/subjects/{subject.id}")).status_code == 204
    auth = await headers(learner)
    assert (await client.put(path, headers=auth, json=data)).status_code == 403
    assert (await client.get(f"{root}/students/{other.id}", headers=auth)).status_code == 403
    mine = await client.get(f"{root}/mine", headers=auth)
    assert mine.json() == [{"academic_year": "2025-2026", "semester": 3, "code": "M1", "name": "Math",
                            "subject_id": subject.id, "marks": 91, "maximum": 100}]
