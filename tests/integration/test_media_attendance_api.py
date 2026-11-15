import pytest
import io
from datetime import date, time
import numpy as np
from PIL import Image

from backend.app.models.entities import AttendanceSession, Student
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


@pytest.mark.asyncio
async def test_media_attendance_unauthorized(client):
    """Verifies that unauthenticated access to media attendance is rejected."""
    resp = await client.get("/api/v1/media-attendance/jobs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_media_attendance_api_endpoints(staff_client, test_db_session):
    # 1. Setup Subject & Session
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS801",
            name="Computer Graphics",
            department="Computer Science",
            credits=4,
            semester=8,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="CSE-8A",
            subject="Computer Graphics",
            room="Graphics Studio",
            scheduled_date=date.today(),
            start_time=time(11, 0),
            end_time=time(12, 0),
            subject_id=subj.id,
        ),
    )

    # 1b. Test Session Biometric Validation API
    val_resp = await staff_client.get(f'/api/v1/media-attendance/session-validation/{sess.id}')
    assert val_resp.status_code == 200
    val_json = val_resp.json()
    assert val_json['session_id'] == sess.id
    assert 'total_enrolled_students' in val_json
    assert 'can_process' in val_json

    # 2. Test Image Diagnostic API (/api/v1/media-attendance/analyze-image)
    img = Image.new('RGB', (100, 100), color='white')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    diag_files = {'file': ('classroom_diag.jpg', img_bytes, 'image/jpeg')}
    diag_resp = await staff_client.post('/api/v1/media-attendance/analyze-image', files=diag_files)
    assert diag_resp.status_code == 200
    diag_json = diag_resp.json()
    assert "faces_detected" in diag_json
    assert "faces" in diag_json

    # Photo writes now require ACTIVE, including the compatibility endpoint.
    inactive = await staff_client.post(
        "/api/v1/media-attendance/image",
        data={"session_id": sess.id},
        files={"file": ("classroom.jpg", img_bytes, "image/jpeg")},
    )
    assert inactive.status_code == 400
    await AttendanceService.start_session(test_db_session, sess.id)

    # 3. Test Image Attendance API (/api/v1/media-attendance/image)
    files = {'file': ('classroom.jpg', img_bytes, 'image/jpeg')}
    data = {'session_id': sess.id}

    img_resp = await staff_client.post('/api/v1/media-attendance/image', data=data, files=files)
    assert img_resp.status_code == 200
    img_json = img_resp.json()
    assert img_json['status'] == 'COMPLETED'
    assert img_json['session_id'] == sess.id
    assert img_json['media_type'] == 'IMAGE'
    assert 'results' in img_json
    assert 'faces' in img_json
    job_id = img_json['job_id']

    # 3b. Test Image Attendance via /api alias and sessionId alias
    files_alias = {'image': ('classroom_alias.jpg', img_bytes, 'image/jpeg')}
    data_alias = {'sessionId': sess.id}
    img_alias_resp = await staff_client.post('/api/media-attendance/image', data=data_alias, files=files_alias)
    assert img_alias_resp.status_code == 200
    assert img_alias_resp.json()['status'] == 'COMPLETED'

    # 3c. Test missing session ID returns 400 Bad Request
    bad_resp = await staff_client.post('/api/v1/media-attendance/image', data={}, files=files)
    assert bad_resp.status_code == 400

    # 4. Test List Jobs API
    list_resp = await staff_client.get('/api/v1/media-attendance/jobs')
    assert list_resp.status_code == 200
    jobs_list = list_resp.json()
    assert len(jobs_list) >= 1

    # 5. Test Get Specific Job
    if job_id:
        get_resp = await staff_client.get(f'/api/v1/media-attendance/jobs/{job_id}')
        assert get_resp.status_code == 200
        assert get_resp.json()['id'] == job_id

        # 5b. Test Get Job Results
        res_resp = await staff_client.get(f'/api/v1/media-attendance/jobs/{job_id}/results')
        assert res_resp.status_code == 200
        assert 'job' in res_resp.json()

        # 6. Test Delete Job
        del_resp = await staff_client.delete(f'/api/v1/media-attendance/jobs/{job_id}')
        assert del_resp.status_code == 204

    # 7. Test Photo Capture Recognize Image API (/api/attendance/recognize-image)
    import cv2
    import time as pytime
    from backend.app.services.face_recognition_service import face_recognition_service
    from backend.app.services.recognition_service import get_pipeline

    # Create enrolled student in this class
    st = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Kavya",
            last_name="Nair",
            email="kavya.nair@campus.edu",
            student_code="STU-GRAPHICS-01",
            roll_number="CSE-G-01",
            department="Computer Science",
            class_name="CSE-8A",
        ),
    )

    with open('tests/fixtures/sample_student.jpg', 'rb') as f:
        sample_bytes = f.read()

    # Pre-register embedding for sample student so recognition succeeds
    img_cv = cv2.imread('tests/fixtures/sample_student.jpg')
    pipeline = get_pipeline()
    faces = pipeline.detector.detect(img_cv)
    if faces:
        crop = pipeline.aligner.align(img_cv, faces[0].landmarks)
        emb = pipeline.embedder.extract_from_crop(crop)
        norm = float(np.linalg.norm(emb))
        # Photo attendance now reads enrolled profiles from the configured DB.
        from backend.app.models.entities import FaceProfile
        test_db_session.add(FaceProfile(student_id=st.id, embedding_data=(emb / norm).tolist()))
        await test_db_session.commit()
        face_recognition_service._embeddings[st.id] = (emb / norm).astype(np.float32)
        face_recognition_service._last_embeddings_load_time = pytime.time()
        face_recognition_service._gallery_matrix_cache = None
        face_recognition_service._gallery_ids_cache = None

    rec_files = {'image': ('capture.jpg', sample_bytes, 'image/jpeg')}
    rec_data = {'session_id': sess.id}
    rec_resp = await staff_client.post('/api/attendance/recognize-image', data=rec_data, files=rec_files)
    assert rec_resp.status_code == 200
    rec_json = rec_resp.json()
    assert rec_json['success'] is True
    assert rec_json['faces_detected'] >= 1
    assert 'results' in rec_json
    assert 'annotated_image_url' in rec_json

    # 7b. Test duplicate photo recognition
    rec_files_dup = {'image': ('capture.jpg', sample_bytes, 'image/jpeg')}
    rec_dup_resp = await staff_client.post('/api/attendance/recognize-image', data=rec_data, files=rec_files_dup)
    assert rec_dup_resp.status_code == 200
    rec_dup_json = rec_dup_resp.json()
    assert rec_dup_json['success'] is True
    assert rec_dup_json['duplicates_skipped'] >= 1
    assert rec_dup_json['duplicates_skipped'] >= 1

    # Clean up
    sess_obj = await test_db_session.get(AttendanceSession, sess.id)
    if sess_obj:
        await test_db_session.delete(sess_obj)
    await SubjectService.delete_subject(test_db_session, subj.id)
