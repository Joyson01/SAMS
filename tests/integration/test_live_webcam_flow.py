from datetime import datetime,timezone,timedelta
from pathlib import Path
import pytest
from backend.app.services import recognition_service as rec

@pytest.mark.asyncio
async def test_live_face_consensus_close_and_isolation(staff_client):
    c=staff_client
    image=Path('tests/fixtures/sample_student.jpg').read_bytes()
    ids=[]
    for n in [1,2]:
        r=await c.post('/api/v1/students',json=dict(student_code=f'LIVE{n}',roll_number=f'LIVE{n}',first_name='Live',last_name=str(n),email=f'live{n}@example.com',department='CS',class_name='LIVE-A'))
        assert r.status_code==201,r.text
        ids.append(r.json()['id'])
    r=await c.post(f'/api/v1/students/{ids[0]}/enroll',files={'file':('face.jpg',image,'image/jpeg')},data={'pose_type':'FRONT'})
    assert r.json()['success'],r.text
    now=datetime.now(timezone.utc)
    r=await c.post('/api/v1/attendance/sessions',json=dict(class_name='LIVE-A',subject='CV',room='Laptop',scheduled_date=now.date().isoformat(),start_time=now.time().replace(tzinfo=None).isoformat(),end_time=(now+timedelta(minutes=30)).time().replace(tzinfo=None).isoformat()))
    assert r.status_code==201,r.text
    sid=r.json()['id']
    assert (await c.put(f'/api/v1/attendance/sessions/{sid}/start')).status_code==200
    statuses=[]
    for _ in range(8):
        r=await c.post('/api/v1/recognition/process',params={'session_id':sid},files={'file':('frame.jpg',image,'image/jpeg')})
        assert r.status_code==200,r.text
        statuses.append(r.json()['faces'][0]['status'])
    assert 'VERIFYING' in statuses and 'VERIFIED' in statuses,statuses
    records=(await c.get(f'/api/v1/attendance/sessions/{sid}/records')).json()
    assert len(records)==1,records
    assert records[0]['status']=='PRESENT'
    rec._get_or_create_stream_state(sid,'another-camera')
    r=await c.put(f'/api/v1/attendance/sessions/{sid}/close')
    assert r.status_code==200,r.text
    assert not any(key[0]==sid for key in rec._stream_states)
    assert not any(key[0]==sid for key in rec._stream_locks)
    records=(await c.get(f'/api/v1/attendance/sessions/{sid}/records')).json()
    assert {r['status'] for r in records}=={'PRESENT','ABSENT'}
    r=await c.post('/api/v1/recognition/process',params={'session_id':sid},files={'file':('frame.jpg',image,'image/jpeg')})
    assert r.status_code==400,r.text
