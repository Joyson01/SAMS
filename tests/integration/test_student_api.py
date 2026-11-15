import pytest


@pytest.mark.asyncio
async def test_student_endpoints_require_auth(client):
    """Verifies that unauthenticated access to student endpoints is rejected."""
    resp = await client.get("/api/v1/students")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_student_crud_lifecycle(staff_client):
    # 1. Create Student
    payload = {
        "student_code": "STU-API-001",
        "roll_number": "CSE-API-01",
        "first_name": "Kavya",
        "last_name": "Nair",
        "email": "kavya.nair@campus.edu",
        "department": "Computer Science",
        "class_name": "CSE-3B",
        "section": "B",
        "status": "ACTIVE",
    }
    create_resp = await staff_client.post("/api/v1/students", json=payload)
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    assert created_data["student_code"] == "STU-API-001"
    student_id = created_data["id"]

    # 2. Get Student by ID
    get_resp = await staff_client.get(f"/api/v1/students/{student_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["first_name"] == "Kavya"

    # 3. List Students
    list_resp = await staff_client.get("/api/v1/students?search=Kavya")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 1
    assert list_data["items"][0]["id"] == student_id

    # 4. Update Student
    update_payload = {"first_name": "Kavya Ananya", "status": "INACTIVE"}
    update_resp = await staff_client.put(f"/api/v1/students/{student_id}", json=update_payload)
    assert update_resp.status_code == 200
    assert update_resp.json()["first_name"] == "Kavya Ananya"
    assert update_resp.json()["status"] == "INACTIVE"

    # 5. Stats Endpoint
    stats_resp = await staff_client.get("/api/v1/students/stats")
    assert stats_resp.status_code == 200
    stats_data = stats_resp.json()
    assert stats_data["total_students"] >= 1
    assert stats_data["inactive_count"] >= 1

    # 6. Delete Student
    del_resp = await staff_client.delete(f"/api/v1/students/{student_id}")
    assert del_resp.status_code == 200

    # 7. Verify Not Found
    get_after_del = await staff_client.get(f"/api/v1/students/{student_id}")
    assert get_after_del.status_code == 404


@pytest.mark.asyncio
async def test_create_student_duplicate_conflict(staff_client):
    payload = {
        "student_code": "STU-DUP-CHECK",
        "roll_number": "ROLL-DUP-CHECK",
        "first_name": "Duplicate",
        "last_name": "Test",
        "email": "unique@campus.edu",
        "department": "IT",
        "class_name": "IT-1",
    }
    resp1 = await staff_client.post("/api/v1/students", json=payload)
    assert resp1.status_code == 201

    # Attempt same student_code
    payload2 = {
        "student_code": "STU-DUP-CHECK",
        "roll_number": "ROLL-DIFFERENT",
        "first_name": "Duplicate",
        "last_name": "Test",
        "email": "different@campus.edu",
        "department": "IT",
        "class_name": "IT-1",
    }
    resp2 = await staff_client.post("/api/v1/students", json=payload2)
    assert resp2.status_code == 409
    err_data = resp2.json()
    assert "detail" in err_data

