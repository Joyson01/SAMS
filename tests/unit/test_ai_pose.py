import numpy as np
import pytest

from ai_engine.quality.pose_estimator import HeadPoseEstimator


def test_pose_estimator_frontal():
    estimator = HeadPoseEstimator()
    # Symmetrical frontal landmarks
    landmarks = np.array(
        [
            [35.0, 40.0],  # Left eye
            [65.0, 40.0],  # Right eye
            [50.0, 55.0],  # Nose (centered)
            [38.0, 75.0],  # Left mouth
            [62.0, 75.0],  # Right mouth
        ],
        dtype=np.float32,
    )
    pose = estimator.estimate(landmarks)
    assert pose.is_frontal is True
    assert pose.pose_type == "FRONT"
    assert abs(pose.yaw) <= 12.0
    assert abs(pose.roll) <= 5.0


def test_pose_estimator_yaw_left():
    estimator = HeadPoseEstimator()
    # Nose shifted towards left eye (head turned right/left)
    landmarks = np.array(
        [
            [35.0, 40.0],
            [65.0, 40.0],
            [40.0, 55.0],  # Nose shifted left
            [36.0, 75.0],
            [60.0, 75.0],
        ],
        dtype=np.float32,
    )
    pose = estimator.estimate(landmarks)
    assert pose.yaw < -10.0


def test_pose_estimator_tilted_roll():
    estimator = HeadPoseEstimator()
    # Eyes slanted (Roll angle)
    landmarks = np.array(
        [
            [35.0, 30.0],  # Left eye high
            [65.0, 50.0],  # Right eye low
            [50.0, 60.0],
            [40.0, 75.0],
            [65.0, 85.0],
        ],
        dtype=np.float32,
    )
    pose = estimator.estimate(landmarks)
    assert abs(pose.roll) > 15.0

