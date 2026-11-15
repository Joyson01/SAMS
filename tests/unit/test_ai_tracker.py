import numpy as np
import pytest

from ai_engine.base import BoundingBox, DetectedFace
from ai_engine.tracking.byte_tracker import ByteFaceTracker, calculate_iou_matrix
from ai_engine.tracking.kalman_filter import KalmanBoxTracker


def test_kalman_box_tracker_lifecycle():
    initial_bbox = np.array([100.0, 100.0, 200.0, 200.0], dtype=np.float32)
    tracker = KalmanBoxTracker(initial_bbox)

    assert tracker.hits == 1
    assert tracker.time_since_update == 0

    # Predict motion
    pred_box = tracker.predict()
    assert len(pred_box) == 4
    assert tracker.time_since_update == 1

    # Update with measurement moving slightly right (velocity dx > 0)
    measured_box = np.array([105.0, 100.0, 205.0, 200.0], dtype=np.float32)
    tracker.update(measured_box)
    assert tracker.hits == 2
    assert tracker.time_since_update == 0

    # Next prediction should incorporate positive dx velocity
    next_pred = tracker.predict()
    assert next_pred[0] >= 104.0  # Center moved to the right


def test_iou_matrix_calculation():
    boxes_a = np.array([[0, 0, 10, 10], [20, 20, 30, 30]], dtype=np.float32)
    boxes_b = np.array([[0, 0, 10, 10], [5, 5, 15, 15]], dtype=np.float32)

    iou = calculate_iou_matrix(boxes_a, boxes_b)
    assert iou.shape == (2, 2)
    assert np.isclose(iou[0, 0], 1.0)  # exact match
    assert iou[0, 1] > 0.10             # partial overlap
    assert np.isclose(iou[1, 0], 0.0)  # zero overlap


def test_byte_face_tracker_maintains_persistent_track_id():
    tracker = ByteFaceTracker(min_hits=2, max_lost_frames=5, iou_threshold=0.30)
    dummy_kps = np.array([[10, 10], [20, 10], [15, 15], [12, 20], [18, 20]], dtype=np.float32)

    # Frame 1: Single face detection at [50, 50, 100, 100]
    face1 = DetectedFace(BoundingBox(50, 50, 100, 100, 0.95), dummy_kps, 0.95)
    tracks_f1 = tracker.update([face1])
    assert len(tracks_f1) == 1
    t1_id = tracks_f1[0].track_id

    # Frame 2: Same face moved slightly to [53, 52, 103, 102]
    face2 = DetectedFace(BoundingBox(53, 52, 103, 102, 0.94), dummy_kps, 0.94)
    tracks_f2 = tracker.update([face2])
    assert len(tracks_f2) == 1
    assert tracks_f2[0].track_id == t1_id  # Track ID MUST remain identical!
    assert tracks_f2[0].state == "CONFIRMED"


def test_byte_face_tracker_two_independent_faces():
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=5)
    dummy_kps = np.array([[10, 10], [20, 10], [15, 15], [12, 20], [18, 20]], dtype=np.float32)

    face_left = DetectedFace(BoundingBox(20, 20, 60, 60, 0.95), dummy_kps, 0.95)
    face_right = DetectedFace(BoundingBox(200, 20, 240, 60, 0.95), dummy_kps, 0.95)

    tracks = tracker.update([face_left, face_right])
    assert len(tracks) == 2
    assert tracks[0].track_id != tracks[1].track_id

