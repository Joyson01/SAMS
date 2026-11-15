"""Read-only photo recognition and user/session-bound confirmation evidence."""

import asyncio
import base64
import hashlib
import io
from datetime import timedelta
from threading import Lock

import cv2
import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select

from ai_engine.recognition.photo_matcher import assign_faces, classify_scores
from backend.app.core.config import settings
from backend.app.core.security import _create_token, decode_access_token
from backend.app.models.entities import AttendanceSession, FaceProfile, Student

_detector = None
_engine_lock = Lock()


async def active_session(db, session_id):
    session = await db.get(AttendanceSession, session_id, populate_existing=True)
    if session is None:
        raise HTTPException(404, "Attendance session not found")
    if session.status != "ACTIVE":
        raise HTTPException(400, "Photo attendance requires an ACTIVE session")
    return session


async def eligible_photo_students(db, session):
    from backend.app.models.entities import Batch, ClassSection, TimetableEntry

    class_name = session.class_name
    if session.class_id:
        cls = await db.get(ClassSection, session.class_id)
        if cls is None or cls.name != class_name:
            raise HTTPException(400, "Session class configuration is inconsistent")
    batch_id = session.photo_batch_id
    if not session.photo_scope_initialized and session.timetable_entry_id:
        slot = await db.get(TimetableEntry, session.timetable_entry_id)
        if slot is None:
            raise HTTPException(400, "Session timetable entry is unavailable")
        slot_class = await db.get(ClassSection, slot.class_id)
        if slot_class is None or slot_class.name != class_name:
            raise HTTPException(400, "Timetable belongs to another class")
        batch_id = slot.batch_id
        if not batch_id and slot.batch and slot.batch.upper() != "ALL":
            batch_id = await db.scalar(
                select(Batch.id).where(
                    Batch.class_id == slot.class_id, Batch.name == slot.batch
                )
            )
            if not batch_id:
                raise HTTPException(400, "Assign the timetable lab batch first")
    query = select(Student).where(
        Student.class_name == class_name, Student.status == "ACTIVE"
    )
    if batch_id:
        batch = await db.get(Batch, batch_id)
        cls = await db.get(ClassSection, batch.class_id) if batch else None
        if cls is None or cls.name != class_name:
            raise HTTPException(400, "Session lab batch is unavailable or inconsistent")
        query = query.where(Student.batch_id == batch_id)
    return list((await db.scalars(query.order_by(Student.roll_number))).all())


async def snapshot_photo_scope(db, session):
    if session.photo_scope_initialized:
        return
    from backend.app.models.entities import Batch, ClassSection, TimetableEntry

    if session.timetable_entry_id:
        slot = await db.get(TimetableEntry, session.timetable_entry_id)
        if slot is None:
            raise HTTPException(400, "Session timetable entry unavailable")
        slot_class = await db.get(ClassSection, slot.class_id)
        if slot_class is None or slot_class.name != session.class_name:
            raise HTTPException(400, "Timetable belongs to another class")
        session.photo_batch_id = slot.batch_id
        if not session.photo_batch_id and slot.batch and slot.batch.upper() != "ALL":
            session.photo_batch_id = await db.scalar(
                select(Batch.id).where(
                    Batch.class_id == slot.class_id, Batch.name == slot.batch
                )
            )
            if not session.photo_batch_id:
                raise HTTPException(400, "Assign the timetable lab batch first")
    session.photo_scope_initialized = True
    await eligible_photo_students(db, session)


