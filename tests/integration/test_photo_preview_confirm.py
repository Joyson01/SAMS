from datetime import date, time
import io
from PIL import Image
import pytest
from sqlalchemy import select, func
from backend.app.models.entities import (
    AttendanceSession,
    Student,
    FaceProfile,
    AttendanceRecord,
    AuditLog,
)

pytestmark = pytest.mark.asyncio


async def seed(db):
    session = AttendanceSession(
        session_code="PHOTO",
        class_name="A",
        subject="Math",
        room="1",
        status="ACTIVE",
        scheduled_date=date.today(),
        start_time=time(0),
        end_time=time(23, 59),
    )
    student = Student(
        student_code="P1",
        roll_number="P1",
        first_name="Photo",
        last_name="Student",
        email="photo@test.edu",
        department="CS",
        class_name="A",
    )
    db.add_all([session, student])
    await db.flush()
    db.add(FaceProfile(student_id=student.id, embedding_data=[1.0] + [0.0] * 511))
    await db.commit()
    return session, student


async def preview(client, session):
    data = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(data, format="PNG")
    return await client.post(
        "/api/v1/media-attendance/image/preview",
        data={"session_id": session.id},
        files=[("images", ("photo.png", data.getvalue(), "image/png"))],
    )


async def test_preview_confirm_idempotent(staff_client, test_db_session, monkeypatch):
    from backend.app.services import photo_attendance_service as svc

    session, student = await seed(test_db_session)
    monkeypatch.setattr(
        svc,
        "recognize_photo",
        lambda image, gallery: [
            {
                "bbox": [0, 0, 50, 50],
                "bucket": "VERIFIED",
                "student_id": student.id,
                "similarity": 0.9,
                "candidates": [{"student_id": student.id, "score": 0.9}],
                "quality_flags": [],
            }
        ],
    )
    response = await preview(staff_client, session)
    assert response.status_code == 200, response.text
    assert (
        await test_db_session.scalar(select(func.count()).select_from(AttendanceRecord))
        == 0
    )
    assert (
        await test_db_session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.action == "PHOTO_CONFIRM")
        )
        == 0
    )
    face = response.json()["images"][0]["faces"][0]
    payload = {
        "session_id": session.id,
        "selections": [{"student_id": student.id, "face_ref": face["face_ref"]}],
    }
    for _ in range(2):
        result = await staff_client.post(
            "/api/v1/media-attendance/image/confirm", json=payload
        )
        assert result.status_code == 200, result.text
    records = (await test_db_session.scalars(select(AttendanceRecord))).all()
    assert len(records) == 1
    assert records[0].source == "PHOTO"
    assert records[0].status in {"PRESENT", "LATE"}


@pytest.mark.parametrize("status", ["COMPLETED", "SCHEDULED", "PAUSED"])
async def test_inactive_photo_rejected(staff_client, test_db_session, status):
    session, _ = await seed(test_db_session)
    session.status = status
    await test_db_session.commit()
    response = await preview(staff_client, session)
    assert response.status_code == 400


@pytest.mark.parametrize(
    "bucket,status",
    [("UNKNOWN", None), ("VERIFIED", "MANUAL_PRESENT"), ("VERIFIED", "EXCUSED")],
)
async def test_unknown_and_protected(
    staff_client, test_db_session, monkeypatch, bucket, status
):
    from backend.app.services import photo_attendance_service as svc

    session, student = await seed(test_db_session)
    if status:
        test_db_session.add(
            AttendanceRecord(
                session_id=session.id,
                student_id=student.id,
                status=status,
                source="MANUAL",
            )
        )
        await test_db_session.commit()
    monkeypatch.setattr(
        svc,
        "recognize_photo",
        lambda image, gallery: [
            {
                "bbox": [0, 0, 50, 50],
                "bucket": bucket,
                "student_id": student.id,
                "similarity": 0.9,
                "candidates": [],
                "quality_flags": [],
            }
        ],
    )
    response = await preview(staff_client, session)
    face = response.json()["images"][0]["faces"][0]
    response = await staff_client.post(
        "/api/v1/media-attendance/image/confirm",
        json={
            "session_id": session.id,
            "selections": [{"student_id": student.id, "face_ref": face["face_ref"]}],
        },
    )
    if bucket == "UNKNOWN":
        assert response.status_code == 400
        assert (
            await test_db_session.scalar(
                select(func.count()).select_from(AttendanceRecord)
            )
            == 0
        )
    else:
        assert response.status_code == 200, response.text
        record = await test_db_session.scalar(select(AttendanceRecord))
        assert record.status == status


