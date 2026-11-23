import pytest

from backend.app.models.entities import Batch, ClassSection, Student, TimetableEntry, UserStudentLink


@pytest.mark.asyncio
async def test_student_timetable_filters_class_and_batch(staff_client, test_db_session):
    db, client = test_db_session, staff_client
    path = "/api/v1/student-portal/timetable"
    assert (await client.get(path)).status_code == 403
    user = await client.post("/api/v1/auth/register", json={
        "username": "weekly", "email": "weekly@example.com",
        "full_name": "Weekly Schedule", "password": "StudentPassword123",
    })
    login = await client.post("/api/v1/auth/login", json={
        "username_or_email": "weekly", "password": "StudentPassword123",
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get(path, headers=headers)).status_code == 404
    own = ClassSection(name="TE-B", department="COMP", section="B")
    other = ClassSection(name="TE-A", department="COMP", section="A")
    db.add_all([own, other])
    await db.flush()
    first = Batch(name="B1", class_id=own.id)
    second = Batch(name="B2", class_id=own.id)
    foreign = Batch(name="B1", class_id=other.id)
    db.add_all([first, second, foreign])
    await db.flush()
    student = Student(student_code="pid", roll_number="1", first_name="My", last_name="Name",
                      email="s@example.com", class_name=own.name, section="B", department="COMP",
                      batch_id=first.id)
    db.add(student)
    await db.flush()
    db.add(UserStudentLink(user_id=user.json()["id"], student_id=student.id))

    def slot(label, **kwargs):
        return TimetableEntry(class_id=kwargs.pop("class_id", own.id), label=label, day_of_week="Monday",
                              start_time="09:00", end_time="10:00", **kwargs)

    db.add_all([slot("Lecture"), slot("Break", batch="ALL"), slot("Lab", batch_id=first.id),
                slot("Legacy lab", batch=" b1 "), slot("Other lab", batch_id=second.id, batch="ALL"),
                slot("Other legacy lab", batch="B2"), slot("Other class", class_id=other.id),
                slot("Archived", status="INACTIVE")])
    await db.commit()

    async def labels():
        response = await client.get(path, headers=headers, params={"class_id": other.id, "batch_id": second.id})
        assert response.status_code == 200, response.text
        return {item["label"] for item in response.json()["entries"]}

    assert await labels() == {"Lecture", "Break", "Lab", "Legacy lab"}
    for missing in (None, foreign.id):
        student.batch_id = missing
        await db.commit()
        assert await labels() == {"Lecture", "Break"}
    own.status = "INACTIVE"
    await db.commit()
    assert (await client.get(path, headers=headers)).status_code == 409
    student.status = "INACTIVE"
    await db.commit()
    assert (await client.get(path, headers=headers)).status_code == 403
