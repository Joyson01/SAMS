import pytest


@pytest.mark.asyncio
async def test_subject_and_class_api_unauthorized(client):
    """Verifies that unauthenticated access to subjects and classes is rejected."""
    resp_subj = await client.get("/api/v1/subjects")
    assert resp_subj.status_code == 401
    resp_class = await client.get("/api/v1/classes")
    assert resp_class.status_code == 401


@pytest.mark.asyncio
async def test_subject_and_class_api_workflow(staff_client):
    # 1. Register Subject
    subj_payload = {
        "code": "CS401",
        "name": "Computer Networks",
        "short_name": "CN",
        "department": "Computer Science",
        "credits": 4,
        "semester": 4,
        "academic_year": "2026-2027",
        "status": "ACTIVE",
    }
    subj_res = await staff_client.post("/api/v1/subjects", json=subj_payload)
    assert subj_res.status_code == 201
    subj_data = subj_res.json()
    assert subj_data["code"] == "CS401"
    subj_id = subj_data["id"]

    # 2. Register Class Section
    cls_payload = {
        "name": "CSE-4A",
        "department": "Computer Science",
        "year": 4,
        "semester": 4,
        "section": "A",
        "academic_year": "2026-2027",
        "status": "ACTIVE",
    }
    cls_res = await staff_client.post("/api/v1/classes", json=cls_payload)
    assert cls_res.status_code == 201
    cls_data = cls_res.json()
    assert cls_data["name"] == "CSE-4A"
    cls_id = cls_data["id"]

    # 3. Create Session with real Subject and Class IDs
    sess_payload = {
        "subject_id": subj_id,
        "class_id": cls_id,
        "class_name": "CSE-4A",
        "subject": "Computer Networks",
        "room": "Room 204",
        "start_time": "09:00",
        "end_time": "10:00",
        "late_threshold_minutes": 10,
    }
    sess_res = await staff_client.post("/api/v1/attendance/sessions", json=sess_payload)
    assert sess_res.status_code == 201
    sess_data = sess_res.json()
    assert sess_data["subject_id"] == subj_id
    assert sess_data["class_name"] == "CSE-4A"
    assert sess_data["late_threshold_minutes"] == 10
    session_id = sess_data["id"]

    # 4. Deleting subject with active sessions soft-deactivates instead of deleting
    del_subj = await staff_client.delete(f"/api/v1/subjects/{subj_id}")
    assert del_subj.status_code == 204

    # Fetch subject again -> status must be INACTIVE
    get_subj = await staff_client.get(f"/api/v1/subjects/{subj_id}")
    assert get_subj.status_code == 200
    assert get_subj.json()["status"] == "INACTIVE"

