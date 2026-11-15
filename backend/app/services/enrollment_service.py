"""Guided enrollment with server-owned quality, pose and identity validation."""
import asyncio
import hashlib
from dataclasses import asdict
import cv2
import numpy as np
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.core.config import settings
from backend.app.models.entities import Student, FaceProfile
from backend.app.services.recognition_service import get_pipeline, RecognitionService

POSE_HINTS = {'FRONT':'Look straight ahead', 'LEFT_15':'Turn slightly left', 'RIGHT_15':'Turn slightly right', 'TILT_UP':'Tilt your chin up', 'TILT_DOWN':'Tilt your chin down', 'ROLL_RIGHT':'Tilt your head slightly sideways', 'BACKUP_FRONT':'Look straight ahead for the backup sample'}
_enrollment_lock = asyncio.Lock()

def required_poses():
    poses = [p.strip().upper() for p in settings.ENROLLMENT_REQUIRED_POSES.split(',') if p.strip()]
    if not poses or len(set(poses)) != len(poses) or any(p not in POSE_HINTS for p in poses):
        raise HTTPException(503,'Invalid ENROLLMENT_REQUIRED_POSES configuration.')
    return poses

def pose_matches(pose, target):
    if target in {'FRONT','BACKUP_FRONT'}:
        return abs(pose.yaw)<=18 and abs(pose.pitch)<=25 and abs(pose.roll)<=15
    if target=='LEFT_15': return -40<=pose.yaw<=-8 and abs(pose.pitch)<=30
    if target=='RIGHT_15': return 8<=pose.yaw<=40 and abs(pose.pitch)<=30
    if target=='TILT_UP': return pose.pitch<=-8 and abs(pose.yaw)<=25
    if target=='TILT_DOWN': return 18<=pose.pitch<=45 and abs(pose.yaw)<=25
    if target=='ROLL_RIGHT': return 10<=abs(pose.roll)<=30 and abs(pose.yaw)<=25
    return False

def check_image(data, target, embed=False):
    if target not in required_poses():
        raise HTTPException(422,'Choose a configured enrollment pose.')
    if not data or len(data)>10*1024*1024:
        raise HTTPException(413,'Upload a nonempty image under 10 MB.')
    image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(422,'Cannot decode image. Use JPEG or PNG.')
    try:
        pipeline=get_pipeline()
    except Exception as exc:
        raise HTTPException(503,'AI engine unavailable. Run python -m scripts.check_models.') from exc
    faces=pipeline.detector.detect(image)
    result={'face_count':len(faces),'bbox':None,'yaw':None,'pitch':None,'roll':None,'blur':None,'brightness':None,'valid':False,'hint':'No face detected. Move into the guide.','frame_width':image.shape[1],'frame_height':image.shape[0]}
    if len(faces)!=1:
        if faces: result['hint']='Only one face please'
        return result,None
    face=faces[0]
    quality=pipeline.quality_analyzer.analyze(image,face.bbox)
    pose=pipeline.pose_estimator.estimate(face.landmarks)
    valid=quality.is_valid and pose_matches(pose,target)
    hint='Hold still' if valid else (quality.rejection_reason if not quality.is_valid else POSE_HINTS[target])
    if quality.brightness and quality.brightness<40: hint='Too dark. Face a light source.'
    result.update(bbox=face.bbox.to_list()[:4],yaw=pose.yaw,pitch=pose.pitch,roll=pose.roll,blur=quality.sharpness,brightness=quality.brightness,valid=bool(valid),hint=hint,quality=asdict(quality))
    embedding=pipeline.embedder.extract_from_crop(pipeline.aligner.align(image,face.landmarks)) if embed and valid else None
    return result,embedding

async def enrollment_status(db, student_id):
    if not await db.get(Student,student_id): raise HTTPException(404,'Student not found.')
    profiles=(await db.scalars(select(FaceProfile).where(FaceProfile.student_id==student_id))).all()
    poses=required_poses()
    completed=sorted({p.pose_type for p in profiles} & set(poses))
    return {'required_poses':poses,'completed_poses':completed,'hints':POSE_HINTS,'sample_count':len(completed),'complete':set(poses)<=set(completed)}

async def enroll(db,student_id,data,target):
    student=await db.get(Student,student_id)
    if not student: raise HTTPException(404,'Student not found.')
    result,embedding=await asyncio.to_thread(check_image,data,target,True)
    if embedding is None:
        return {'success':False,'message':result['hint'],**result}
    async with _enrollment_lock:
        profiles=(await db.scalars(select(FaceProfile))).all()
        for profile in profiles:
            if profile.student_id==student_id: continue
            vector=np.asarray(profile.embedding_data,dtype=np.float32)
            if vector.shape==(512,) and np.linalg.norm(vector)>0 and float(np.dot(embedding,vector/np.linalg.norm(vector)))>=0.80:
                other=await db.get(Student,profile.student_id)
                raise HTTPException(409,f'This face is already enrolled for {other.first_name if other else "another student"}. Ask an administrator to review the identity.')
        same=[p for p in profiles if p.student_id==student_id and p.pose_type==target]
        profile=same[0] if same else FaceProfile(student_id=student_id,pose_type=target)
        profile.embedding_data=embedding.tolist()
        profile.image_hash=hashlib.sha256(data).hexdigest()
        profile.model_name='buffalo_l/ArcFace'
        profile.quality_score=min(1.0,result['blur']/120)
        db.add(profile)
        for duplicate in same[1:]: await db.delete(duplicate)
        completed={p.pose_type for p in profiles if p.student_id==student_id}|{target}
        student.enrollment_status='ENROLLED' if set(required_poses())<=completed else 'PARTIAL'
        await db.commit()
        await RecognitionService.sync_gallery_from_db(db)
    return {'success':True,'message':'Sample saved and recognition gallery updated.',**(await enrollment_status(db,student_id))}
