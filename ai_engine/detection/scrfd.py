import os
from pathlib import Path
from typing import List, Optional, Tuple
import cv2
import numpy as np
from insightface.app import FaceAnalysis

from ai_engine.base import BoundingBox, DetectedFace


class SCRFDFaceDetector:
    """High performance SCRFD face detector using ONNX Runtime with CPU/GPU provider support."""

    def __init__(
        self,
        model_name: str = "buffalo_l",
        root_dir: Optional[str] = None,
        det_size: Tuple[int, int] = (640, 640),
        det_thresh: float = 0.50,
        nms_thresh: float = 0.40,
        ctx_id: int = -1,  # -1 for CPU, 0+ for GPU
    ):
        self.model_name = model_name
        self.det_size = det_size
        self.det_thresh = det_thresh
        self.nms_thresh = nms_thresh
        self.ctx_id = ctx_id

        # Locate InsightFace root
        if root_dir is None:
            root_dir = os.path.expanduser("~/.insightface")
        self.root_dir = root_dir
        self._app: Optional[FaceAnalysis] = None
        self._initialize_detector()

    def set_thresholds(
        self,
        det_thresh: Optional[float] = None,
        nms_thresh: Optional[float] = None,
        det_size: Optional[Tuple[int, int]] = None,
    ) -> None:
        """Dynamically update face detection parameters."""
        if det_thresh is not None:
            self.det_thresh = det_thresh
        if nms_thresh is not None:
            self.nms_thresh = nms_thresh
        if det_size is not None:
            self.det_size = det_size
        if self._app is not None and (det_thresh is not None or det_size is not None):
            self._app.prepare(ctx_id=self.ctx_id, det_size=self.det_size, det_thresh=self.det_thresh)

    def _initialize_detector(self) -> None:
        """Loads and prepares the detector network."""
        providers = ["CPUExecutionProvider"] if self.ctx_id < 0 else ["CUDAExecutionProvider", "CPUExecutionProvider"]

        self._app = FaceAnalysis(
            name=self.model_name,
            root=self.root_dir,
            providers=providers,
            allowed_modules=["detection"],
        )
        self._app.prepare(ctx_id=self.ctx_id, det_size=self.det_size, det_thresh=self.det_thresh)

    def detect(self, image: np.ndarray) -> List[DetectedFace]:
        """Detects faces in BGR image and extracts bounding boxes & fiducial landmarks.

        Args:
            image: np.ndarray (H, W, 3) in BGR format

        Returns:
            List[DetectedFace]: List of detected faces sorted by bounding box area (largest first)
        """
        if image is None or image.size == 0:
            return []

        assert self._app is not None
        raw_faces = self._app.get(image)

        detected: List[DetectedFace] = []
        for face in raw_faces:
            bbox_raw = face.bbox
            score = float(getattr(face, "det_score", 1.0))
            if score < self.det_thresh:
                continue

            bbox = BoundingBox(
                x1=float(bbox_raw[0]),
                y1=float(bbox_raw[1]),
                x2=float(bbox_raw[2]),
                y2=float(bbox_raw[3]),
                score=score,
            )

            # Extract 5 landmarks (left eye, right eye, nose, left mouth, right mouth)
            kps = np.asarray(face.kps, dtype=np.float32)
            if kps.shape != (5, 2):
                continue

            landmarks_3d = getattr(face, "landmark_3d_68", None)
            if landmarks_3d is not None:
                landmarks_3d = np.asarray(landmarks_3d, dtype=np.float32)

            detected.append(
                DetectedFace(
                    bbox=bbox,
                    landmarks=kps,
                    det_score=score,
                    landmarks_3d=landmarks_3d,
                )
            )

        # Sort by face area (descending)
        detected.sort(key=lambda d: d.bbox.area, reverse=True)
        return detected

