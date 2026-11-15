import pytest
from datetime import date


@pytest.mark.asyncio
async def test_attendance_api_rest_workflow(staff_client):
    # 1. Create a Student
    stu_resp = await staff_client.post(
        "/api/v1/students",
        json={
            "first_name": "Kavya",
            "last_name": "Nair",
            "student_code": "STU-KAVYA",
            "roll_number": "ECE-101",
            "department": "ECE",
            "class_name": "ECE-3A",
            "section": "A",
            "email": "kavya@campus.edu",
        },
    )
    assert stu_resp.status_code == 201
    student_id = stu_resp.json()["id"]

    # 2. Create Attendance Session with future start time for today
    sess_payload = {
        "session_code": "SESS-ECE-3A-01",
        "class_name": "ECE-3A",
        "subject": "Digital Signal Processing",
        "room": "DSP-Lab",
        "scheduled_date": str(date.today()),
        "start_time": "23:00:00",
        "end_time": "23:59:00",
    }
    create_sess_resp = await staff_client.post("/api/v1/attendance/sessions", json=sess_payload)
    assert create_sess_resp.status_code == 201
    session_id = create_sess_resp.json()["id"]

    # 3. List Sessions
    list_resp = await staff_client.get("/api/v1/attendance/sessions?class_name=ECE-3A")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # 4. Start Session
    start_resp = await staff_client.put(f"/api/v1/attendance/sessions/{session_id}/start")
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "ACTIVE"

    # 5. Mark Attendance
    mark_payload = {
        "student_id": student_id,
        "confidence": 0.89,
        "track_id": 42,
        "liveness_score": 0.96,
        "remarks": "Verified via Camera-1",
    }
    mark_resp = await staff_client.post(f"/api/v1/attendance/sessions/{session_id}/mark", json=mark_payload)
    assert mark_resp.status_code == 200
    record_id = mark_resp.json()["id"]
    assert mark_resp.json()["status"] == "PRESENT"
    assert mark_resp.json()["confidence"] == 0.89

    # 6. Query Session Records
    records_resp = await staff_client.get(f"/api/v1/attendance/sessions/{session_id}/records")
    assert records_resp.status_code == 200
    assert len(records_resp.json()) == 1

    # 7. Manual Override
    override_payload = {
        "status": "MANUAL_PRESENT",
        "remarks": "Corrected by Teacher in charge",
    }
    override_resp = await staff_client.put(f"/api/v1/attendance/records/{record_id}/override", json=override_payload)
    assert override_resp.status_code == 200
    assert override_resp.json()["status"] == "MANUAL_PRESENT"

    # 8. Close Session
    close_resp = await staff_client.put(f"/api/v1/attendance/sessions/{session_id}/close?auto_mark_absent=false")
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "COMPLETED"

    # 9. Get Student Attendance History
    history_resp = await staff_client.get(f"/api/v1/attendance/students/{student_id}")
    assert history_resp.status_code == 200
    assert history_resp.json()["total_sessions"] == 1
    assert history_resp.json()["present_sessions"] == 1

