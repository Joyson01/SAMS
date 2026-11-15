import pytest
from pathlib import Path
from sqlalchemy import select, func
from backend.app.models.entities import FaceProfile

@pytest.mark.asyncio
async def test_guided_enrollment_checks_real_image_and_rejects_duplicate(staff_client, test_db_session):
    c=staff_client
    async def student(n):
        r=await c.post('/api/v1/students',json=dict(student_code=f'GUIDE{n}',roll_number=f'GUIDE{n}',first_name='Guide',last_name=str(n),email=f'guide{n}@example.com',department='CS',class_name='TEST-A'))
        assert r.status_code==201,r.text
        return r.json()['id']
    sid=await student(1)
    image=Path('tests/fixtures/sample_student.jpg').read_bytes()
    files={'file':('face.jpg',image,'image/jpeg')}
    r=await c.post(f'/api/v1/students/{sid}/enroll/check',files=files,data={'pose_type':'FRONT'})
    assert r.status_code==200,r.text
    assert r.json()['face_count']==1
    assert 'brightness' in r.json()
    assert await test_db_session.scalar(select(func.count(FaceProfile.id)))==0
    r=await c.post(f'/api/v1/students/{sid}/enroll',files=files,data={'pose_type':'FRONT'})
    assert r.status_code==200,r.text
    assert r.json()['success'],r.text
    r=await c.post(f'/api/v1/students/{sid}/enroll',files=files,data={'pose_type':'FRONT'})
    assert r.json()['success']
    assert await test_db_session.scalar(select(func.count(FaceProfile.id)))==1
    sid2=await student(2)
    r=await c.post(f'/api/v1/students/{sid2}/enroll',files=files,data={'pose_type':'FRONT'})
    assert r.status_code==409,r.text
    r=await c.post(f'/api/v1/students/{sid}/enroll',files=files,data={'pose_type':'MADE_UP'})
    assert r.status_code==422
