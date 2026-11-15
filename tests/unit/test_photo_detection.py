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
