import pytest
import numpy as np
import cv2
from datetime import date, time
from sqlalchemy import select

from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    ClassSection,
    MediaProcessingJob,
    Student,
    Subject,
)
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.class_service import ClassService
from backend.app.services.media_attendance_service import MediaAttendanceService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


def _create_synthetic_jpeg():
    img = np.full((200, 200, 3), 128, dtype=np.uint8)
    cv2.circle(img, (100, 100), 50, (200, 200, 200), -1)
    ret, buf = cv2.imencode('.jpg', img)
    return buf.tobytes()


@pytest.mark.asyncio
async def test_image_media_attendance_workflow(test_db_session):
    # 1. Setup Subject, Class, Session, and Student
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS601",
            name="Deep Learning",
            department="Computer Science",
            credits=4,
            semester=6,
        ),
    )
    cls_sec = await ClassService.create_class(
        test_db_session,
        ClassSectionCreate(
            name="CSE-6A",
            department="Computer Science",
            year=4,
            semester=6,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="CSE-6A",
            subject="Deep Learning",
            room="Lab 401",
            scheduled_date=date.today(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            subject_id=subj.id,
            class_id=cls_sec.id,
        ),
    )
    st = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Media",
            last_name="Student",
            email="media.student@campus.edu",
            student_code="STU_MEDIA_01",
            roll_number="ROLL_M_01",
            department="Computer Science",
            class_name="CSE-6A",
        ),
    )

    # 2. Analyze Image (with synthetic JPEG)
    img_bytes = _create_synthetic_jpeg()
    res = await MediaAttendanceService.analyze_image(
        db=test_db_session,
        session_id=sess.id,
        image_bytes=img_bytes,
        filename="test_classroom_photo.jpg",
    )

    assert res.status == "COMPLETED"
    assert res.media_type == "IMAGE"
    assert res.session_id == sess.id
    assert res.session_subject == "Deep Learning"

    # Verify job record in database
    job_id = res.job_id
    assert job_id is not None
    job_db = await test_db_session.get(MediaProcessingJob, job_id)
    assert job_db is not None
    assert job_db.status == "COMPLETED"
    assert job_db.media_type == "IMAGE"

    # Clean up
    await MediaAttendanceService.delete_job(test_db_session, job_id)
    sess_obj = await test_db_session.get(AttendanceSession, sess.id)
    if sess_obj:
        await test_db_session.delete(sess_obj)
    await StudentService.delete_student(test_db_session, st.id)
    await ClassService.delete_class(test_db_session, cls_sec.id)
    await SubjectService.delete_subject(test_db_session, subj.id)


@pytest.mark.asyncio
async def test_video_job_creation_and_cancellation(test_db_session):
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS602",
            name="Computer Vision",
            department="Computer Science",
            credits=4,
            semester=6,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="CSE-6A",
            subject="Computer Vision",
            room="Hall B",
            scheduled_date=date.today(),
            start_time=time(10, 0),
            end_time=time(11, 0),
            subject_id=subj.id,
        ),
    )

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, 10.0, (160, 120))
    for _ in range(20):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        out.write(frame)
    out.release()

    with open(tmp_path, "rb") as f:
        video_bytes = f.read()

    # 1. Create Video Job
    job = await MediaAttendanceService.create_video_job(
        db=test_db_session,
        session_id=sess.id,
        video_bytes=video_bytes,
        filename="cv_lecture.mp4",
    )
    assert job.id is not None
    assert job.status == "QUEUED"
    assert job.media_type == "VIDEO"
    assert job.frames_total == 20

    # 2. Cancel Job
    cancelled = await MediaAttendanceService.cancel_job(test_db_session, job.id)
    assert cancelled is True

    # 3. Verify cancelled state
    job_refreshed = await MediaAttendanceService.get_job_by_id(test_db_session, job.id)
    assert job_refreshed.status == "CANCELLED"

    # 4. Delete Job and session
    await MediaAttendanceService.delete_job(test_db_session, job.id)
    sess_obj = await test_db_session.get(AttendanceSession, sess.id)
    if sess_obj:
        await test_db_session.delete(sess_obj)
    await SubjectService.delete_subject(test_db_session, subj.id)

    import os
    if os.path.exists(tmp_path):
        os.remove(tmp_path)


@pytest.mark.asyncio
async def test_duplicate_attendance_protection_rule(test_db_session):
    """Guarantees 1 student + 1 session = 1 AttendanceRecord regardless of number of media/frame detections."""
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS603",
            name="Algorithms",
            department="Computer Science",
            credits=4,
            semester=6,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="CSE-6A",
            subject="Algorithms",
            room="Room 101",
            scheduled_date=date.today(),
            start_time=time(14, 0),
            end_time=time(15, 0),
            subject_id=subj.id,
        ),
    )
    await AttendanceService.start_session(test_db_session, sess.id)
    st = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Duplicate",
            last_name="Student",
            email="duplicate.student@campus.edu",
            student_code="STU_DUP_01",
            roll_number="ROLL_DUP_01",
            department="Computer Science",
            class_name="CSE-6A",
        ),
    )

    from backend.app.schemas.attendance import AttendanceMarkPayload

    # Mark attendance 10 times consecutively for the exact same student in the same session
    for i in range(10):
        await AttendanceService.mark_attendance(
            db=test_db_session,
            session_id=sess.id,
            payload=AttendanceMarkPayload(
                student_id=st.id,
                confidence=0.92 + (i * 0.005),
                liveness_score=1.0,
                remarks=f"Frame {i * 10}",
            ),
        )

    # Verify exactly 1 attendance record exists in DB
    records_res = await test_db_session.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.session_id == sess.id,
            AttendanceRecord.student_id == st.id,
        )
    )
    all_recs = records_res.scalars().all()
    assert len(all_recs) == 1
    assert all_recs[0].status in ["PRESENT", "LATE"]

    # Clean up
    sess_obj = await test_db_session.get(AttendanceSession, sess.id)
    if sess_obj:
        await test_db_session.delete(sess_obj)
    await StudentService.delete_student(test_db_session, st.id)
    await SubjectService.delete_subject(test_db_session, subj.id)
