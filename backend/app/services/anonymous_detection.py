"""Anonymous face locations only: no gallery, embeddings, or persistence."""

import io
from threading import Lock
from time import perf_counter

import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from ai_engine.detection.photo import PhotoDetector

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
_detector = None
_lock = Lock()


def analyze_photo(data: bytes) -> dict:
    started = perf_counter()
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, 'Choose a nonempty image up to 15 MB')
    try:
        with Image.open(io.BytesIO(data), formats=['JPEG', 'PNG', 'WEBP']) as photo:
            if getattr(photo, 'is_animated', False):
                raise HTTPException(415, 'Choose a still photo; animated images are not supported')
            if photo.width * photo.height > 24_000_000 or max(photo.size) > 8000:
                raise HTTPException(413, 'Use a photo up to 24 megapixels and 8000 pixels per side')
            image = np.ascontiguousarray(np.asarray(ImageOps.exif_transpose(photo).convert('RGB'))[:, :, ::-1])
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(415, 'Upload a valid JPEG, PNG or WebP image')

    global _detector
    with _lock:
        if _detector is None:
            # Separate instance: this floor never changes recognition behavior.
            _detector = PhotoDetector(min_face_size=16)
        detected = _detector.detect(image)

    faces = []
    for face in detected:
        box = face.bbox
        faces.append({
            'bbox': [float(box.x1), float(box.y1), float(box.x2), float(box.y2)],
            'detection_score': float(face.det_score),
            'small_face': min(box.width, box.height) < 35,
        })
    return {
        'mode': 'anonymous',
        'frame_width': image.shape[1],
        'frame_height': image.shape[0],
        'face_count': len(faces),
        'latency_ms': round((perf_counter() - started) * 1000, 1),
        'faces': faces,
    }
