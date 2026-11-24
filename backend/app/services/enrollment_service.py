"""Guided enrollment with server-owned quality, pose and identity validation."""
import asyncio
import hashlib
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
import cv2
import numpy as np
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from ai_engine.recognition.photo_matcher import assign_faces, classify_scores
from backend.app.services.audit_service import record_student_activity
from backend.app.core.config import settings
from backend.app.models.entities import User, AuditLog, FaceProfile, Student, StudentPortalRequest
from backend.app.services.recognition_service import get_pipeline, RecognitionService
from backend.app.services.photo_attendance_service import decode_photo, recognize_photo

POSE_HINTS = {'FRONT':'Look straight ahead', 'LEFT_15':'Turn slightly to your left', 'RIGHT_15':'Turn slightly to your right', 'TILT_UP':'Tilt your chin up', 'TILT_DOWN':'Tilt your chin down', 'ROLL_RIGHT':'Tilt your head slightly sideways', 'BACKUP_FRONT':'Look straight ahead for the backup sample'}
_enrollment_lock = asyncio.Lock()

def required_poses():
    poses = [p.strip().upper() for p in settings.ENROLLMENT_REQUIRED_POSES.split(',') if p.strip()]
    if not poses or len(set(poses)) != len(poses) or any(p not in POSE_HINTS for p in poses):
        raise HTTPException(503,'Invalid ENROLLMENT_REQUIRED_POSES configuration.')
    return poses

def pose_matches(pose, target):
    if target in {'FRONT','BACKUP_FRONT'}:
        return abs(pose.yaw)<=18 and abs(pose.pitch)<=25 and abs(pose.roll)<=15
    # The estimator uses the unmirrored image: image-right is the student's left.
    if target=='LEFT_15': return 8<=pose.yaw<=40 and abs(pose.pitch)<=30
    if target=='RIGHT_15': return -40<=pose.yaw<=-8 and abs(pose.pitch)<=30
    if target=='TILT_UP': return pose.pitch<=-8 and abs(pose.yaw)<=25
    if target=='TILT_DOWN': return 18<=pose.pitch<=45 and abs(pose.yaw)<=25
    if target=='ROLL_RIGHT': return 10<=abs(pose.roll)<=30 and abs(pose.yaw)<=25
    return False

def decode_face_image(data):
    if not data or len(data)>10*1024*1024:
        raise HTTPException(413,'Upload a nonempty image under 10 MB.')
    image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(422,'Cannot decode image. Use JPEG or PNG.')
    try:
        pipeline=get_pipeline()
    except Exception as exc:
        raise HTTPException(503,'AI engine unavailable. Run python -m scripts.check_models.') from exc
    return image, pipeline


def check_image(data, target, embed=False):
    if target not in required_poses():
        raise HTTPException(422, 'Choose a configured enrollment pose.')
    image, pipeline = decode_face_image(data)
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


def matches_template(embedding, stored) -> bool:
    vector = np.asarray(stored, dtype=np.float32)
    if vector.shape != (512,) or not np.isfinite(vector).all():
        return False
    norm = np.linalg.norm(vector)
    return bool(norm > 0 and float(np.dot(embedding, vector / norm)) >= 0.58)

def check_face_matches(data, templates, names, *, photo=False):
    gallery = {}
    for student_id, stored in templates:
        vector = np.asarray(stored, dtype=np.float32)
        if vector.shape != (512,) or not np.isfinite(vector).all():
            continue
        norm = np.linalg.norm(vector)
        if norm > 0:
            gallery.setdefault(student_id, []).append(vector / norm)

    if photo:
        image = decode_photo(data)
        faces = recognize_photo(image, gallery)
    else:
        image, pipeline = decode_face_image(data)
        faces = []
        for face in pipeline.detector.detect(image):
            result = {"bbox": face.bbox.to_list()[:4], "bucket": "LOW_QUALITY", "similarity": 0.0, "quality_flags": []}
            quality = pipeline.quality_analyzer.analyze(image, face.bbox)
            if quality.is_valid:
                crop = pipeline.aligner.align(image, face.landmarks)
                embedding = pipeline.embedder.extract_from_crop(crop)
                norm = np.linalg.norm(embedding)
                scores = []
                if np.isfinite(norm) and norm > 0:
                    query = embedding / norm
                    scores = sorted(
                        ((sid, max(float(np.dot(query, v)) for v in vectors)) for sid, vectors in gallery.items()),
                        key=lambda item: (-item[1], item[0]),
                    )
                result["bucket"] = classify_scores(
                    scores, settings.FACE_RECOGNITION_THRESHOLD,
                    settings.UNCERTAIN_LOWER_THRESHOLD, settings.PHOTO_MARGIN,
                )
                if scores and result["bucket"] != "UNKNOWN":
                    result["student_id"], result["similarity"] = scores[0]
            faces.append(result)
        faces = assign_faces(faces)

    results = []
    for face in faces:
        status = face["bucket"]
        result = {"bbox": face["bbox"], "status": status}
        if status in {"VERIFIED", "NEEDS_REVIEW"} and face.get("student_id") in names:
            result["name"] = names[face["student_id"]]
            result["similarity"] = round(face["similarity"], 3)
        results.append(result)
    return {"faces": results, "width": image.shape[1], "height": image.shape[0]}


