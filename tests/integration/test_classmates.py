import pytest

from backend.app.models.entities import Student, StudentPortalDetails, UserStudentLink


@pytest.mark.asyncio
async def test_classmates_are_division_scoped_and_names_only(staff_client, test_db_session):
    portal = "/api/v1/student-portal/classmates"
    assert (await staff_client.get(portal)).status_code == 403
    credentials = {"username": "directory", "email": "directory@example.com",
                   "password": "DirectoryStudent123", "full_name": "Directory Student"}
    user = (await staff_client.post("/api/v1/auth/register", json=credentials)).json()
    login = await staff_client.post("/api/v1/auth/login", json={
        "username_or_email": credentials["username"], "password": credentials["password"],
    })
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await staff_client.get(portal, headers=headers)).status_code == 404

    def student(code, **changes):
        fields = dict(class_name="TE-B", section="B", department="Computer Engineering", status="ACTIVE")
        fields.update(changes)
        return Student(first_name=code, last_name="Student", student_code=code, roll_number=code,
                       email=f"{code}@example.com", **fields)

    own, friend, second = student("own"), student("friend"), student("another")
    test_db_session.add_all([own, friend, second, student("otherclass", class_name="SE-B"),
                             student("otherdept", department="Civil"), student("otherdivision", section="A"),
                             student("former", status="INACTIVE")])
    await test_db_session.flush()
    test_db_session.add_all([UserStudentLink(user_id=user["id"], student_id=own.id),
                             StudentPortalDetails(student_id=friend.id, roster_name="Official Roster Name")])
    await test_db_session.commit()
    response = await staff_client.get(portal, headers=headers)
    assert response.json() == {"class_name": "TE-B", "section": "B", "department": "Computer Engineering",
                               "names": ["another Student", "Official Roster Name"]}
    own.status = "INACTIVE"
    await test_db_session.commit()
    assert (await staff_client.get(portal, headers=headers)).status_code == 403
