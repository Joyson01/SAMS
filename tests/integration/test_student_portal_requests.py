from datetime import time

import numpy as np
import pytest
from sqlalchemy import select

from backend.app.api.v1 import student_portal
from backend.app.models.entities import (
    AttendanceRecord, AttendanceSession, FaceProfile, Student, UserStudentLink,
)
from backend.app.services import enrollment_service


@pytest.mark.asyncio
async def test_student_requests_require_admin_and_keep_data_linked(staff_client, test_db_session, monkeypatch):
    client = staff_client
    auth = "/api/v1/auth"
    portal = "/api/v1/student-portal"
    password = "StudentPassword123"
    response = await client.post(f"{auth}/register", json={
        "username": "portal_student", "email": "portal-student@example.com",
        "full_name": "Portal Student", "password": password,
    })
    assert response.status_code == 201, response.text
    user_id = response.json()["id"]
    login = await client.post(f"{auth}/login", json={"username_or_email": "portal_student", "password": password})
    student_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    def student(code):
        return Student(student_code=code, roll_number=code, first_name="Portal", last_name=code,
                       email=f"{code}@example.com", department="COMP", class_name="TE-B")

    own, other = student("own"), student("other")
    session = AttendanceSession(session_code="CORRECTION", class_name="TE-B", subject="Math", room="A",
                                start_time=time(9), end_time=time(10), status="COMPLETED")
    test_db_session.add_all([own, other, session])
    await test_db_session.flush()
    own_record = AttendanceRecord(student_id=own.id, session_id=session.id, status="ABSENT")
    other_record = AttendanceRecord(student_id=other.id, session_id=session.id, status="ABSENT")
    test_db_session.add_all([UserStudentLink(user_id=user_id, student_id=own.id), own_record, other_record])
    await test_db_session.commit()

    correction = {"requested_status": "PRESENT", "reason": "I was there."}
    for record, status in ((other_record, 404), (own_record, 201)):
        response = await client.post(f"{portal}/corrections", headers=student_headers,
                                     json={**correction, "record_id": record.id})
        assert response.status_code == status, response.text
    correction_id = response.json()["id"]
    assert own_record.status == "ABSENT"
    assert (await client.get(f"{portal}/review", headers=student_headers)).status_code == 403
    decision = {"decision": "APPROVED", "note": "Verified with faculty."}
    assert (await client.post(f"{portal}/review/{correction_id}", headers=student_headers, json=decision)).status_code == 403
    approved = await client.post(f"{portal}/review/{correction_id}", json=decision)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    assert own_record.status == "PRESENT"
    assert (await client.post(f"{portal}/review/{correction_id}", json=decision)).status_code == 409

    candidate = np.ones(512, dtype=np.float32) / np.sqrt(512)

    def validated_image(data, pose, embed=False, **kwargs):
        result = {"valid": True, "hint": "Hold still", "blur": 120}
        return result, candidate if embed else None

    async def sync_gallery(db):
        return 1

    monkeypatch.setattr(student_portal, "check_image", validated_image)
    monkeypatch.setattr(enrollment_service, "check_image", validated_image)
    monkeypatch.setattr(enrollment_service.RecognitionService, "sync_gallery_from_db", sync_gallery)
    photo = b"\xff\xd8\xfftest\xff\xd9"
    files = {"file": ("face.jpg", photo, "image/jpeg")}

    async def submit_face(pose="FRONT"):
        return await client.post(f"{portal}/face", headers=student_headers,
                                 data={"pose": pose}, files=files)

    async def match_face():
        return await client.post(f"{portal}/face/match", headers=student_headers, files=files)

    assert (await match_face()).status_code == 409
    registered = await submit_face()
    assert registered.status_code == 201, registered.text
    assert registered.json()["completed_poses"] == ["FRONT"]
    assert (await test_db_session.scalar(select(FaceProfile.student_id))) == own.id
    assert (await match_face()).json() == {"matched": True}
    refreshed = await client.get(f"{portal}/requests", headers=student_headers)
    assert refreshed.json()["existing_poses"] == ["FRONT"]
    candidate = -candidate
    assert (await match_face()).json() == {"matched": False}
    assert (await submit_face()).status_code == 422
    candidate = -candidate
    updated = await submit_face()
    assert updated.status_code == 201, updated.text

    removal = f"/api/v1/students/{own.id}/enroll"
    assert (await client.delete(removal, headers=student_headers)).status_code == 403
    removed = await client.delete(removal)
    assert removed.status_code == 200, removed.text
    assert removed.json()["completed_poses"] == []
    assert own.enrollment_status == "NOT_ENROLLED"
    assert await test_db_session.scalar(select(FaceProfile.id)) is None
    assert own_record.status == "PRESENT"
