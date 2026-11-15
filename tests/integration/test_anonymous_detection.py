import io
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import event


@pytest.mark.asyncio
async def test_anonymous_photo_has_no_identity_access(staff_client, test_db_session, monkeypatch):
    from backend.app.services import recognition_service

    def forbidden(*args, **kwargs):
        raise AssertionError('Anonymous detection must not invoke recognition')

    monkeypatch.setattr(recognition_service, 'get_pipeline', forbidden)
    statements = []
    engine = test_db_session.bind.sync_engine

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())

    event.listen(engine, 'before_cursor_execute', capture)
    try:
        response = await staff_client.post('/api/v1/detection/photo', files={
            'file': ('face.jpg', Path('tests/fixtures/sample_student.jpg').read_bytes(), 'image/jpeg'),
        })
    finally:
        event.remove(engine, 'before_cursor_execute', capture)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['mode'] == 'anonymous'
    assert data['face_count'] == len(data['faces']) > 0
    assert data['frame_width'] > 0 and data['frame_height'] > 0
    for face in data['faces']:
        assert set(face) == {'bbox', 'detection_score', 'small_face'}
        assert len(face['bbox']) == 4
        assert 0 <= face['detection_score'] <= 1
    assert not any(table in sql for sql in statements for table in
                   ('students', 'face_profiles', 'attendance_records', 'attendance_sessions'))
    assert not any(sql.lstrip().startswith(('insert', 'update', 'delete')) for sql in statements)


@pytest.mark.asyncio
@pytest.mark.parametrize('payload,status', [(b'', 413), (b'bad image', 415), (b'x' * (15 * 1024 * 1024 + 1), 413)])
async def test_anonymous_invalid_upload(staff_client, payload, status):
    response = await staff_client.post('/api/v1/detection/photo', files={'file': ('bad.jpg', payload, 'image/jpeg')})
    assert response.status_code == status


@pytest.mark.asyncio
async def test_anonymous_requires_login(client):
    response = await client.post('/api/v1/detection/photo', files={'file': ('face.jpg', b'bad', 'image/jpeg')})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_anonymous_rotated_empty_photo(staff_client):
    photo = Image.new('RGB', (80, 40), 'white')
    exif = photo.getexif()
    exif[274] = 6
    payload = io.BytesIO()
    photo.save(payload, 'JPEG', exif=exif)
    response = await staff_client.post('/api/v1/detection/photo', files={'file': ('rotated.jpg', payload.getvalue(), 'image/jpeg')})
    assert response.status_code == 200, response.text
    assert response.json()['frame_width'] == 40
    assert response.json()['frame_height'] == 80
    assert response.json()['faces'] == []


@pytest.mark.asyncio
async def test_anonymous_rejects_student_role(client):
    from types import SimpleNamespace
    from backend.app.core.security import get_current_user
    from backend.app.main import app

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role='STUDENT')
    try:
        response = await client.post('/api/v1/detection/photo', files={'file': ('face.jpg', b'bad', 'image/jpeg')})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_anonymous_rejects_excessive_dimensions(staff_client):
    payload = io.BytesIO()
    Image.new('RGB', (8001, 1)).save(payload, 'PNG')
    response = await staff_client.post('/api/v1/detection/photo', files={'file': ('wide.png', payload.getvalue(), 'image/png')})
    assert response.status_code == 413


def test_anonymous_retains_small_face_without_identity(monkeypatch):
    import numpy as np
    from ai_engine.base import BoundingBox, DetectedFace
    from ai_engine.detection import scrfd
    from backend.app.services import anonymous_detection as service

    class ModelOutput:
        def __init__(self, **kwargs):
            pass

        def detect(self, image):
            return [DetectedFace(BoundingBox(10, 10, 27, 32, .86), np.zeros((5, 2)), .86)]

    monkeypatch.setattr(scrfd, 'SCRFDFaceDetector', ModelOutput)
    monkeypatch.setattr(service, '_detector', None)
    payload = io.BytesIO()
    Image.new('RGB', (80, 80)).save(payload, 'PNG')
    result = service.analyze_photo(payload.getvalue())
    assert result['face_count'] == 1
    assert result['faces'] == [{'bbox': [10, 10, 27, 32], 'detection_score': .86, 'small_face': True}]


@pytest.mark.asyncio
async def test_anonymous_rejects_animation(staff_client):
    payload = io.BytesIO()
    first = Image.new('RGB', (80, 80), 'white')
    first.save(payload, 'PNG', save_all=True, append_images=[Image.new('RGB', (80, 80), 'black')], duration=100, loop=0)
    response = await staff_client.post('/api/v1/detection/photo', files={'file': ('animated.png', payload.getvalue(), 'image/png')})
    assert response.status_code == 415
    assert 'still' in response.json()['detail'].lower()
