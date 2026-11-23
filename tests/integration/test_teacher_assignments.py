from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_admin_can_replace_teacher_classes_and_teacher_cannot_edit(staff_client):
    client = staff_client
    created = await client.post("/api/v1/auth/users", json={
        "username": "assigned_teacher",
        "email": "teacher@example.com",
        "full_name": "Assigned Teacher",
        "password": "Assignment123",
        "role": "FACULTY",
    })
    assert created.status_code == 201, created.text
    path = f"/api/v1/teacher-assignments/{created.json()['id']}"
    assert (await client.get(path)).json() == {"class_ids": []}

    section = await client.post("/api/v1/classes", json={"name": "CS-A", "department": "CS"})
    assert section.status_code == 201, section.text
    class_id = section.json()["id"]

    saved = await client.put(path, json={"class_ids": [class_id, class_id]})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"class_ids": [class_id]}

    missing = await client.put(path, json={"class_ids": [str(uuid4())]})
    assert missing.status_code == 422
    assert (await client.get(path)).json() == {"class_ids": [class_id]}
    assert (await client.put(path, json={"class_ids": []})).json() == {"class_ids": []}

    login = await client.post("/api/v1/auth/login", json={
        "username_or_email": "assigned_teacher", "password": "Assignment123",
    })
    assert login.status_code == 200, login.text
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    assert (await client.get(path)).status_code == 403
    assert (await client.put(path, json={"class_ids": [class_id]})).status_code == 403
