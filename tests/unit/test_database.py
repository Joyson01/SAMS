import pytest
from datetime import date, time
from sqlalchemy import select
from backend.app.models.entities import (
    User,
    Student,
    FaceProfile,
    AttendanceSession,
    AttendanceRecord,
    Camera,
    AuditLog,
)


@pytest.mark.asyncio
async def test_create_and_query_entities(test_db_session):
    # 1. Create a user
    user = User(
        username="testadmin",
        email="admin@test.com",
        password_hash="hashed_pw",
        full_name="Test Admin",
        role="ADMIN",
    )
    test_db_session.add(user)
    await test_db_session.commit()

    # Query user
    result = await test_db_session.execute(select(User).where(User.username == "testadmin"))
    fetched_user = result.scalar_one()
    assert fetched_user.email == "admin@test.com"
    assert fetched_user.role == "ADMIN"

    # 2. Create a student with a face profile
    student = Student(
        student_code="STU-001",
        roll_number="CSE-01",
        first_name="Test",
        last_name="Student",
        email="student@test.com",
        department="Computer Science",
        class_name="CSE-1A",
        section="A",
    )
    test_db_session.add(student)
    await test_db_session.commit()

    face_profile = FaceProfile(
        student_id=student.id,
        embedding_data=[0.1] * 512,
        model_name="ArcFace-ResNet50",
        quality_score=0.95,
        pose_type="FRONT",
    )
    test_db_session.add(face_profile)
    await test_db_session.commit()

    # 3. Create a session and record
    session = AttendanceSession(
        session_code="SESS-001",
        class_name="CSE-1A",
        subject="AI",
        room="101",
        scheduled_date=date.today(),
        start_time=time(9, 0),
        end_time=time(10, 0),
        status="ACTIVE",
    )
    test_db_session.add(session)
    await test_db_session.commit()

    record = AttendanceRecord(
        session_id=session.id,
        student_id=student.id,
        status="PRESENT",
        confidence=0.92,
    )
    test_db_session.add(record)
    await test_db_session.commit()

    # Verify query
    rec_result = await test_db_session.execute(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    )
    fetched_rec = rec_result.scalar_one()
    assert fetched_rec.status == "PRESENT"
    assert fetched_rec.confidence == 0.92

