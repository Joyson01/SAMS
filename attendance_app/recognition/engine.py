import numpy as np
from .types import DetectedFace

class InsightFaceEngine:
    def __init__(self): self._app = None
    def analyze(self, image_bytes: bytes) -> list[DetectedFace]:
        import cv2
        try:
            from insightface.app import FaceAnalysis
        except ImportError as exc:
            raise RuntimeError("Install AI support with: uv sync --extra ai") from exc
        if self._app is None:
            self._app=FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"]); self._app.prepare(ctx_id=-1, det_size=(640,640))
        image=cv2.imdecode(np.frombuffer(image_bytes,np.uint8),cv2.IMREAD_COLOR)
        if image is None: raise ValueError("Invalid image")
        return [DetectedFace(tuple(map(int,f.bbox)), np.asarray(f.normed_embedding,dtype=np.float32), float(f.det_score)) for f in self._app.get(image)]