async def test_batch_roster_never_expands(test_db_session):
    from backend.app.models.entities import ClassSection, Batch, TimetableEntry
    from backend.app.services.photo_attendance_service import (
        eligible_photo_students,
        snapshot_photo_scope,
    )

    session, student = await seed(test_db_session)
    cls = ClassSection(name="A", department="CS")
    test_db_session.add(cls)
    await test_db_session.flush()
    batch = Batch(class_id=cls.id, name="B1")
    test_db_session.add(batch)
    await test_db_session.flush()
    slot = TimetableEntry(
        class_id=cls.id,
        batch_id=batch.id,
        label="Math lab",
        day_of_week="Monday",
        start_time="09:00",
        end_time="10:00",
    )
    test_db_session.add(slot)
    await test_db_session.flush()
    session.class_id = cls.id
    session.timetable_entry_id = slot.id
    await snapshot_photo_scope(test_db_session, session)
    assert await eligible_photo_students(test_db_session, session) == []
    student.batch_id = batch.id
    await test_db_session.flush()
    assert [s.id for s in await eligible_photo_students(test_db_session, session)] == [
        student.id
    ]
    session.timetable_entry_id = None
    assert [s.id for s in await eligible_photo_students(test_db_session, session)] == [
        student.id
    ]


@pytest.mark.parametrize(
    "mode", ["forged", "wrong_session", "closed", "out_of_class", "duplicate"]
)
async def test_invalid_confirm_is_atomic(
    staff_client, test_db_session, monkeypatch, mode
):
    from backend.app.services import photo_attendance_service as svc

    session, student = await seed(test_db_session)
    monkeypatch.setattr(
        svc,
        "recognize_photo",
        lambda image, gallery: [
            {
                "bbox": [0, 0, 50, 50],
                "bucket": "VERIFIED",
                "student_id": student.id,
                "similarity": 0.9,
                "candidates": [],
                "quality_flags": [],
            }
        ],
    )
    response = await preview(staff_client, session)
    token = response.json()["images"][0]["faces"][0]["face_ref"]
    target = session.id
    if mode == "forged":
        token = token[:-8] + "invalid!"
    if mode == "wrong_session":
        target = "different-session"
    if mode == "closed":
        session.status = "COMPLETED"
    if mode == "out_of_class":
        student.class_name = "Other"
    await test_db_session.commit()
    selections = [{"student_id": student.id, "face_ref": token}]
    if mode == "duplicate":
        selections *= 2
    response = await staff_client.post(
        "/api/v1/media-attendance/image/confirm",
        json={"session_id": target, "selections": selections},
    )
    assert response.status_code == 400, response.text
    assert (
        await test_db_session.scalar(select(func.count()).select_from(AttendanceRecord))
        == 0
    )


