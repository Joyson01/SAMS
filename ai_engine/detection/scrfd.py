import logging
import os
from pathlib import Path
from typing import List, Optional, Tuple
import cv2
import numpy as np
from insightface.app import FaceAnalysis

from ai_engine.base import BoundingBox, DetectedFace

logger = logging.getLogger(__name__)


def apply_face_nms(faces: List[DetectedFace], iou_thresh: float = 0.40) -> List[DetectedFace]:
    """Applies Non-Maximum Suppression on a list of DetectedFace objects.
    
    Sorts by detection confidence score (highest first) and suppresses overlapping
    detections representing the same face (IoU >= iou_thresh).
    Legitimate separate faces (different people) with low overlap are preserved.
    """
    if len(faces) <= 1:
        return faces

    # Sort descending by confidence score
    faces_sorted = sorted(faces, key=lambda f: f.det_score, reverse=True)
    keep: List[DetectedFace] = []

    while faces_sorted:
        best = faces_sorted.pop(0)
        keep.append(best)
        remaining: List[DetectedFace] = []
        for f in faces_sorted:
            iou = best.bbox.iou(f.bbox)
            if iou < iou_thresh:
                remaining.append(f)
        faces_sorted = remaining

    return keep


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
        min_face_size: float = 16.0,
    ):
        self.model_name = model_name
        self.det_size = det_size
        self.det_thresh = det_thresh
        self.nms_thresh = nms_thresh
        self.ctx_id = ctx_id
        self.min_face_size = min_face_size
        self.last_raw_count: int = 0
        self.last_nms_count: int = 0

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
        if self._app is not None and "detection" in self._app.models and nms_thresh is not None:
            det_model = self._app.models["detection"]
            if hasattr(det_model, "nms_thresh"):
                det_model.nms_thresh = self.nms_thresh

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

        # Ensure underlying SCRFD ONNX model uses configured nms_thresh
        if "detection" in self._app.models:
            det_model = self._app.models["detection"]
            if hasattr(det_model, "nms_thresh"):
                det_model.nms_thresh = self.nms_thresh

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
        img_h, img_w = image.shape[:2]
        raw_faces = self._app.get(image)
        raw_count = len(raw_faces)

        candidates: List[DetectedFace] = []
        for face in raw_faces:
            bbox_raw = face.bbox
            score = float(getattr(face, "det_score", 1.0))
            if score < self.det_thresh:
                continue

            # Clip box coordinates strictly to frame boundaries
            x1 = max(0.0, min(float(img_w), float(bbox_raw[0])))
            y1 = max(0.0, min(float(img_h), float(bbox_raw[1])))
            x2 = max(0.0, min(float(img_w), float(bbox_raw[2])))
            y2 = max(0.0, min(float(img_h), float(bbox_raw[3])))

            # Sanity check: valid positive area and minimum face dimension
            box_w = x2 - x1
            box_h = y2 - y1
            if box_w < self.min_face_size or box_h < self.min_face_size:
                continue
            if x2 <= x1 or y2 <= y1:
                continue

            # Aspect ratio check: faces are roughly 0.25 <= w/h <= 4.0
            aspect_ratio = box_w / max(1e-3, box_h)
            if aspect_ratio < 0.25 or aspect_ratio > 4.0:
                continue

            bbox = BoundingBox(
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                score=score,
            )

            # Extract 5 landmarks (left eye, right eye, nose, left mouth, right mouth)
            kps = np.asarray(face.kps, dtype=np.float32)
            if kps.shape != (5, 2):
                continue

            # Clip landmarks to frame
            kps[:, 0] = np.clip(kps[:, 0], 0.0, float(img_w))
            kps[:, 1] = np.clip(kps[:, 1], 0.0, float(img_h))

            landmarks_3d = getattr(face, "landmark_3d_68", None)
            if landmarks_3d is not None:
                landmarks_3d = np.asarray(landmarks_3d, dtype=np.float32)

            candidates.append(
                DetectedFace(
                    bbox=bbox,
                    landmarks=kps,
                    det_score=score,
                    landmarks_3d=landmarks_3d,
                )
            )

        # Apply secondary IoU-based NMS to suppress overlapping duplicate detections
        detected = apply_face_nms(candidates, iou_thresh=self.nms_thresh)

        self.last_raw_count = raw_count
        self.last_nms_count = len(detected)

        if logger.isEnabledFor(logging.DEBUG) and raw_count > 0:
            logger.debug(
                f"[SCRFD DIAGNOSTIC] raw_detections={raw_count}, "
                f"after_conf_sanity={len(candidates)}, after_nms={len(detected)}"
            )

        # Sort by face area (descending)
        detected.sort(key=lambda d: d.bbox.area, reverse=True)
        return detected