async def enrollment_status(db, student_id):
    if not await db.get(Student,student_id): raise HTTPException(404,'Student not found.')
    profiles=(await db.scalars(select(FaceProfile).where(FaceProfile.student_id==student_id))).all()
    poses=required_poses()
    completed=sorted({p.pose_type for p in profiles} & set(poses))
    return {'required_poses':poses,'completed_poses':completed,'hints':POSE_HINTS,'sample_count':len(completed),'complete':set(poses)<=set(completed)}

async def remove_face_data(db, student_id: str, admin_id: str):
    async with _enrollment_lock:
        student = await db.get(Student, student_id)
        if student is None:
            raise HTTPException(404, "Student not found.")
        removed = await db.execute(delete(FaceProfile).where(FaceProfile.student_id == student_id))
        cleared = await db.execute(
            update(StudentPortalRequest)
            .where(
                StudentPortalRequest.student_id == student_id,
                StudentPortalRequest.kind.in_(("FACE_REGISTER", "FACE_UPDATE")),
                StudentPortalRequest.status == "PENDING",
            )
            .values(
                status="REJECTED", pending_key=None, photo=None,
                review_note="Face data removed by an administrator.",
                reviewed_by=admin_id, reviewed_at=datetime.now(timezone.utc),
            )
        )
        student.enrollment_status = "NOT_ENROLLED"
        if removed.rowcount or cleared.rowcount:
            db.add(AuditLog(
                user_id=admin_id, action="DELETE_FACE_DATA", entity_type="Student",
                entity_id=student_id,
                old_values={"face_profiles": removed.rowcount, "pending_photos": cleared.rowcount},
                new_values={"enrollment_status": "NOT_ENROLLED"},
            ))
        await db.commit()
        await RecognitionService.sync_gallery_from_db(db)
    return await enrollment_status(db, student_id)

async def face_update_allowed(db, student_id: str, user_id: str) -> bool:
    return await db.scalar(select(StudentPortalRequest.id).where(
        StudentPortalRequest.student_id == student_id,
        StudentPortalRequest.requested_by == user_id,
        StudentPortalRequest.kind == "FACE_UPDATE",
        StudentPortalRequest.status == "APPROVED",
        StudentPortalRequest.reviewed_at >= datetime.now(timezone.utc) - timedelta(days=7),
    ).limit(1)) is not None


async def enroll(db, student_id, data, target, *, self_enrollment: bool = False, actor: User | None = None):
    student=await db.get(Student,student_id)
    if not student: raise HTTPException(404,'Student not found.')
    result,embedding=await asyncio.to_thread(check_image,data,target,True)
    if embedding is None:
        return {'success':False,'message':result['hint'],**result}
    async with _enrollment_lock:
        profiles=(await db.scalars(select(FaceProfile))).all()
        own_profiles = [profile for profile in profiles if profile.student_id == student_id]
        if self_enrollment and own_profiles and not any(
            matches_template(embedding, profile.embedding_data) for profile in own_profiles
        ):
            raise HTTPException(422, "This photo does not match the face already registered for your account.")
        for profile in profiles:
            if profile.student_id==student_id: continue
            vector=np.asarray(profile.embedding_data,dtype=np.float32)
            if vector.shape==(512,) and np.linalg.norm(vector)>0 and float(np.dot(embedding,vector/np.linalg.norm(vector)))>=0.80:
                raise HTTPException(409, "This face is already enrolled for another student. Ask an administrator to review the identity.")
        same=[p for p in profiles if p.student_id==student_id and p.pose_type==target]
        if self_enrollment and same and (actor is None or not await face_update_allowed(db, student_id, actor.id)):
            raise HTTPException(403, "Ask your administrator to approve replacing saved face photos.")
        profile=same[0] if same else FaceProfile(student_id=student_id,pose_type=target)
        profile.embedding_data=embedding.tolist()
        profile.image_hash=hashlib.sha256(data).hexdigest()
        profile.model_name='buffalo_l/ArcFace'
        profile.quality_score=min(1.0,result['blur']/120)
        db.add(profile)
        for duplicate in same[1:]: await db.delete(duplicate)
        completed={p.pose_type for p in profiles if p.student_id==student_id}|{target}
        student.enrollment_status='ENROLLED' if set(required_poses())<=completed else 'PARTIAL'
        if actor is not None:
            record_student_activity(db, actor, "UPDATE_FACE" if same else "REGISTER_FACE", "Student", student_id, metadata={"pose": target})
        await db.commit()
        await RecognitionService.sync_gallery_from_db(db)
    return {'success':True,'message':'Sample saved and recognition gallery updated.',**(await enrollment_status(db,student_id))}
