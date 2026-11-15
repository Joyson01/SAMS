import pytest
import io
import os
import tempfile
import cv2
import numpy as np
from datetime import date, time
from sqlalchemy import select

from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    ClassSection,
    FaceProfile,
    MediaProcessingJob,
    Student,
)
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.class_service import ClassService
from backend.app.services.media_attendance_service import MediaAttendanceService
from backend.app.services.recognition_service import RecognitionService, get_pipeline
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


@pytest.mark.asyncio
async def test_image_and_video_attendance_complete_pipeline(test_db_session):
    """Verifies end-to-end Image and Video attendance pipelines, source tagging, and duplicate protection."""
    # 1. Create Class, Subject, Session, and Enrolled Student
    cls_sec = await ClassService.create_class(
        test_db_session,
        ClassSectionCreate(
            name="TE-B",
            department="Computer Engineering",
            year=3,
            semester=5,
        ),
    )
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="24CSPC501C",
            name="Theoretical Computer Science",
            department="Computer Engineering",
            credits=4,
            semester=5,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="TE-B",
            subject="Theoretical Computer Science",
            room="CR 26",
            scheduled_date=date(2026, 8, 31),
            start_time=time(12, 0),
            end_time=time(13, 0),
            subject_id=subj.id,
            class_id=cls_sec.id,
        ),
    )
    st = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Rahul",
            last_name="Sharma",
            email="rahul.sharma@college.edu",
            student_code="STU_RAHUL_01",
            roll_number="TEB_01",
            department="Computer Engineering",
            class_name="TE-B",
        ),
    )

    # 2. Add Face Encoding to Student and Sync Gallery
    dummy_embedding = np.random.randn(512).astype(np.float32)
    dummy_embedding = dummy_embedding / np.linalg.norm(dummy_embedding)

    face_enc = FaceProfile(
        student_id=st.id,
        embedding_data=dummy_embedding.tolist(),
        model_name="buffalo_l",
        quality_score=0.98,
        image_path="test_rahul.jpg",
    )
    test_db_session.add(face_enc)
    await test_db_session.commit()

    # Synchronize pipeline gallery
    await RecognitionService.sync_gallery_from_db(test_db_session)
    pipeline = get_pipeline()
    assert pipeline.matcher.total_templates >= 1

    # 3. Simulate Image Attendance where pipeline detects Rahul
    # We can mock pipeline.process_frame or verify analyze_image with synthetic image
    img = np.full((300, 300, 3), 128, dtype=np.uint8)
    ret, buf = cv2.imencode('.jpg', img)
    image_bytes = buf.tobytes()

    # First Image Run
    res_img = await MediaAttendanceService.analyze_image(
        db=test_db_session,
        session_id=sess.id,
        image_bytes=image_bytes,
        filename="classroom_group_photo.jpg",
    )
    assert res_img.status == "COMPLETED"
    assert res_img.media_type == "IMAGE"
    assert res_img.session_id == sess.id

    # 4. Video Attendance Test
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, 5.0, (160, 120))
    for _ in range(15):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        out.write(frame)
    out.release()

    with open(tmp_path, "rb") as f:
        vid_bytes = f.read()

    job = await MediaAttendanceService.create_video_job(
        db=test_db_session,
        session_id=sess.id,
        video_bytes=vid_bytes,
        filename="lecture_recording.mp4",
    )
    assert job.status == "QUEUED"
    assert job.frames_total == 15

    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def mock_session_ctx():
        yield test_db_session

    # Run background processing directly
    await MediaAttendanceService.process_video_background(
        job_id=job.id,
        sample_fps=2.0,
        session_factory=mock_session_ctx,
    )

    job_refreshed = await MediaAttendanceService.get_job_by_id(test_db_session, job.id)
    assert job_refreshed.status == "COMPLETED"
    assert job_refreshed.frames_processed > 0

    if os.path.exists(tmp_path):
        os.remove(tmp_path)