def decode_photo(data):
    if not data or len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "Choose a nonempty image up to 15 MB")
    try:
        with Image.open(io.BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as photo:
            if photo.width * photo.height > 24_000_000 or max(photo.size) > 8000:
                raise HTTPException(
                    413, "Use a photo up to 24 megapixels and 8000 pixels per side"
                )
            return np.ascontiguousarray(
                np.asarray(ImageOps.exif_transpose(photo).convert("RGB"))[:, :, ::-1]
            )
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(415, "Upload a valid JPEG, PNG or WebP image")


def valid_gallery(profiles):
    gallery = {}
    for profile in profiles:
        try:
            vector = np.asarray(profile.embedding_data, dtype=np.float32)
            norm = np.linalg.norm(vector)
        except (TypeError, ValueError):
            continue
        if vector.shape == (512,) and np.all(np.isfinite(vector)) and norm > 0:
            gallery.setdefault(profile.student_id, []).append(vector / norm)
    return gallery


def recognize_photo(image, gallery):
    global _detector
    from ai_engine.detection.photo import PhotoDetector
    from backend.app.services.recognition_service import get_pipeline

    with _engine_lock:
        if _detector is None:
            _detector = PhotoDetector(
                det_size=settings.PHOTO_DET_SIZE,
                tile_size=settings.PHOTO_TILE_SIZE,
                overlap=settings.PHOTO_TILE_OVERLAP,
            )
        pipeline = get_pipeline()
        results = []
        for face in _detector.detect(image):
            crop = pipeline.aligner.align(image, face.landmarks)
            embedding = pipeline.embedder.extract_from_crop(crop)
            norm = np.linalg.norm(embedding)
            scores = []
            if norm > 0 and np.all(np.isfinite(embedding)):
                query = embedding / norm
                scores = sorted(
                    [
                        (sid, max(float(np.dot(query, vector)) for vector in vectors))
                        for sid, vectors in gallery.items()
                    ],
                    key=lambda pair: pair[1],
                    reverse=True,
                )
            bucket = classify_scores(
                scores,
                settings.FACE_RECOGNITION_THRESHOLD,
                settings.UNCERTAIN_LOWER_THRESHOLD,
                settings.PHOTO_MARGIN,
            )
            flags = []
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            if float(gray.mean()) < 35:
                flags.append("too_dark")
            if float(cv2.Laplacian(gray, cv2.CV_64F).var()) < 20:
                flags.append("blurred")
            if flags and bucket == "VERIFIED":
                bucket = "NEEDS_REVIEW"
            results.append(
                {
                    "bbox": list(face.bbox.to_int_xyxy()),
                    "bucket": bucket,
                    "student_id": (
                        scores[0][0] if scores and bucket != "UNKNOWN" else None
                    ),
                    "similarity": scores[0][1] if scores else 0.0,
                    "candidates": [
                        {"student_id": sid, "score": score} for sid, score in scores[:3]
                    ],
                    "quality_flags": flags,
                }
            )
        return assign_faces(results)


async def build_preview(db, session_id, uploads, user):
    session = await active_session(db, session_id)
    students = await eligible_photo_students(db, session)
    ids = [student.id for student in students]
    profiles = (
        await db.scalars(select(FaceProfile).where(FaceProfile.student_id.in_(ids)))
    ).all()
    gallery = valid_gallery(profiles)
    images = []
    for index, data in enumerate(uploads):
        image = await asyncio.to_thread(decode_photo, data)
        faces = await asyncio.to_thread(recognize_photo, image, gallery)
        digest = hashlib.sha256(data).hexdigest()
        for face_index, face in enumerate(faces):
            face["face_ref"] = _create_token(
                {
                    "sub": user.id,
                    "session_id": session_id,
                    "image": digest,
                    "face": face_index,
                    "bucket": face["bucket"],
                    "student_id": face["student_id"],
                    "similarity": face["similarity"],
                },
                timedelta(minutes=15),
                "photo_evidence",
            )
            x1, y1, x2, y2 = face["bbox"]
            color = {
                "VERIFIED": (0, 190, 0),
                "NEEDS_REVIEW": (0, 180, 255),
                "UNKNOWN": (0, 0, 220),
            }[face["bucket"]]
            cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                image,
                str(face_index + 1),
                (x1, max(15, y1)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )
        ok, encoded = cv2.imencode(".jpg", image)
        if not ok:
            raise HTTPException(500, "Could not annotate photo")
        images.append(
            {
                "image_id": f"{index}-{digest[:12]}",
                "annotated_image": "data:image/jpeg;base64,"
                + base64.b64encode(encoded).decode(),
                "faces": faces,
            }
        )
    return {
        "session_id": session_id,
        "images": images,
        "students": [
            {
                "student_id": s.id,
                "name": f"{s.first_name} {s.last_name}",
                "roll_number": s.roll_number,
            }
            for s in students
            if s.id in gallery
        ],
    }


def validate_evidence(selections, session_id, user_id):
    accepted = {}
    seen_faces = set()
    seen_students = set()
    for item in selections:
        try:
            claims = decode_access_token(item.face_ref)
        except HTTPException:
            raise HTTPException(400, "Photo preview expired or invalid; preview again")
        if (
            claims.get("type") != "photo_evidence"
            or claims.get("sub") != user_id
            or claims.get("session_id") != session_id
            or claims.get("bucket") not in {"VERIFIED", "NEEDS_REVIEW"}
        ):
            raise HTTPException(400, "Invalid photo approval")
        if (
            claims["bucket"] == "VERIFIED"
            and claims.get("student_id") != item.student_id
        ):
            raise HTTPException(400, "Verified identity cannot be replaced")
        face_key = (claims["image"], claims["face"])
        student_key = (claims["image"], item.student_id)
        if face_key in seen_faces or student_key in seen_students:
            raise HTTPException(400, "Select each face and student only once per photo")
        seen_faces.add(face_key)
        seen_students.add(student_key)
        old = accepted.get(item.student_id)
        if old is None or claims["similarity"] > old["similarity"]:
            accepted[item.student_id] = claims
    return accepted


async def legacy_photo(db, session_id, data, filename, user):
    """Compatibility response for old clients, with verified-only safe writes."""
    from backend.app.api.v1.photo_attendance import PhotoSelection, staff
    from backend.app.models.entities import MediaProcessingJob
    from backend.app.schemas.media_attendance import MediaAnalysisResponse
    from backend.app.services.attendance_service import AttendanceService

    staff(user)
    preview = await build_preview(db, session_id, [data], user)
    faces = preview["images"][0]["faces"]
    selections = [
        PhotoSelection(student_id=f["student_id"], face_ref=f["face_ref"])
        for f in faces
        if f["bucket"] == "VERIFIED"
    ]
    result = {"marked": 0, "unchanged": 0, "records": []}
    if selections:
        result = await AttendanceService.confirm_photo_attendance(
            db, session_id, selections, user.id
        )
    students = {s["student_id"]: s for s in preview["students"]}
    records = {r["student_id"]: r["status"] for r in result["records"]}
    changed = {r["student_id"] for r in result["records"] if r.get("attendance_marked")}
    items = []
    for index, face in enumerate(faces):
        sid = face["student_id"]
        name = students.get(sid, {}).get("name", "Unknown")
        x1, y1, x2, y2 = face["bbox"]
        items.append(
            {
                "student_id": sid,
                "student_name": name,
                "name": name,
                "confidence": face["similarity"],
                "similarity": face["similarity"],
                "status": (
                    "recognized" if face["bucket"] == "VERIFIED" else face["bucket"]
                ),
                "attendance_status": records.get(sid),
                "attendance_marked": sid in changed and face["bucket"] == "VERIFIED",
                "already_present": sid in records and sid not in changed,
                "student_code": "",
                "roll_number": students.get(sid, {}).get("roll_number", ""),
                "confidence_pct": round(face["similarity"] * 100, 1),
                "bbox": {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "x": x1,
                    "y": y1,
                    "width": x2 - x1,
                    "height": y2 - y1,
                },
                "face_id": str(index),
                "bucket": face["bucket"],
            }
        )
    job = MediaProcessingJob(
        session_id=session_id,
        media_type="IMAGE",
        filename=filename,
        file_path="",
        status="COMPLETED",
        progress_pct=100,
        faces_detected_total=len(faces),
        recognized_count=len(selections),
        attendance_marked_count=result["marked"],
        created_by=user.id,
    )
    db.add(job)
    await db.commit()
    return MediaAnalysisResponse(
        job_id=job.id,
        session_id=session_id,
        filename=filename,
        faces_detected=len(faces),
        facesDetected=len(faces),
        recognized_count=len(selections),
        studentsRecognized=len(selections),
        unknown_count=sum(f["bucket"] == "UNKNOWN" for f in faces),
        uncertain_count=sum(f["bucket"] == "NEEDS_REVIEW" for f in faces),
        attendance_marked_count=result["marked"],
        attendanceMarked=result["marked"],
        duplicates_prevented=result["unchanged"],
        results=items,
        recognized_students=[item for item in items if item["bucket"] == "VERIFIED"],
        unresolved_faces=[
            {
                "face_id": item["face_id"],
                "status": item["bucket"],
                "decision": (
                    "UNCERTAIN" if item["bucket"] == "NEEDS_REVIEW" else "UNKNOWN"
                ),
            }
            for item in items
            if item["bucket"] != "VERIFIED"
        ],
        faces=[
            {
                "face_id": str(i),
                "bbox": f["bbox"],
                "student_id": f["student_id"],
                "status": f["bucket"],
                "recognition_confidence": f["similarity"],
            }
            for i, f in enumerate(faces)
        ],
        annotated_image_url=preview["images"][0]["annotated_image"],
        annotatedImagePath=preview["images"][0]["annotated_image"],
    )
