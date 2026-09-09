from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import numpy as np


class DecisionState(str, Enum):
    KNOWN = "KNOWN"
    UNKNOWN = "UNKNOWN"
    UNCERTAIN = "UNCERTAIN"


@dataclass
class BoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    def to_list(self) -> List[float]:
        return [float(self.x1), float(self.y1), float(self.x2), float(self.y2), float(self.score)]

    def to_int_xyxy(self) -> Tuple[int, int, int, int]:
        return (int(round(self.x1)), int(round(self.y1)), int(round(self.x2)), int(round(self.y2)))


@dataclass
class DetectedFace:
    bbox: BoundingBox
    landmarks: np.ndarray  # Shape: (5, 2) [left_eye, right_eye, nose, left_mouth, right_mouth]
    det_score: float
    landmarks_3d: Optional[np.ndarray] = None


@dataclass
class QualityMetrics:
    sharpness: float       # Laplacian variance [0.0 - 1000.0+]
    brightness: float      # Mean pixel intensity [0.0 - 255.0]
    face_width: int        # Width in pixels
    face_height: int       # Height in pixels
    is_valid: bool         # Passes minimum quality thresholds
    rejection_reason: Optional[str] = None


@dataclass
class PoseEstimate:
    yaw: float             # In degrees (-90 to +90)
    pitch: float           # In degrees (-90 to +90)
    roll: float            # In degrees (-180 to +180)
    is_frontal: bool       # Within acceptable angle bounds
    pose_type: str         # 'FRONT', 'LEFT_15', 'RIGHT_15', 'TILT_UP', 'TILT_DOWN'
    occlusion_score: float # 0.0 (unoccluded) to 1.0 (occluded)


@dataclass
class MatchCandidate:
    student_id: str
    student_code: str
    roll_number: str
    name: str
    similarity: float      # Cosine similarity in range [-1.0, 1.0]
    confidence_pct: float  # Normalized confidence percentage (0 - 100%)


@dataclass
class RecognitionResult:
    face_idx: int
    bbox: BoundingBox
    landmarks: np.ndarray
    decision: DecisionState
    best_match: Optional[MatchCandidate]
    top_candidates: List[MatchCandidate] = field(default_factory=list)
    quality: Optional[QualityMetrics] = None
    pose: Optional[PoseEstimate] = None
    embedding: Optional[np.ndarray] = None
    is_live: bool = True
    liveness_score: float = 1.0
    decision_reason: str = ""
    track_id: Optional[int] = None
    status: Optional[str] = None
    provisional_name: Optional[str] = None
    frames_needed: int = 0
    confidence_history: List[float] = field(default_factory=list)

