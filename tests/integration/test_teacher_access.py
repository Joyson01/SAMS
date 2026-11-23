import pytest


@pytest.mark.asyncio
async def test_teacher_can_work_only_in_assigned_sessions(staff_client):
    client = staff_client
    sessions = {}
    classes = {}
    slots = {}
    students = {}
    for class_name in ("CS-A", "CS-B"):
        section = await client.post("/api/v1/classes", json={"name": class_name, "department": "CS"})
        assert section.status_code == 201, section.text
        classes[class_name] = section.json()["id"]
        slot = await client.post(f"/api/v1/classes/{classes[class_name]}/timetable", json={
            "class_id": classes[class_name], "day_of_week": "Monday",
            "start_time": "09:00", "end_time": "10:00", "label": "Computing",
        })
        assert slot.status_code == 201, slot.text
        slots[class_name] = slot.json()["id"]
        created = await client.post("/api/v1/attendance/sessions", json={
            "class_id": classes[class_name], "class_name": class_name,
            "subject": "Computing", "room": "101", "start_time": "09:00", "end_time": "10:00",
        })
        assert created.status_code == 201, created.text
        sessions[class_name] = created.json()["id"]

        student = await client.post("/api/v1/students", json={
            "student_code": f"{class_name}-1", "roll_number": f"{class_name}-1",
            "first_name": class_name, "last_name": "Student",
            "email": f"{class_name.lower()}-student@example.com",
            "department": "CS", "class_name": class_name,
        })
        assert student.status_code == 201, student.text
        students[class_name] = student.json()["id"]
        marked = await client.post("/api/v1/attendance/manual", params={
            "session_id": sessions[class_name], "student_id": student.json()["id"],
            "remarks": "=1+1",
        })
        assert marked.status_code == 200, marked.text

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

    report = await client.get("/api/v1/reports/analytics")
    assert report.status_code == 200, report.text
    report_data = report.json()
    assert report_data["total_students_enrolled"] == 1
    assert report_data["total_sessions_conducted"] == 1
    assert [row["class_name"] for row in report_data["class_breakdowns"]] == ["CS-A"]

    csv_report = await client.get("/api/v1/reports/export/csv")
    assert csv_report.status_code == 200, csv_report.text
    assert "CS-A-1" in csv_report.text and "CS-B-1" not in csv_report.text
    assert "'=1+1" in csv_report.text
    assert (await client.get("/api/v1/reports/export/csv", params={
        "session_id": sessions["CS-B"],
    })).status_code == 403
    assert (await client.get("/api/v1/dashboard/summary")).status_code == 403

    timetable = await client.get("/api/v1/classes/timetable/entries")
    assert timetable.status_code == 200, timetable.text
    assert [item["class_id"] for item in timetable.json()] == [classes["CS-A"]]
    for path in ("", "/timetable", "/subjects", "/batches"):
        assert (await client.get(f"/api/v1/classes/{classes['CS-B']}{path}")).status_code == 403
    assert (await client.get(f"/api/v1/classes/{classes['CS-A']}/timetable")).status_code == 200
    assert (await client.put(f"/api/v1/classes/timetable/entries/{slots['CS-A']}", json={
        "label": "Teacher edit",
    })).status_code == 403
    assert (await client.delete(f"/api/v1/classes/{classes['CS-A']}")).status_code == 403
    assert (await client.post("/api/v1/subjects", json={
        "code": "TEST", "name": "Test", "department": "CS",
    })).status_code == 403
    assert (await client.get("/api/v1/sync/pull")).status_code == 403

    directory = await client.get("/api/v1/students")
    assert directory.status_code == 200, directory.text
    assert [item["id"] for item in directory.json()["items"]] == [students["CS-A"]]
    stats = await client.get("/api/v1/students/stats")
    assert stats.json()["total_students"] == 1
    assert (await client.get(f"/api/v1/students/{students['CS-A']}/enroll/status")).status_code == 200
    assert (await client.get(f"/api/v1/students/{students['CS-B']}/enroll/status")).status_code == 403
    assert (await client.get(f"/api/v1/students/{students['CS-B']}")).status_code == 403
    assert (await client.get(f"/api/v1/attendance/students/{students['CS-A']}")).status_code == 200
    assert (await client.get(f"/api/v1/attendance/students/{students['CS-B']}")).status_code == 403
    assert (await client.put(f"/api/v1/students/{students['CS-A']}", json={
        "class_name": "CS-B",
    })).status_code == 403
