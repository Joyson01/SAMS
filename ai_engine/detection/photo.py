"""Photo-only detector; never mutates the live stream detector."""

from dataclasses import replace
from threading import Lock

import numpy as np

from ai_engine.base import BoundingBox


class PhotoDetector:
    def __init__(self, detector=None, tile_size=640, overlap=0.20, det_size=1280, min_face_size=35):
        if tile_size < 64 or not 0 <= overlap < 0.5:
            raise ValueError("Invalid photo tile configuration")
        if min_face_size < 16:
            raise ValueError("Minimum face size must be at least 16 pixels")
        self.min_face_size = min_face_size
        self.detector = detector
        self.tile_size = tile_size
        self.overlap = overlap
        self.det_size = det_size
        self.lock = Lock()

    def detect(self, image):
        from ai_engine.detection.scrfd import SCRFDFaceDetector, apply_face_nms

        with self.lock:
            if self.detector is None:
                self.detector = SCRFDFaceDetector(
                    det_size=(self.det_size, self.det_size), min_face_size=self.min_face_size
                )
            height, width = image.shape[:2]
            faces = list(self.detector.detect(image))
            if max(height, width) > self.tile_size:

                def origins(length):
                    end = max(0, length - self.tile_size)
                    step = max(1, int(self.tile_size * (1 - self.overlap)))
                    return sorted(set(range(0, end + 1, step)) | {end})

                for y in origins(height):
                    for x in origins(width):
                        crop = image[y : y + self.tile_size, x : x + self.tile_size]
                        for face in self.detector.detect(crop):
                            box = face.bbox
                            faces.append(
                                replace(
                                    face,
                                    bbox=BoundingBox(
                                        box.x1 + x,
                                        box.y1 + y,
                                        box.x2 + x,
                                        box.y2 + y,
                                        box.score,
                                    ),
                                    landmarks=face.landmarks + np.array([x, y]),
                                )
                            )
            return apply_face_nms(
                [f for f in faces if f.bbox.width >= self.min_face_size and f.bbox.height >= self.min_face_size]
            )
