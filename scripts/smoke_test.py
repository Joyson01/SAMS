"""Real-image HTTP smoke test on a disposable SQLite database and local server.
Run from the repo root: python -m scripts.smoke_test
Uses InsightFace's t1 sample. Does not use a webcam or the user's database.
"""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import cv2
import httpx
from insightface.data import get_image

ROOT=Path(__file__).resolve().parents[1]

@contextmanager
def isolated_server():
    with tempfile.TemporaryDirectory(prefix='attedel-smoke-') as tmp:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        token=secrets.token_urlsafe(24)
        env={**os.environ,'ENVIRONMENT':'testing','AUTH_BYPASS':'false','SECRET_KEY':secrets.token_urlsafe(48),'BOOTSTRAP_TOKEN':token,
             'DATABASE_URL':f'sqlite+aiosqlite:///{tmp}/smoke.db','DATABASE_FALLBACK_SQLITE':'false','ENROLLMENT_REQUIRED_POSES':'FRONT','LOG_LEVEL':'WARNING','DEBUG':'false'}
        with open(Path(tmp)/'server.log','w+') as log:
            process=subprocess.Popen([sys.executable,'-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port',str(port)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
            base=f'http://127.0.0.1:{port}'
            try:
                for _ in range(120):
                    if process.poll() is not None:
                        log.seek(0);raise RuntimeError('Server exited: '+log.read()[-3000:])
                    try:
                        health=httpx.get(base+'/health',timeout=2)
                        if health.status_code==200: break
                    except httpx.HTTPError: pass
                    time.sleep(.5)
                else: raise RuntimeError('Server startup timed out; run python -m scripts.check_models.')
                yield base,token,Path(tmp)
            finally:
                process.terminate()
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait()

def real_samples():
    from backend.app.services.recognition_service import get_pipeline
    from backend.app.services.enrollment_service import check_image
    image=get_image('t1')
    pipeline=get_pipeline()
    samples=[]
    known=None
    for face in pipeline.detector.detect(image):
        x1,y1,x2,y2=face.bbox.to_int_xyxy()
        pad=int(max(x2-x1,y2-y1)*.35)
        crop=image[max(0,y1-pad):min(image.shape[0],y2+pad),max(0,x1-pad):min(image.shape[1],x2+pad)]
        ok,data=cv2.imencode('.jpg',crop)
        if not ok: continue
        feedback,_=check_image(data.tobytes(),'FRONT')
        if feedback['valid'] and known is None:
            known=data.tobytes()
        elif feedback['face_count']==1 and feedback.get('quality',{}).get('is_valid') and abs(feedback['pitch'])<=35 and abs(feedback['yaw'])<=45:
            samples.append(data.tobytes())
    if known is None or not samples:raise RuntimeError('Need one valid frontal enrollment crop and a different detectable face in InsightFace t1.')
    return [known,samples[0]]

def run_http(base,bootstrap_token,samples):
    with httpx.Client(base_url=base+'/api/v1',timeout=60) as c:
        def request(method,path,expected=200,**kwargs):
            r=c.request(method,path,**kwargs)
            assert r.status_code==expected,f'{method} {path}: {r.status_code} {r.text[:500]}'
            return r.json() if r.content else None
        account=dict(username='smoke_admin',email='smoke-admin@example.com',full_name='Smoke Administrator',password='SmokeSecure123')
        request('POST','/auth/bootstrap-admin',201,json={**account,'bootstrap_token':bootstrap_token})
        user=request('POST','/auth/register',201,json={**account,'username':'smoke_student','email':'smoke-student@example.com','role':'ADMIN'})
        assert user['role']=='STUDENT'
        tokens=request('POST','/auth/login',json={'username_or_email':account['username'],'password':account['password']})
        c.headers['Authorization']='Bearer '+tokens['access_token']
        cls=request('POST','/classes',201,json={'name':'SMOKE-A','department':'CS'})
        subject=request('POST','/subjects',201,json={'code':'SMOKE-CV','name':'Computer Vision','department':'CS'})
        request('PUT',f"/classes/{cls['id']}",json={'assigned_subject_ids':[subject['id']]})
        students=[]
        for i in (1,2):
            students.append(request('POST','/students',201,json=dict(student_code=f'SMOKE{i}',roll_number=f'SMOKE{i}',first_name='Smoke',last_name=f'Student {i}',email=f'smoke{i}@example.com',department='CS',class_name='SMOKE-A')))
        sid=students[0]['id']
        request('PUT',f"/auth/users/{user['id']}/student",json={'roll_number':'SMOKE1','student_code':'SMOKE1'})
        files={'file':('face.jpg',samples[0],'image/jpeg')}
        checked=request('POST',f'/students/{sid}/enroll/check',files=files,data={'pose_type':'FRONT'})
        assert checked['valid'],checked
        enrolled=request('POST',f'/students/{sid}/enroll',files=files,data={'pose_type':'FRONT'})
        assert enrolled['success'] and enrolled['complete'],enrolled
        analyzed=request('POST','/recognition/analyze-frame',files=files)
        assert analyzed['faces'][0]['bucket']=='VERIFIED',analyzed
        assert analyzed['faces'][0]['best_match']['student_id']==sid
        unknown=request('POST','/recognition/analyze-frame',files={'file':('unknown.jpg',samples[1],'image/jpeg')})
        assert all(f['bucket']=='UNKNOWN' for f in unknown['faces']),unknown
        student_tokens = request('POST', '/auth/login', json={
            'username_or_email': user['username'], 'password': account['password'],
        })
        student_headers = {'Authorization': 'Bearer ' + student_tokens['access_token']}
        match_endpoint = '/student-portal/face/match'
        assert request('POST', match_endpoint, headers=student_headers, files=files) ["matched"] is True
        assert request('POST', match_endpoint, headers=student_headers,
                       files={'file': ('other.jpg', samples[1], 'image/jpeg')}) ["matched"] is False
        now=datetime.now(timezone.utc)
        session=request('POST','/attendance/sessions',201,json=dict(class_id=cls['id'],class_name=cls['name'],subject_id=subject['id'],subject=subject['name'],room='Laptop',scheduled_date=now.date().isoformat(),start_time=now.time().replace(tzinfo=None).isoformat(),end_time=(now+timedelta(minutes=30)).time().replace(tzinfo=None).isoformat()))
        session_id=session['id'];request('PUT',f'/attendance/sessions/{session_id}/start')
        start=time.perf_counter();first_present=None;statuses=[]
        for _ in range(8):
            r=request('POST','/recognition/process',params={'session_id':session_id},files=files)
            statuses.append(r['faces'][0]['status'])
            records=request('GET',f'/attendance/sessions/{session_id}/records')
            if records and first_present is None:first_present=round(time.perf_counter()-start,2)
            time.sleep(.25)
        assert 'VERIFYING' in statuses and 'VERIFIED' in statuses,statuses
        assert len(records)==1 and records[0]['status']=='PRESENT',records
        assert first_present is not None and first_present<3,first_present
        request('PUT',f'/attendance/sessions/{session_id}/close')
        records=request('GET',f'/attendance/sessions/{session_id}/records')
        assert {r['student_id']:r['status'] for r in records}=={sid:'PRESENT',students[1]['id']:'ABSENT'},records
        request('POST','/recognition/process',400,params={'session_id':session_id},files=files)
        exported=c.get('/reports/export/csv',params={'session_id':session_id})
        assert exported.status_code==200 and 'PRESENT' in exported.text and 'ABSENT' in exported.text
        return {'result':'PASS','first_present_seconds':first_present,'similarity':analyzed['faces'][0]['similarity'],'unknown_bucket':unknown['faces'][0]['bucket'],
                'frames':statuses,'records':len(records),'final_statuses':['PRESENT','ABSENT'],'csv':'PASS','enrollment_poses_tested':['FRONT'],
                'note':'Disposable test server explicitly configures FRONT only. Seven-pose physical-webcam flow requires manual QA.'}

def main():
    samples=real_samples()
    with isolated_server() as (base,token,_):result=run_http(base,token,samples)
    print(json.dumps(result,indent=2))
    report=ROOT/'docs'/'SMOKE_RESULT.json';report.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