async def test_absence_recovers(staff_client, test_db_session, monkeypatch):
    from backend.app.services import photo_attendance_service as svc

    session, student = await seed(test_db_session)
    test_db_session.add(
        AttendanceRecord(
            session_id=session.id,
            student_id=student.id,
            status="ABSENT",
            source="AUTO_ROSTER",
        )
    )
    await test_db_session.commit()
    monkeypatch.setattr(
        svc,
        "recognize_photo",
        lambda image, gallery: [
            {
                "bbox": [0, 0, 50, 50],
                "bucket": "VERIFIED",
                "student_id": student.id,
                "similarity": 0.9,
                "candidates": [],
                "quality_flags": [],
            }
        ],
    )
    response = await preview(staff_client, session)
    face = response.json()["images"][0]["faces"][0]
    response = await staff_client.post(
        "/api/v1/media-attendance/image/confirm",
        json={
            "session_id": session.id,
            "selections": [{"student_id": student.id, "face_ref": face["face_ref"]}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["marked"] == 1
    record = await test_db_session.scalar(select(AttendanceRecord))
    assert record.status in {"PRESENT", "LATE"}
    assert record.source == "PHOTO"


async def test_upload_limits(staff_client, test_db_session):
    session, _ = await seed(test_db_session)
    response = await staff_client.post(
        "/api/v1/media-attendance/image/preview",
        data={"session_id": session.id},
        files=[("images", ("bad.jpg", b"not an image", "image/jpeg"))],
    )
    assert response.status_code == 415
    response = await staff_client.post(
        "/api/v1/media-attendance/image/preview",
        data={"session_id": session.id},
        files=[("images", ("bad.jpg", b"x", "image/jpeg"))] * 4,
    )
    assert response.status_code == 400


async def test_student_edit_rejects_invalid_batch(test_db_session):
    from fastapi import HTTPException
    from backend.app.services.student_service import StudentService
    from backend.app.schemas.student import StudentUpdate

    _, student = await seed(test_db_session)
    with pytest.raises(HTTPException):
        await StudentService.update_student(
            test_db_session, student.id, StudentUpdate(batch_id="missing")
        )


async def test_foreign_timetable_rejected(test_db_session):
    from fastapi import HTTPException
    from backend.app.models.entities import ClassSection, TimetableEntry
    from backend.app.services.photo_attendance_service import snapshot_photo_scope

    session, _ = await seed(test_db_session)
    other = ClassSection(name="Other", department="CS")
    test_db_session.add(other)
    await test_db_session.flush()
    slot = TimetableEntry(
        class_id=other.id,
        label="Math",
        day_of_week="Monday",
        start_time="09:00",
        end_time="10:00",
    )
    test_db_session.add(slot)
    await test_db_session.flush()
    session.timetable_entry_id = slot.id
    with pytest.raises(HTTPException):
        await snapshot_photo_scope(test_db_session, session)


async def test_batch_close_preserves_outsider_pending(test_db_session):
    from backend.app.models.entities import ClassSection, Batch
    from backend.app.services.attendance_service import AttendanceService

    session, student = await seed(test_db_session)
    cls = ClassSection(name="A", department="CS")
    test_db_session.add(cls)
    await test_db_session.flush()
    batch = Batch(class_id=cls.id, name="B1")
    test_db_session.add(batch)
    await test_db_session.flush()
    session.class_id = cls.id
    session.photo_batch_id = batch.id
    session.photo_scope_initialized = True
    record = AttendanceRecord(
        session_id=session.id,
        student_id=student.id,
        status="REVIEW_REQUIRED",
        source="PHONE_CAPTURE",
    )
    test_db_session.add(record)
    await test_db_session.commit()
    result = await AttendanceService.get_session_by_id(test_db_session, session.id)
    assert result.total_records == 0
    await AttendanceService.close_session(test_db_session, session.id)
    await test_db_session.refresh(record)
    assert record.status == "REVIEW_REQUIRED"


async def test_concurrent_confirm_has_one_record(tmp_path):
    import asyncio
    from datetime import timedelta
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from backend.app.database.base import Base
    from backend.app.models.entities import User
    from backend.app.services.attendance_service import AttendanceService
    from backend.app.api.v1.photo_attendance import PhotoSelection
    from backend.app.core.security import _create_token

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/race.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        session, student = await seed(db)
        user = User(
            username="race",
            email="race@test.edu",
            full_name="Race",
            role="ADMIN",
            password_hash="unused",
        )
        db.add(user)
        await db.commit()
        token = _create_token(
            {
                "sub": user.id,
                "session_id": session.id,
                "image": "digest",
                "face": 0,
                "bucket": "VERIFIED",
                "student_id": student.id,
                "similarity": 0.9,
            },
            timedelta(minutes=15),
            "photo_evidence",
        )
        session_id, student_id, actor_id = session.id, student.id, user.id

    async def confirm_one():
        async with factory() as db:
            return await AttendanceService.confirm_photo_attendance(
                db,
                session_id,
                [PhotoSelection(student_id=student_id, face_ref=token)],
                actor_id,
            )

    results = await asyncio.gather(confirm_one(), confirm_one())
    assert sum(result["marked"] for result in results) == 1
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(AttendanceRecord)) == 1
        assert (
            await db.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.action == "PHOTO_CONFIRM")
            )
            == 2
        )
    await engine.dispose()
