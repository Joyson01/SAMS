import numpy as np
import pytest

from ai_engine.base import BoundingBox, DetectedFace
from ai_engine.detection.scrfd import apply_face_nms
from ai_engine.tracking.byte_tracker import ByteFaceTracker


def _make_face(x1: float, y1: float, x2: float, y2: float, score: float = 0.90) -> DetectedFace:
    dummy_kps = np.array([[x1, y1], [x2, y1], [(x1 + x2) / 2, (y1 + y2) / 2], [x1, y2], [x2, y2]], dtype=np.float32)
    return DetectedFace(BoundingBox(x1, y1, x2, y2, score), dummy_kps, score)


def test_apply_face_nms_suppresses_duplicate_bounding_boxes():
    """Verify that multiple overlapping candidate boxes around the same face are suppressed down to 1."""
    # Person 1 with 3 duplicate/jittered detections (IoU > 0.50)
    box1 = _make_face(100.0, 100.0, 200.0, 200.0, score=0.95)
    box2 = _make_face(105.0, 98.0, 204.0, 202.0, score=0.88)
    box3 = _make_face(98.0, 103.0, 197.0, 199.0, score=0.75)

    # Person 2 with 2 duplicate detections
    box4 = _make_face(400.0, 120.0, 480.0, 220.0, score=0.92)
    box5 = _make_face(402.0, 118.0, 482.0, 218.0, score=0.82)

    raw_faces = [box1, box2, box3, box4, box5]
    nms_faces = apply_face_nms(raw_faces, iou_thresh=0.40)

    # Must preserve exactly 2 people with highest confidence
    assert len(nms_faces) == 2
    assert nms_faces[0].det_score == 0.95
    assert nms_faces[1].det_score == 0.92


def test_single_person_moving_produces_exactly_one_track_no_ghosts():
    """
    CRITICAL BUG TEST:
    A single person moving across frames must NEVER produce multiple tracks / ghost tracks.
    Before fix: Lost tracks were emitted, producing 5+ tracks for 1 person after a few frames.
    After fix: Exactly 1 track is emitted per frame.
    """
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=15, iou_threshold=0.30)
    first_track_id = None

    x = 100.0
    for frame in range(15):
        # Person moves 4 pixels to the right every frame
        face = _make_face(x, 100.0, x + 80.0, 180.0, score=0.92)
        active_tracks = tracker.update([face])

        # Exactly 1 track must be returned on every single frame
        assert len(active_tracks) == 1, f"Frame {frame} returned {len(active_tracks)} tracks instead of 1!"
        if first_track_id is None:
            first_track_id = active_tracks[0].track_id
        assert active_tracks[0].track_id == first_track_id
        assert active_tracks[0].time_since_update == 0

        x += 4.0


def test_two_people_produce_exactly_two_tracks():
    """Verify that multi-person detection is preserved: 2 people -> 2 tracks."""
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=10, iou_threshold=0.30)

    for frame in range(5):
        p1 = _make_face(100.0 + frame * 2, 100.0, 180.0 + frame * 2, 180.0, score=0.94)
        p2 = _make_face(350.0 - frame * 2, 110.0, 430.0 - frame * 2, 190.0, score=0.91)

        active_tracks = tracker.update([p1, p2])
        assert len(active_tracks) == 2, f"Frame {frame} returned {len(active_tracks)} tracks instead of 2!"
        ids = {t.track_id for t in active_tracks}
        assert len(ids) == 2


def test_five_people_produce_exactly_five_tracks():
    """Verify that multi-person detection scales: 5 people in a classroom -> 5 tracks."""
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=10, iou_threshold=0.30)

    faces = [
        _make_face(50.0, 100.0, 120.0, 180.0, score=0.90),
        _make_face(150.0, 100.0, 220.0, 180.0, score=0.91),
        _make_face(250.0, 100.0, 320.0, 180.0, score=0.92),
        _make_face(350.0, 100.0, 420.0, 180.0, score=0.93),
        _make_face(450.0, 100.0, 520.0, 180.0, score=0.94),
    ]

    for frame in range(4):
        active_tracks = tracker.update(faces)
        assert len(active_tracks) == 5, f"Frame {frame} returned {len(active_tracks)} tracks instead of 5!"
        assert len({t.track_id for t in active_tracks}) == 5


def test_lost_track_is_retained_internally_but_never_emitted():
    """
    Verify that when a face is momentarily lost/occluded:
    1. It is NOT emitted in the visible output list (no ghost box drawn).
    2. It IS retained in tracker.trackers so it can recover when redetected.
    """
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=10, iou_threshold=0.30)

    # Frame 1-3: Person is visible
    for frame in range(3):
        face = _make_face(100.0, 100.0, 180.0, 180.0, score=0.95)
        active = tracker.update([face])
        assert len(active) == 1

    track_id = active[0].track_id

    # Frame 4: Person is occluded / detector missed
    active_empty = tracker.update([])
    assert len(active_empty) == 0, "Occluded face must NOT be emitted as visible track!"
    # But internal tracker count must retain the lost track
    assert len(tracker.trackers) == 1
    assert tracker.trackers[0].time_since_update == 1

    # Frame 5: Person reappears near the same spot
    face_recovered = _make_face(103.0, 101.0, 183.0, 181.0, score=0.93)
    active_recovered = tracker.update([face_recovered])
    assert len(active_recovered) == 1
    # Track ID must be preserved from before the occlusion
    assert active_recovered[0].track_id == track_id


def test_tracker_overlap_suppression_prevents_duplicate_tracks():
    """
    Verify that if near-duplicate detections somehow bypass detection NMS,
    the tracker-level deduplication (_suppress_duplicate_trackers) merges or suppresses them.
    """
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=5, iou_threshold=0.30)

    # Feed two almost identical boxes in the same frame
    box_a = _make_face(100.0, 100.0, 200.0, 200.0, score=0.95)
    box_b = _make_face(102.0, 101.0, 201.0, 201.0, score=0.70)

    active = tracker.update([box_a, box_b])
    # Tracker should only emit 1 active track for the single physical face
    assert len(active) == 1
