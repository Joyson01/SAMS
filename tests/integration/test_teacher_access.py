import pytest


@pytest.mark.asyncio
async def test_teacher_can_work_only_in_assigned_sessions(staff_client):
    client = staff_client
    sessions = {}
    classes = {}
    for class_name in ("CS-A", "CS-B"):
        section = await client.post("/api/v1/classes", json={"name": class_name, "department": "CS"})
        assert section.status_code == 201, section.text
        classes[class_name] = section.json()["id"]
        created = await client.post("/api/v1/attendance/sessions", json={
            "class_id": classes[class_name], "class_name": class_name,
            "subject": "Computing", "room": "101", "start_time": "09:00", "end_time": "10:00",
        })
        assert created.status_code == 201, created.text
        sessions[class_name] = created.json()["id"]

    account = await client.post("/api/v1/auth/users", json={
        "username": "scope_teacher", "email": "scope@example.com", "full_name": "Scope Teacher",
        "role": "FACULTY", "password": "TeacherPass123",
    })
    assert account.status_code == 201, account.text
    assigned = await client.put(f"/api/v1/teacher-assignments/{account.json()['id']}", json={
        "class_ids": [classes["CS-A"]],
    })
    assert assigned.status_code == 200, assigned.text

    login = await client.post("/api/v1/auth/login", json={
        "username_or_email": "scope_teacher", "password": "TeacherPass123",
    })
    assert login.status_code == 200, login.text
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    class_listing = await client.get("/api/v1/classes")
    assert [item["id"] for item in class_listing.json()] == [classes["CS-A"]]

    listing = await client.get("/api/v1/attendance/sessions")
    assert [item["id"] for item in listing.json()] == [sessions["CS-A"]]
    allowed, denied = (f"/api/v1/attendance/sessions/{sessions[key]}" for key in ("CS-A", "CS-B"))
    assert (await client.get(f"{allowed}/roster")).status_code == 200
    assert (await client.put(f"{allowed}/start")).status_code == 200
    assert (await client.get(f"{denied}/roster")).status_code == 403
    assert (await client.put(f"{denied}/start")).status_code == 403
    assert (await client.post("/api/v1/attendance/manual", params={
        "session_id": sessions["CS-A"], "student_id": "outside-roster",
    })).status_code == 403
    assert (await client.post("/api/v1/media-attendance/image/preview", data={
        "session_id": sessions["CS-B"],
    }, files={"images": ("ignored.jpg", b"dummy", "image/jpeg")})).status_code == 403
    assert (await client.get("/api/v1/media-attendance/jobs", params={
        "session_id": sessions["CS-B"],
    })).status_code == 403
    denied_create = await client.post("/api/v1/attendance/sessions", json={
        "class_name": "CS-B", "subject": "Computing", "room": "101",
        "start_time": "11:00", "end_time": "12:00",
    })
    assert denied_create.status_code == 403
