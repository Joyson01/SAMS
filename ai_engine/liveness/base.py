from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional
import numpy as np

from ai_engine.base import BoundingBox


class AttackType(str, Enum):
    GENUINE = "GENUINE"
    PRINT_PHOTO_2D = "PRINT_PHOTO_2D"
    SCREEN_REPLAY_2D = "SCREEN_REPLAY_2D"
    RIGID_CUTOUT = "RIGID_CUTOUT"
    UNKNOWN_SPOOF = "UNKNOWN_SPOOF"


@dataclass
class LivenessResult:
    is_live: bool
    liveness_score: float  # In range [0.0, 1.0]
    attack_type: AttackType
    confidence_pct: float  # 0.0 - 100.0%
    details: Dict[str, Any] = field(default_factory=dict)
    rejection_reason: Optional[str] = None


class BaseLivenessDetector(ABC):
    """Abstract interface for all anti-spoofing and liveness detectors."""

    @abstractmethod
    def predict(
        self,
        image: np.ndarray,
        bbox: BoundingBox,
        landmarks: Optional[np.ndarray] = None,
    ) -> LivenessResult:
        """Evaluates whether the given face region is a live human or a presentation attack."""
        pass

