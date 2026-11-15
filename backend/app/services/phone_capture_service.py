"""Small, deterministic helpers for the transient phone-capture workflow."""

from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

import numpy as np


@dataclass(frozen=True)
class CaptureQuality:
    code: str
    message: str


def normalize_embedding(values: Sequence[float], expected_size: int = 512) -> Optional[np.ndarray]:
    if len(values) != expected_size:
        return None
    vector = np.asarray(values, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if not np.all(np.isfinite(vector)) or not np.isfinite(norm) or norm <= 0:
        return None
    return vector / norm


def assess_capture(frame: np.ndarray, detections: Sequence[dict]) -> CaptureQuality:
    gray = frame.astype(np.float32).mean(axis=2) if frame.ndim == 3 else frame.astype(np.float32)
    if float(gray.mean()) < 42:
        return CaptureQuality("TOO_DARK", "The image is too dark. Face the light and try again.")
    edge_energy = float(np.var(np.diff(gray, axis=0))) + float(np.var(np.diff(gray, axis=1)))
    if edge_energy < 24:
        return CaptureQuality("BLURRY", "The image is blurry. Hold the phone steady and try again.")
    if detections and all(not face.get("is_quality_valid", True) for face in detections):
        reasons = " ".join(str(face.get("quality_reason", "")) for face in detections).lower()
        if "small" in reasons:
            return CaptureQuality("FACE_TOO_SMALL", "Faces are too small. Move closer and try again.")
        return CaptureQuality("LOW_QUALITY", "Faces are unclear. Improve the light and hold the phone steady.")
    if not detections:
        return CaptureQuality("NO_FACE", "No faces found. Aim at the class and try again.")
    return CaptureQuality("USABLE", "Capture is usable.")


def select_candidates(
    detections: Iterable[dict], threshold: float, ambiguity_margin: float = 0.04,
) -> tuple[list[str], list[str]]:
    accepted: list[str] = []
    review: list[str] = []
    for face in detections:
        student_id = face.get("student_id")
        similarity = float(face.get("similarity", 0))
        second = float(face.get("second_similarity", -1))
        if not student_id or not face.get("is_recognized") or similarity < threshold:
            continue
        if second >= 0 and similarity - second < ambiguity_margin:
            review.append(student_id)
        elif student_id not in accepted:
            accepted.append(student_id)
    return accepted, review



