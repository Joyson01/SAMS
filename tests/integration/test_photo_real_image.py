from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest
from sqlalchemy import select,func
from backend.app.models.entities import AttendanceRecord

@pytest.mark.asyncio
async def test_photo_preview_real_face_no_writes_then_confirm(staff_client,test_db_session):
    c=staff_client
    st=(await c.post('/api/v1/students',json=dict(student_code='REAL-PHOTO',roll_number='REAL-PHOTO',first_name='Photo',last_name='Student',email='photo-real@example.com',department='CS',class_name='PHOTO-A'))).json()
    image=Path('tests/fixtures/sample_student.jpg').read_bytes()
    enrolled=await c.post(f"/api/v1/students/{st['id']}/enroll",files={'file':('face.jpg',image,'image/jpeg')},data={'pose_type':'FRONT'})
    assert enrolled.json()['success'],enrolled.text
    now=datetime.now(timezone.utc)
    session=(await c.post('/api/v1/attendance/sessions',json=dict(class_name='PHOTO-A',subject='CV',room='Lab',scheduled_date=now.date().isoformat(),start_time=now.time().replace(tzinfo=None).isoformat(),end_time=(now+timedelta(minutes=30)).time().replace(tzinfo=None).isoformat()))).json()
    sid=session['id']
    await c.put(f'/api/v1/attendance/sessions/{sid}/start')
    r=await c.post('/api/v1/media-attendance/image/preview',data={'session_id':sid},files={'images':('photo.jpg',image,'image/jpeg')})
    assert r.status_code==200,r.text
    photo=r.json()['images'][0]
    assert photo['annotated_image'].startswith('data:image/jpeg;base64,')
    assert await test_db_session.scalar(select(func.count(AttendanceRecord.id)))==0
    face=photo['faces'][0]
    assert face['bucket']=='VERIFIED',face
    payload={'session_id':sid,'selections':[{'student_id':st['id'],'face_ref':face['face_ref']}]}
    assert (await c.post('/api/v1/media-attendance/image/confirm',json=payload)).json()['marked']==1
    assert (await c.post('/api/v1/media-attendance/image/confirm',json=payload)).json()['marked']==0
    assert await test_db_session.scalar(select(func.count(AttendanceRecord.id)))==1
