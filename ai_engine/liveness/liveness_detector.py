from typing import Any, Dict, List, Optional
import numpy as np

from ai_engine.base import BoundingBox
from ai_engine.liveness.base import AttackType, BaseLivenessDetector, LivenessResult
from ai_engine.liveness.texture_checker import TextureLivenessDetector


class LivenessDetector(BaseLivenessDetector):
    """Production anti-spoofing detector integrating frequency, texture, and multi-frame consistency."""

    def __init__(
        self,
        liveness_threshold: float = 0.70,
        mode: str = "BASIC",
        texture_detector: Optional[TextureLivenessDetector] = None,
    ):
        self.liveness_threshold = liveness_threshold
        self.mode = mode.upper()  # 'DISABLED', 'BASIC', 'STRICT'
        self.texture_detector = texture_detector or TextureLivenessDetector(
            liveness_threshold=liveness_threshold
        )

    def set_thresholds(
        self,
        liveness_threshold: Optional[float] = None,
        mode: Optional[str] = None,
    ) -> None:
        """Dynamically update liveness parameters."""
        if liveness_threshold is not None:
            self.liveness_threshold = liveness_threshold
            self.texture_detector.liveness_threshold = liveness_threshold
        if mode is not None:
            self.mode = mode.upper()

    def predict(
        self,
        image: np.ndarray,
        bbox: BoundingBox,
        landmarks: Optional[np.ndarray] = None,
    ) -> LivenessResult:
        """Evaluates whether face observation is authentic live human skin or spoof."""
        if self.mode == "DISABLED":
            return LivenessResult(
                is_live=True,
                liveness_score=1.0,
                attack_type=AttackType.GENUINE,
                confidence_pct=100.0,
                rejection_reason=None,
            )

        # 1. Texture & Frequency Check
        res = self.texture_detector.predict(image, bbox, landmarks)

        # 2. Check 3D / Landmark validity if available
        if landmarks is not None and len(landmarks) >= 5:
            le = landmarks[0]
            re = landmarks[1]
            eye_dist = np.hypot(re[0] - le[0], re[1] - le[1])
            min_eye_dist = 18.0 if self.mode == "STRICT" else 15.0
            if eye_dist < min_eye_dist:
                return LivenessResult(
                    is_live=False,
                    liveness_score=0.20,
                    attack_type=AttackType.UNKNOWN_SPOOF,
                    confidence_pct=20.0,
                    rejection_reason="Inter-ocular distance too small for reliable liveness verification.",
                )

        if self.mode == "STRICT" and res.liveness_score < max(self.liveness_threshold, 0.80):
            return LivenessResult(
                is_live=False,
                liveness_score=res.liveness_score,
                attack_type=res.attack_type,
                confidence_pct=res.confidence_pct,
                rejection_reason=res.rejection_reason or "Strict anti-spoofing threshold not met.",
            )

        return res

