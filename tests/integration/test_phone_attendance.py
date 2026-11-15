import asyncio
import io
from datetime import date, time, timedelta
from threading import Event
from types import SimpleNamespace

import pytest
import numpy as np
from PIL import Image

from backend.app.api.v1 import phone_attendance
from backend.app.core.security import _create_token, get_current_user
from backend.app.main import app
from backend.app.models.entities import AttendanceRecord, AttendanceSession, Student
from backend.app.services import face_recognition_service


@pytest.mark.asyncio
async def test_phone_capture_is_scoped_and_preserves_manual_marks(client, test_db_session, monkeypatch):
    def session(code, class_name):
        return AttendanceSession(
            session_code=code, class_name=class_name, subject="Computing", room="Lab",
            scheduled_date=date.today(), start_time=time(9), end_time=time(10), status="ACTIVE",
        )

    first, second = session("PILOT-A", "A"), session("PILOT-B", "B")
    students = [
        Student(first_name=name, last_name="Test", student_code=name, roll_number=name,
                department="CE", class_name=class_name, section="A", email=f"{name}@example.test")
        for name, class_name in [("Present", "A"), ("Corrected", "A"), ("Outside", "B")]
    ]
    test_db_session.add_all([first, second, *students])
    await test_db_session.commit()
    test_db_session.add(AttendanceRecord(
        session_id=first.id, student_id=students[1].id, status="MANUAL_ABSENT", source="MANUAL",
    ))
    await test_db_session.commit()

    first_id, second_id = first.id, second.id
    student_ids = [student.id for student in students]
    photo = io.BytesIO()
    pixels = (np.indices((96, 96)).sum(axis=0) % 2 * 255).astype("uint8")
    Image.fromarray(np.repeat(pixels[:, :, None], 3, axis=2)).save(photo, format="JPEG")
    monkeypatch.setattr(face_recognition_service, "recognize_frame", lambda **kwargs: [
        {"student_id": student_id, "similarity": .91, "second_similarity": .20,
         "is_recognized": True, "is_quality_valid": True}
        for student_id in student_ids
    ])
    path = f"/api/v1/phone-attendance/{first_id}"
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="FACULTY")
    pair = await client.post(f"{path}/pair")
    assert pair.status_code == 200
    app.dependency_overrides.pop(get_current_user)
    headers = {"X-Attendance-Pairing": pair.json()["token"]}

    async def capture(url=path, auth=None):
        return await client.post(f"{url}/capture", headers=auth, content=photo.getvalue())

    assert (await capture()).status_code == 401
    expired = _create_token({"session_id": first_id}, timedelta(seconds=-1), phone_attendance.PAIRING_TYPE)
    assert (await capture(auth={"X-Attendance-Pairing": expired})).status_code == 401
    assert (await capture(f"/api/v1/phone-attendance/{second_id}", headers)).status_code == 403
    invalid = await client.post(
        f"{path}/capture", headers=headers, content=b"invalid",
    )
    assert invalid.status_code == 400
    result = (await capture(auth=headers)).json()
    assert result["marked"] == 1
    assert result["pending"] == 0
    assert result["review"] == 0
    assert result["quality"] == "USABLE"
    assert (await capture(auth=headers)).json()["marked"] == 0

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="FACULTY")
    closed = await client.put(f"/api/v1/attendance/sessions/{first_id}/close")
    assert closed.status_code == 200
    app.dependency_overrides.pop(get_current_user)
    assert (await capture(auth=headers)).status_code == 409


@pytest.mark.asyncio
async def test_finalizing_during_recognition_rejects_late_capture(client, test_db_session, monkeypatch):
    session = AttendanceSession(
        session_code="PILOT-RACE", class_name="A", subject="Computing", room="Lab",
        scheduled_date=date.today(), start_time=time(9), end_time=time(10), status="ACTIVE",
    )
    test_db_session.add(session)
    await test_db_session.commit()
    session_id = session.id
    started, release = Event(), Event()

    def recognize(*args):
        started.set()
        assert release.wait(5)
        return []

    monkeypatch.setattr(phone_attendance, "recognize_image", recognize)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="FACULTY")
    path = f"/api/v1/phone-attendance/{session_id}"
    pair = await client.post(f"{path}/pair")
    upload = asyncio.create_task(client.post(
        f"{path}/capture", headers={"X-Attendance-Pairing": pair.json()["token"]},
        content=b"image",
    ))
    try:
        assert await asyncio.to_thread(started.wait, 5)
        closed = await client.put(f"/api/v1/attendance/sessions/{session_id}/close")
        assert closed.status_code == 200
    finally:
        release.set()
    assert (await upload).status_code == 409


@pytest.mark.asyncio
async def test_live_capture_waits_for_repeated_evidence(client, test_db_session, monkeypatch):
    session = AttendanceSession(
        session_code="PILOT-LIVE", class_name="LIVE-A", subject="Computing", room="Lab",
        scheduled_date=date.today(), start_time=time(9), end_time=time(10), status="ACTIVE",
    )
    student = Student(
        first_name="Live", last_name="Student", student_code="LIVE-1", roll_number="LIVE-1",
        department="CE", class_name="LIVE-A", section="A", email="live@example.test",
    )
    test_db_session.add_all([session, student])
    await test_db_session.commit()
    session_id, student_id = session.id, student.id
    monkeypatch.setattr(face_recognition_service, "recognize_frame", lambda **kwargs: [{
        "student_id": student_id, "similarity": .91, "second_similarity": .20,
        "is_recognized": True, "is_quality_valid": True,
    }])
    pixels = (np.indices((96, 96)).sum(axis=0) % 2 * 255).astype("uint8")
    photo = io.BytesIO()
    Image.fromarray(np.repeat(pixels[:, :, None], 3, axis=2)).save(photo, format="JPEG")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="FACULTY")
    path = f"/api/v1/phone-attendance/{session_id}"
    pair = await client.post(f"{path}/pair")
    app.dependency_overrides.pop(get_current_user)
    headers = {
        "X-Attendance-Pairing": pair.json()["token"], "X-Capture-Mode": "live",
        "X-Scanner-ID": "scanner-live-test",
    }

    first = await client.post(f"{path}/capture", headers=headers, content=photo.getvalue())
    second = await client.post(f"{path}/capture", headers=headers, content=photo.getvalue())

    assert first.json()["pending"] == 1
    assert first.json()["marked"] == 0
    assert second.json()["pending"] == 0
    assert second.json()["marked"] == 1
