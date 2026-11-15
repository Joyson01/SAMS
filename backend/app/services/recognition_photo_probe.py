"""Read-only classroom photo probe using the existing tiled photo pipeline."""
import asyncio
import time
from sqlalchemy import select
from backend.app.core.config import settings
from backend.app.models.entities import FaceProfile, Student
from backend.app.services.photo_attendance_service import decode_photo, recognize_photo, valid_gallery


async def analyze_photo(db, data):
    started = time.perf_counter()
    image = await asyncio.to_thread(decode_photo, data)
    students = (await db.scalars(select(Student).where(Student.status == 'ACTIVE'))).all()
    identities = {student.id: student for student in students}
    profiles = (await db.scalars(select(FaceProfile).join(Student).where(Student.status == 'ACTIVE'))).all()
    gallery = valid_gallery(profiles)
    results = await asyncio.to_thread(recognize_photo, image, gallery)
    faces = []
    for result in results:
        candidates = []
        for candidate in result['candidates']:
            student = identities[candidate['student_id']]
            candidates.append({'student_id': student.id, 'name': f'{student.first_name} {student.last_name}',
                               'roll_number': student.roll_number, 'similarity': candidate['score']})
        faces.append({**result, 'bucket': 'CANDIDATE' if result['bucket'] == 'NEEDS_REVIEW' else result['bucket'],
                      'best_match': candidates[0] if candidates and result['student_id'] else None,
                      'top_candidates': candidates})
    return {'faces': faces, 'face_count': len(faces), 'frame_width': image.shape[1], 'frame_height': image.shape[0],
            'latency_ms': round((time.perf_counter() - started) * 1000, 2), 'gallery_size': len(gallery),
            'development': False, 'mode': 'photo',
            'thresholds': {'known_threshold': settings.FACE_RECOGNITION_THRESHOLD,
                           'uncertain_threshold': settings.UNCERTAIN_LOWER_THRESHOLD, 'margin_threshold': settings.PHOTO_MARGIN}}
