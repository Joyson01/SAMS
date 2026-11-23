import pytest

from backend.app.models.entities import Student, UserStudentLink


@pytest.mark.asyncio
async def test_classmates_directory_and_private_chat(staff_client, test_db_session):
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
    friend.roll_number, second.roll_number = "2", "10"
    outsider = student("outsider", section="A")
    db = test_db_session
    db.add_all([own, friend, second, outsider, student("otherclass", class_name="SE-B"),
                student("otherdept", department="Civil"), student("former", status="INACTIVE")])
    await db.flush()
    db.add(UserStudentLink(user_id=user["id"], student_id=own.id))
    await db.commit()

    async def link_account(record):
        account = {**credentials, "username": record.first_name, "email": record.email}
        created = await staff_client.post("/api/v1/auth/register", json=account)
        db.add(UserStudentLink(user_id=created.json()["id"], student_id=record.id))
        await db.commit()
        login = await staff_client.post("/api/v1/auth/login", json={
            "username_or_email": account["username"], "password": account["password"],
        })
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    friend_headers = await link_account(friend)
    outside_headers = await link_account(outsider)
    response = await staff_client.get(portal, headers=headers)
    assert response.json()["students"] == [
        {"id": friend.id, "roll_number": "2", "first_name": "friend", "last_name": "Student", "can_chat": True},
        {"id": second.id, "roll_number": "10", "first_name": "another", "last_name": "Student", "can_chat": False},
    ]
    conversation = f"{portal}/{friend.id}/messages"
    sent = await staff_client.post(conversation, headers=headers, json={"body": "Hello from TE-B"})
    assert sent.status_code == 201, sent.text
    assert sent.json()["mine"]
    received = await staff_client.get(f"{portal}/{own.id}/messages", headers=friend_headers)
    assert received.json() == [{**sent.json(), "mine": False}]
    outsider_read = await staff_client.get(conversation, headers=outside_headers)
    assert outsider_read.status_code == 404
    assert (await staff_client.post(f"{portal}/{outsider.id}/messages", headers=headers, json={"body": "Hi"})).status_code == 404
    own.status = "INACTIVE"
    await db.commit()
    assert (await staff_client.get(portal, headers=headers)).status_code == 403
