import pytest
import os
from datetime import date, datetime, time, timezone


@pytest.mark.asyncio
async def test_attendance_auto_recovery_and_roster_workflow(client):
    suffix = os.urandom(3).hex()
    class_name = f"TEST-CLASS-{suffix}"

    # 1. Create a Student in target class
    stu_resp = await client.post(
        "/api/v1/students",
        json={
            "first_name": "Arjun",
            "last_name": "Mehta",
            "student_code": f"STU-{suffix}",
            "roll_number": f"ROLL-{suffix}",
            "department": "Computer Science",
            "class_name": class_name,
            "section": "A",
            "email": f"arjun.{suffix}@campus.edu",
        },
    )
    assert stu_resp.status_code == 201
    student_id = stu_resp.json()["id"]

    # 2. Create Attendance Session
    sess_payload = {
        "session_code": f"SESS-{suffix}",
        "class_name": class_name,
        "subject": "Distributed Systems",
        "room": "Room-401",
        "scheduled_date": str(date.today()),
        "start_time": datetime.now().strftime("%H:%M:%S"),
        "end_time": "23:59:00",
        "late_threshold_minutes": 15,
    }
    create_sess_resp = await client.post("/api/v1/attendance/sessions", json=sess_payload)
    assert create_sess_resp.status_code == 201
    session_id = create_sess_resp.json()["id"]

    # 3. Start Session
    start_resp = await client.put(f"/api/v1/attendance/sessions/{session_id}/start")
    assert start_resp.status_code == 200

    # 4. Check Initial Live Class Roster
    roster_resp = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster")
    assert roster_resp.status_code == 200
    roster_data = roster_resp.json()
    assert roster_data["total_enrolled"] == 1
    assert roster_data["present_count"] == 0
    assert roster_data["absent_count"] == 1
    assert roster_data["roster"][0]["student_id"] == student_id
    assert roster_data["roster"][0]["attendance_status"] == "NOT_RECORDED"

    # 5. Mark Student Manually ABSENT
    manual_resp = await client.post(
        f"/api/v1/attendance/manual?session_id={session_id}&student_id={student_id}&status=ABSENT&remarks=Did not attend roll call"
    )
    assert manual_resp.status_code == 200
    assert manual_resp.json()["status"] == "ABSENT"
    original_record_id = manual_resp.json()["id"]

    # Verify roster reflects ABSENT
    roster_resp = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster")
    assert roster_resp.status_code == 200
    assert roster_resp.json()["roster"][0]["attendance_status"] == "ABSENT"

    # 6. Student is subsequently scanned & recognized by camera (AI Attendance)
    mark_payload = {
        "student_id": student_id,
        "confidence": 0.94,
        "track_id": 101,
        "liveness_score": 0.98,
        "source": "AI",
        "remarks": "Recognized in camera frame",
    }
    scan_resp = await client.post(f"/api/v1/attendance/sessions/{session_id}/mark", json=mark_payload)
    assert scan_resp.status_code == 200
    scanned_record = scan_resp.json()

    # CRITICAL: Verify state machine AUTO-RECOVERY from ABSENT -> PRESENT on exact same record ID
    assert scanned_record["status"] == "PRESENT", f"Expected PRESENT, got {scanned_record['status']}"
    assert scanned_record["id"] == original_record_id, "Record ID must be preserved during status recovery"
    assert scanned_record["confidence"] == 0.94

    # 7. Verify Live Roster is updated to PRESENT
    roster_resp = await client.get(f"/api/v1/attendance/sessions/{session_id}/roster")
    assert roster_resp.status_code == 200
    updated_roster = roster_resp.json()
    assert updated_roster["present_count"] == 1
    assert updated_roster["absent_count"] == 0
    assert updated_roster["attendance_rate_pct"] == 100.0
    assert updated_roster["roster"][0]["attendance_status"] == "PRESENT"

    # 8. Repeated scans do not create duplicates (idempotency)
    scan_resp2 = await client.post(f"/api/v1/attendance/sessions/{session_id}/mark", json=mark_payload)
    assert scan_resp2.status_code == 200
    assert scan_resp2.json()["id"] == original_record_id
    records_resp = await client.get(f"/api/v1/attendance/sessions/{session_id}/records")
    assert len(records_resp.json()) == 1, "Duplicate records must not be created"

    # 9. Close session
    close_resp = await client.put(f"/api/v1/attendance/sessions/{session_id}/close")
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "COMPLETED"

    # 10. Completed session rejects further photo/recognition processing
    locked_resp = await client.post(
        "/api/v1/attendance/recognize-frame",
        data={"session_id": session_id, "threshold": "0.50"},
    )
    assert locked_resp.status_code == 400
    assert "locked" in locked_resp.json()["detail"].lower()
