from datetime import time
from types import MethodType, SimpleNamespace

import numpy as np
import pytest
from sqlalchemy import select

from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
from backend.app.models.entities import (
    AttendanceRecord, AttendanceSession, AuditLog, FaceProfile, Student, UserStudentLink,
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

    attendance = await client.get(f"{auth}/my-attendance", headers=student_headers)
    assert attendance.status_code == 200
    assert attendance.json()["profile"]["display_name"] == "Portal own"
    [period] = attendance.json()["items"]
    assert period["id"] == own_record.id
    assert (period["start_time"], period["end_time"]) == ("09:00:00", "10:00:00")

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

    own_record.status = "ABSENT"
    await test_db_session.commit()
    leave = await client.post(f"{portal}/corrections", headers=student_headers, json={
        "record_id": own_record.id, "kind": "ON_DUTY", "requested_status": "EXCUSED",
        "reason": "Represented the college at an event.",
    })
    assert leave.status_code == 201, leave.text
    assert leave.json()["kind"] == "ON_DUTY"
    reviewed = await client.post(f"{portal}/review/{leave.json()['id']}", json=decision)
    assert reviewed.status_code == 200, reviewed.text
    assert own_record.status == "EXCUSED"

    candidate = np.ones(512, dtype=np.float32) / np.sqrt(512)

    def validated_image(data, pose, embed=False, **kwargs):
        result = {"valid": True, "hint": "Hold still", "blur": 120, "bbox": [10, 20, 50, 60], "frame_width": 100, "frame_height": 100}
        return result, candidate if embed else None

    async def sync_gallery(db):
        return 1

    boxes = [[10, 20, 40, 60], [50, 20, 80, 60], [75, 70, 95, 95]]
    faces = [SimpleNamespace(bbox=SimpleNamespace(to_list=lambda box=box: box), landmarks=index) for index, box in enumerate(boxes)]
    pipeline = SimpleNamespace(
        detector=SimpleNamespace(detect=lambda image: faces),
        quality_analyzer=SimpleNamespace(analyze=lambda image, box: SimpleNamespace(is_valid=box.to_list()[0] < 75, rejection_reason=None)),
        matcher=SimpleNamespace(known_threshold=0.58, uncertain_threshold=0.4, margin_threshold=0.05),
        pose_estimator=SimpleNamespace(estimate=lambda landmarks: None),
        liveness_detector=SimpleNamespace(predict=lambda *args: SimpleNamespace(is_live=False, liveness_score=0)),
        aligner=SimpleNamespace(align=lambda image, index: index),
        embedder=SimpleNamespace(extract_from_crop=lambda index: candidate if index == 0 else np.zeros(512)),
    )
    pipeline.embedder.extract_batch = lambda crops: [pipeline.embedder.extract_from_crop(crop) for crop in crops]
    pipeline.process_frame = MethodType(FaceRecognitionPipeline.process_frame, pipeline)
    monkeypatch.setattr(enrollment_service, "decode_face_image", lambda data: (np.empty((100, 100, 3)), pipeline))
    monkeypatch.setattr(enrollment_service, "check_image", validated_image)
    monkeypatch.setattr(enrollment_service.RecognitionService, "sync_gallery_from_db", sync_gallery)
    photo = b"\xff\xd8\xfftest\xff\xd9"
    files = {"file": ("face.jpg", photo, "image/jpeg")}

    async def submit_face(pose="FRONT"):
        return await client.post(f"{portal}/face", headers=student_headers,
                                 data={"pose": pose}, files=files)

    async def match_face():
        return await client.post(f"{portal}/face/match", headers=student_headers, files=files)

    assert (await client.post(f"{portal}/face/match", files=files)).status_code == 403
    empty = await match_face()
    assert empty.status_code == 200
    assert empty.json()["gallery_size"] == 0
    assert empty.json()["faces"][0]["status"] == "UNKNOWN"
    update_url = f"{portal}/face/update-request"
    update_payload = {"reason": "The camera struggles to recognize me."}
    assert (await client.post(update_url, headers=student_headers, json=update_payload)).status_code == 409
    registered = await submit_face()
    assert registered.status_code == 201, registered.text
    assert registered.json()["completed_poses"] == ["FRONT"]
    assert (await test_db_session.scalar(select(FaceProfile.student_id))) == own.id
    match_result = (await match_face()).json()
    assert match_result.pop("latency_ms") >= 0
    assert match_result.pop("gallery_size") == 1
    assert match_result.pop("verified_threshold") == 0.58
    assert match_result == {
        "faces": [
            {"bbox": boxes[0], "status": "VERIFIED", "name": "Portal own", "similarity": 1.0},
            {"bbox": boxes[1], "status": "UNKNOWN"},
            {"bbox": boxes[2], "status": "LOW_QUALITY"},
        ],
        "width": 100, "height": 100,
    }
    for _ in range(2):
        live = await client.post(f"{portal}/face/match?live=true", headers=student_headers, files=files)
        assert live.status_code == 200, live.text
        assert [face["status"] for face in live.json()["faces"]] == ["VERIFIED", "UNKNOWN", "LOW_QUALITY"]
        await test_db_session.flush()
    live_events = (await test_db_session.scalars(select(AuditLog.id).where(
        AuditLog.user_id == user_id, AuditLog.action == "STUDENT_CHECK_FACE_LIVE"
    ))).all()
    assert len(live_events) == 1
    refreshed = await client.get(f"{portal}/requests", headers=student_headers)
    assert refreshed.json()["existing_poses"] == ["FRONT"]
    candidate = -candidate
    other_profile = FaceProfile(student_id=other.id, pose_type="FRONT", embedding_data=candidate.tolist())
    other.section = "B"
    test_db_session.add(other_profile)
    await test_db_session.commit()
    redirected = await client.post(f"{portal}/face/match", headers=student_headers,
                                   data={"student_id": other.id}, files=files)
    assert redirected.json()["faces"][0] == {"bbox": boxes[0], "status": "UNKNOWN"}
    def analyze_group_photo(image, gallery):
        assert set(gallery) == {own.id}
        return [
            {"bbox": boxes[0], "bucket": "VERIFIED", "student_id": own.id, "similarity": 0.812},
            {"bbox": boxes[1], "bucket": "NEEDS_REVIEW", "student_id": own.id, "similarity": 0.514},
        ]

    monkeypatch.setattr(enrollment_service, "decode_photo", lambda data: np.empty((200, 300, 3)))
    monkeypatch.setattr(enrollment_service, "recognize_photo", analyze_group_photo)
    group = await client.post(f"{portal}/face/match?photo=true", headers=student_headers, files=files)
    assert group.status_code == 200, group.text
    group_result = group.json()
    assert group_result.pop("latency_ms") >= 0
    assert group_result.pop("gallery_size") == 1
    assert group_result.pop("verified_threshold") > 0
    assert group_result == {
        "faces": [
            {"bbox": boxes[0], "status": "VERIFIED", "name": "Portal own", "similarity": 0.812},
            {"bbox": boxes[1], "status": "NEEDS_REVIEW", "name": "Portal own", "similarity": 0.514},
        ],
        "width": 300, "height": 200,
    }
    other.section = own.section
    await test_db_session.commit()
    recognized = (await match_face()).json()["faces"][0]
    assert recognized == {"bbox": boxes[0], "status": "VERIFIED", "name": "Portal other", "similarity": 1.0}
    pipeline.embedder.extract_from_crop = lambda index: candidate * (2 if index == 0 else 1)
    duplicate_faces = (await match_face()).json()["faces"]
    assert [face["status"] for face in duplicate_faces] == ["VERIFIED", "NEEDS_REVIEW", "LOW_QUALITY"]
    assert duplicate_faces[1]["name"] == "Portal other"
    assert duplicate_faces[1]["similarity"] == 1.0
    pipeline.embedder.extract_from_crop = lambda index: candidate if index == 0 else np.zeros(512)
    await test_db_session.delete(other_profile)
    await test_db_session.commit()
    assert (await match_face()).json()["faces"][0]["status"] == "UNKNOWN"
    assert (await submit_face()).status_code == 422
    candidate = -candidate
    assert (await submit_face()).status_code == 403
    pending = await client.post(update_url, headers=student_headers, json=update_payload)
    assert pending.status_code == 201, pending.text
    await test_db_session.commit()
    assert (await client.post(update_url, headers=student_headers, json=update_payload)).status_code == 409
    assert (await submit_face()).status_code == 403
    review_url = f"{portal}/review/{pending.json()['id']}"
    queue = await client.get(f"{portal}/review")
    assert pending.json()["id"] in {item["id"] for item in queue.json()}
    assert (await client.post(review_url, headers=student_headers, json=decision)).status_code == 403
    approved = await client.post(review_url, json=decision)
    assert approved.status_code == 200, approved.text
    state = await client.get(f"{portal}/requests", headers=student_headers)
    assert state.json()["can_update_face"]
    assert state.json()["face_update_request"]["status"] == "APPROVED"
    updated = await submit_face()
    assert updated.status_code == 201, updated.text

    removal = f"/api/v1/students/{own.id}/enroll"
    assert (await client.delete(removal, headers=student_headers)).status_code == 403
    removed = await client.delete(removal)
    assert removed.status_code == 200, removed.text
    assert removed.json()["completed_poses"] == []
    assert own.enrollment_status == "NOT_ENROLLED"
    assert await test_db_session.scalar(select(FaceProfile.id)) is None
    await test_db_session.refresh(own_record)
    assert own_record.status == "EXCUSED"
