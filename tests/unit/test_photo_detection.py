import numpy as np
from ai_engine.base import BoundingBox, DetectedFace


def test_tiles_translate_and_merge():
    from ai_engine.detection.photo import PhotoDetector

    class Detector:
        def detect(self, image):
            return [
                DetectedFace(
                    BoundingBox(10, 10, 50, 50, 0.9), np.ones((5, 2)) * 20, 0.9
                )
            ]

    faces = PhotoDetector(Detector(), tile_size=640, overlap=0.2).detect(
        np.zeros((640, 1152, 3), dtype=np.uint8)
    )
    assert len(faces) == 2
    assert faces[1].bbox.x1 == 522
    assert faces[1].landmarks[0, 0] == 532


def test_small_faces_excluded():
    from ai_engine.detection.photo import PhotoDetector

    class Detector:
        def detect(self, image):
            return [DetectedFace(BoundingBox(0, 0, 34, 50, 0.9), np.zeros((5, 2)), 0.9)]

    assert PhotoDetector(Detector()).detect(np.zeros((100, 100, 3))) == []


def test_small_face_probe_preserves_source_dimensions():
    from ai_engine.detection.photo import PhotoDetector

    class Detector:
        def detect(self, image):
            return [DetectedFace(BoundingBox(0, 0, 26, 32, 0.9), np.zeros((5, 2)), 0.9)]

    faces = PhotoDetector(Detector(), min_face_size=24).detect(np.zeros((100, 100, 3)))
    assert len(faces) == 1
    assert faces[0].bbox.width == 26


def test_small_face_identity_requires_review(monkeypatch):
    from types import SimpleNamespace
    from backend.app.services import photo_attendance_service as service
    from backend.app.services import recognition_service

    vector = np.zeros(512, dtype=np.float32)
    vector[0] = 1
    face = DetectedFace(BoundingBox(0, 0, 26, 32, .99), np.zeros((5, 2)), .99)
    crop = np.random.default_rng(7).integers(60, 220, (112, 112, 3), dtype=np.uint8)
    pipeline = SimpleNamespace(
        aligner=SimpleNamespace(align=lambda image, landmarks: crop),
        embedder=SimpleNamespace(extract_from_crop=lambda image: vector),
    )
    monkeypatch.setattr(service, '_detector', SimpleNamespace(detect=lambda image: [face]))
    monkeypatch.setattr(recognition_service, 'get_pipeline', lambda: pipeline)
    result = service.recognize_photo(crop, {'student': [vector]})[0]
    assert result['similarity'] == 1
    assert result['bucket'] == 'NEEDS_REVIEW'
    assert 'small_face' in result['quality_flags']
