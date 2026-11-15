from typing import Optional
import math
import numpy as np
from ai_engine.base import PoseEstimate


class HeadPoseEstimator:
    """Estimates head pose (Yaw, Pitch, Roll) and occlusion from 5 fiducial landmarks."""

    def __init__(
        self,
        max_yaw: float = 55.0,
        max_pitch: float = 45.0,
        max_roll: float = 35.0,
    ):
        self.max_yaw = max_yaw
        self.max_pitch = max_pitch
        self.max_roll = max_roll

    def set_thresholds(
        self,
        max_yaw: Optional[float] = None,
        max_pitch: Optional[float] = None,
        max_roll: Optional[float] = None,
    ) -> None:
        """Dynamically update head pose angle limits."""
        if max_yaw is not None:
            self.max_yaw = max_yaw
        if max_pitch is not None:
            self.max_pitch = max_pitch
        if max_roll is not None:
            self.max_roll = max_roll

    def estimate(self, landmarks: np.ndarray) -> PoseEstimate:
        """Computes Euler head pose angles and classification from 5 landmarks.

        Landmarks order: [0: Left Eye, 1: Right Eye, 2: Nose, 3: Left Mouth, 4: Right Mouth]
        """
        if landmarks is None or len(landmarks) < 5:
            return PoseEstimate(
                yaw=0.0,
                pitch=0.0,
                roll=0.0,
                is_frontal=False,
                pose_type="UNKNOWN",
                occlusion_score=1.0,
            )

        le = landmarks[0]
        re = landmarks[1]
        nose = landmarks[2]
        lm = landmarks[3]
        rm = landmarks[4]

        # 1. Roll Angle (tilt in 2D image plane)
        delta_x = float(re[0] - le[0])
        delta_y = float(re[1] - le[1])
        roll = math.degrees(math.atan2(delta_y, delta_x))

        # 2. Inter-ocular distance
        eye_dist = math.hypot(delta_x, delta_y)
        if eye_dist < 1e-3:
            return PoseEstimate(0.0, 0.0, 0.0, False, "INVALID", 1.0)

        # 3. Yaw Angle (horizontal turn)
        # Distance from nose to left eye vs nose to right eye
        dist_l = math.hypot(nose[0] - le[0], nose[1] - le[1])
        dist_r = math.hypot(nose[0] - re[0], nose[1] - re[1])
        yaw_ratio = (dist_l - dist_r) / eye_dist
        yaw = float(np.clip(yaw_ratio * 75.0, -90.0, 90.0))

        # 4. Pitch Angle (vertical tilt)
        eye_mid_y = (le[1] + re[1]) / 2.0
        mouth_mid_y = (lm[1] + rm[1]) / 2.0
        vert_upper = nose[1] - eye_mid_y
        vert_lower = mouth_mid_y - nose[1]
        total_vert = max(1e-3, vert_upper + vert_lower)
        pitch_ratio = (vert_upper - vert_lower) / total_vert
        pitch = float(np.clip(pitch_ratio * 60.0, -90.0, 90.0))

        # 5. Occlusion / Landmark symmetry metric
        mouth_dist = math.hypot(rm[0] - lm[0], rm[1] - lm[1])
        mouth_eye_ratio = mouth_dist / eye_dist
        occlusion_score = 0.0
        if mouth_eye_ratio < 0.40 or mouth_eye_ratio > 1.30:
            occlusion_score = min(1.0, abs(mouth_eye_ratio - 0.75))

        # Determine Pose Classification
        is_frontal = (
            abs(yaw) <= self.max_yaw
            and abs(pitch) <= self.max_pitch
            and abs(roll) <= self.max_roll
        )

        if abs(yaw) <= 15.0 and abs(pitch) <= 15.0:
            pose_type = "FRONT"
        elif yaw < -15.0:
            pose_type = "LEFT_15" if yaw > -30.0 else "LEFT_SIDE"
        elif yaw > 15.0:
            pose_type = "RIGHT_15" if yaw < 30.0 else "RIGHT_SIDE"
        elif pitch < -15.0:
            pose_type = "TILT_UP"
        else:
            pose_type = "TILT_DOWN"

        return PoseEstimate(
            yaw=round(yaw, 1),
            pitch=round(pitch, 1),
            roll=round(roll, 1),
            is_frontal=is_frontal,
            pose_type=pose_type,
            occlusion_score=round(occlusion_score, 2),
        )

