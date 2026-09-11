import os
from pathlib import Path
from typing import List, Optional, Tuple, Union
import cv2
import numpy as np
import onnxruntime as ort

from ai_engine.alignment.face_aligner import FaceAligner


def l2_normalize(vector: np.ndarray, eps: float = 1e-10) -> np.ndarray:
    """Normalizes a float32 vector to unit L2 length."""
    v = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = np.linalg.norm(v)
    if norm < eps or not np.all(np.isfinite(v)):
        return np.zeros_like(v)
    return v / norm


def compute_cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculates cosine similarity between two unit-normalized vectors (dot product)."""
    u = l2_normalize(vec1)
    v = l2_normalize(vec2)
    return float(np.dot(u, v))


class ArcFaceEmbeddingModel:
    """ArcFace ResNet-50 512-dimensional face recognition embedding extractor."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        ctx_id: int = -1,
    ):
        if model_path is None:
            default_path = os.path.expanduser("~/.insightface/models/buffalo_l/w600k_r50.onnx")
            if os.path.exists(default_path):
                model_path = default_path
            else:
                raise FileNotFoundError(f"ArcFace model not found at {default_path}")

        self.model_path = model_path
        self.ctx_id = ctx_id
        self.aligner = FaceAligner(crop_size=112)
        self.session: Optional[ort.InferenceSession] = None
        self._init_session()

    def _init_session(self) -> None:
        """Initializes ONNX Runtime inference session."""
        providers = ["CPUExecutionProvider"] if self.ctx_id < 0 else ["CUDAExecutionProvider", "CPUExecutionProvider"]
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        onnx_threads = int(os.environ.get("ONNX_THREADS", "4"))
        opts.intra_op_num_threads = max(1, onnx_threads)

        self.session = ort.InferenceSession(self.model_path, sess_options=opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def preprocess(self, aligned_bgr_crop: np.ndarray) -> np.ndarray:
        """Preprocesses 112x112 BGR face crop for ArcFace input."""
        if aligned_bgr_crop.shape != (112, 112, 3):
            aligned_bgr_crop = cv2.resize(aligned_bgr_crop, (112, 112))

        # Convert BGR -> RGB (ArcFace expected color space)
        rgb = cv2.cvtColor(aligned_bgr_crop, cv2.COLOR_BGR2RGB)
        # Normalize into [-1.0, 1.0]: (x - 127.5) / 127.5
        normalized = (rgb.astype(np.float32) - 127.5) / 127.5
        # Transpose HWC -> CHW -> NCHW (1, 3, 112, 112)
        blob = np.transpose(normalized, (2, 0, 1))
        blob = np.expand_dims(blob, axis=0).astype(np.float32)
        return blob

    def extract_from_crop(self, aligned_bgr_crop: np.ndarray) -> np.ndarray:
        """Extracts 512-d unit-normalized embedding from an aligned 112x112 face crop."""
        assert self.session is not None
        blob = self.preprocess(aligned_bgr_crop)
        raw_output = self.session.run([self.output_name], {self.input_name: blob})[0]
        embedding = raw_output.reshape(-1)
        return l2_normalize(embedding)

    def extract_from_image(self, image: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
        """Aligns face using 5 landmarks and extracts 512-d unit-normalized embedding."""
        aligned_crop = self.aligner.align(image, landmarks)
        return self.extract_from_crop(aligned_crop)

    def extract_batch(self, aligned_crops: List[np.ndarray]) -> np.ndarray:
        """Batch extraction of 512-d embeddings."""
        if not aligned_crops:
            return np.empty((0, 512), dtype=np.float32)

        blobs = [self.preprocess(crop)[0] for crop in aligned_crops]
        batch_blob = np.stack(blobs, axis=0).astype(np.float32)

        assert self.session is not None
        raw_output = self.session.run([self.output_name], {self.input_name: batch_blob})[0]

        norms = np.linalg.norm(raw_output, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-10)
        return (raw_output / norms).astype(np.float32)

