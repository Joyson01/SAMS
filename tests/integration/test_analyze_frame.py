from pathlib import Path
import pytest
from sqlalchemy import select,func
from backend.app.models.entities import AttendanceRecord,FaceProfile,User

@pytest.mark.asyncio
@pytest.mark.parametrize("photo", [False, True])
async def test_analyze_frame_is_read_only_with_real_image(staff_client,test_db_session,photo):
    before=[await test_db_session.scalar(select(func.count()).select_from(m)) for m in (AttendanceRecord,FaceProfile,User)]
    r=await staff_client.post('/api/v1/recognition/analyze-frame',params={'photo': photo},files={'file':('face.jpg',Path('tests/fixtures/sample_student.jpg').read_bytes(),'image/jpeg')})
    assert r.status_code==200,r.text
    data=r.json()
    assert data['faces']
    assert data['faces'][0]['bucket'] in {'VERIFIED','CANDIDATE','UNKNOWN'}
    assert data['frame_width']>0
    if not photo:
        assert 'detection_score' in data['faces'][0]
    else:
        assert data['mode'] == 'photo'
        assert 'quality_flags' in data['faces'][0]
    assert before==[await test_db_session.scalar(select(func.count()).select_from(m)) for m in (AttendanceRecord,FaceProfile,User)]

@pytest.mark.asyncio
async def test_analyze_invalid_image(staff_client):
    r=await staff_client.post('/api/v1/recognition/analyze-frame',files={'file':('face.jpg',b'bad','image/jpeg')})
    assert r.status_code==422
