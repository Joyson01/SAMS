import time
import numpy as np
import pytest

from ai_engine.base import BoundingBox, DecisionState, DetectedFace, MatchCandidate
from ai_engine.tracking.byte_tracker import ByteFaceTracker
from ai_engine.tracking.identity_cache import CachedIdentity, TrackIdentityCache
from ai_engine.verification.temporal_verifier import TemporalVerifier
from backend.app.services.recognition_service import (
    RecognitionService,
    RecognitionStreamState,
    _get_or_create_stream_state,
    _stream_states,
)


def test_track_identity_cache_lifecycle():
    cache = TrackIdentityCache(
        revalidation_interval_frames=10,
        max_lost_frames_for_cache=2,
        cache_ttl_seconds=5.0,
    )

    # 1. New track -> must run ArcFace
    assert cache.should_run_recognition(track_id=1, frame_idx=1) is True
    assert cache.get(1) is None

    # 2. Update identity as confirmed
    cached = cache.update_identity(
        track_id=1,
        student_id="s123",
        student_code="STU-01",
        roll_number="CSE-01",
        name="Rahul Sharma",
        confidence=0.88,
        is_confirmed=True,
        liveness_score=0.98,
        frame_idx=1,
    )
    assert cached.track_id == 1
    assert cached.name == "Rahul Sharma"
    assert cached.is_confirmed is True
    assert cache.total_entries == 1

    # 3. Next immediate frames -> cached identity reused, ArcFace skipped!
    assert cache.should_run_recognition(track_id=1, frame_idx=2) is False
    assert cache.should_run_recognition(track_id=1, frame_idx=3) is False
    cache.touch(1, frame_idx=3)
    assert cache.get(1).total_cached_reuses == 1

    # 4. Occlusion -> must run ArcFace
    assert cache.should_run_recognition(track_id=1, frame_idx=4, is_occluded=True) is True

    # 5. Track lost for > max_lost_frames_for_cache -> must revalidate
    assert cache.should_run_recognition(track_id=1, frame_idx=4, is_occluded=False, time_since_update=3) is True

    # 6. Revalidation interval exceeded (frame 1 -> frame 11 with interval 10) -> must run ArcFace
    assert cache.should_run_recognition(track_id=1, frame_idx=11) is True

    # 7. Prune stale tracks when track terminates
    cache.prune_stale(active_track_ids=[2, 3])  # track 1 not active anymore
    assert cache.get(1) is None
    assert cache.total_entries == 0


def test_unconfirmed_identity_always_runs_recognition():
    cache = TrackIdentityCache()
    # If a track was seen but is unconfirmed (e.g. uncertain score)
    cache.update_identity(
        track_id=2,
        student_id="s999",
        student_code="STU-99",
        roll_number="CSE-99",
        name="Possible Match",
        confidence=0.46,
        is_confirmed=False,
        frame_idx=1,
    )
    # Must still run ArcFace on frame 2 to resolve identity
    assert cache.should_run_recognition(track_id=2, frame_idx=2) is True


def test_stream_state_isolation_and_cleanup():
    RecognitionService.clear_all_stream_states()

    state_cam1 = _get_or_create_stream_state(session_id="sess_A", camera_id="cam_01")
    state_cam2 = _get_or_create_stream_state(session_id="sess_A", camera_id="cam_02")
    state_sess2 = _get_or_create_stream_state(session_id="sess_B", camera_id="cam_01")

    # All three must be distinct isolated stream states
    assert state_cam1 is not state_cam2
    assert state_cam1 is not state_sess2
    assert len(_stream_states) == 3

    # Add identity to cam1
    state_cam1.identity_cache.update_identity(
        track_id=5,
        student_id="s1",
        student_code="STU-01",
        roll_number="CSE-01",
        name="Student 1",
        confidence=0.85,
        is_confirmed=True,
    )
    assert state_cam1.identity_cache.get(5) is not None
    assert state_cam2.identity_cache.get(5) is None  # Cam 2 isolated
    assert state_sess2.identity_cache.get(5) is None  # Sess B isolated

    # Test reset of specific stream state
    reset_ok = RecognitionService.reset_stream_state(session_id="sess_A", camera_id="cam_01")
    assert reset_ok is True
    assert len(_stream_states) == 2
    assert ("sess_A", "cam_01") not in _stream_states

    # Test clear all
    cleared_count = RecognitionService.clear_all_stream_states()
    assert cleared_count == 2
    assert len(_stream_states) == 0


def test_tracked_pipeline_cache_reuse_benchmark():
    """Simulates consecutive frames through process_tracked_frame demonstrating 0 ArcFace calls on cached frames."""
    from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
    from ai_engine.recognition.vector_matcher import EnrolledTemplate

    pipeline = FaceRecognitionPipeline()

    # Create dummy synthetic student template and enrolled gallery
    rng = np.random.RandomState(42)
    sample_emb = rng.randn(512).astype(np.float32)
    sample_emb /= np.linalg.norm(sample_emb)

    template = EnrolledTemplate(
        profile_id="p1",
        student_id="s101",
        student_code="STU-101",
        roll_number="CSE-101",
        name="Aarav Mehta",
        embedding=sample_emb,
        quality_score=0.95,
        pose_type="FRONTAL",
    )
    pipeline.load_gallery([template])

    # Setup isolated stream state with min_required_frames=2 for fast verification test
    tracker = ByteFaceTracker(min_hits=1, max_lost_frames=10, iou_threshold=0.30)
    verifier = TemporalVerifier(window_size=5, min_required_frames=2, min_average_confidence=0.40)
    identity_cache = TrackIdentityCache(revalidation_interval_frames=10)
    stream_state = RecognitionStreamState(
        session_id="bench_sess",
        camera_id="bench_cam",
        tracker=tracker,
        verifier=verifier,
        identity_cache=identity_cache,
    )

    # Synthetic image containing face
    # Mock detector detect to return identical bounding box across frames
    fixed_bbox = BoundingBox(100.0, 100.0, 220.0, 220.0, 0.95)
    fixed_kps = np.array([[120, 130], [200, 130], [160, 160], [130, 190], [190, 190]], dtype=np.float32)
    mock_detected_face = DetectedFace(bbox=fixed_bbox, landmarks=fixed_kps, det_score=0.95)

    original_detect = pipeline.detector.detect
    original_extract_batch = pipeline.embedder.extract_batch

    pipeline.detector.detect = lambda img: [mock_detected_face]
    # Return embedding that matches our enrolled template with high similarity
    pipeline.embedder.extract_batch = lambda crops: [sample_emb]

    synth_img = np.zeros((480, 640, 3), dtype=np.uint8)

    try:
        # Frame 1: New track -> must run ArcFace, status is VERIFYING (1/2 frames)
        res1, lat1 = pipeline.process_tracked_frame(
            image=synth_img,
            stream_state=stream_state,
            run_quality_check=False,
            run_liveness_check=False,
        )
        assert len(res1) == 1
        assert lat1["arcface_calls"] == 1.0
        assert lat1["cached_reuses"] == 0.0
        assert res1[0].status == "VERIFYING"
        assert res1[0].track_id is not None
        t_id = res1[0].track_id

        # Frame 2: Second frame -> runs ArcFace, reaches K=2 threshold -> CONFIRMED & CACHED
        res2, lat2 = pipeline.process_tracked_frame(
            image=synth_img,
            stream_state=stream_state,
            run_quality_check=False,
            run_liveness_check=False,
        )
        assert len(res2) == 1
        assert lat2["arcface_calls"] == 1.0
        assert res2[0].status == "VERIFIED"
        assert res2[0].track_id == t_id
        assert stream_state.identity_cache.get(t_id) is not None
        assert stream_state.identity_cache.get(t_id).is_confirmed is True

        # Frame 3: Confirmed track -> ArcFace completely skipped! (0 ArcFace calls, cached identity reused!)
        res3, lat3 = pipeline.process_tracked_frame(
            image=synth_img,
            stream_state=stream_state,
            run_quality_check=False,
            run_liveness_check=False,
        )
        assert len(res3) == 1
        assert lat3["arcface_calls"] == 0.0  # ArcFace SKIPPED!
        assert lat3["cached_reuses"] == 1.0  # Cached identity REUSED!
        assert lat3["embedding_ms"] == 0.0   # 0ms ArcFace compute!
        assert res3[0].status == "VERIFIED"
        assert res3[0].best_match.name == "Aarav Mehta"
        assert res3[0].track_id == t_id
        assert "Identity reused from track cache" in res3[0].decision_reason

        # Frame 4: Another frame in steady state -> still 0 ArcFace calls!
        res4, lat4 = pipeline.process_tracked_frame(
            image=synth_img,
            stream_state=stream_state,
            run_quality_check=False,
            run_liveness_check=False,
        )
        assert lat4["arcface_calls"] == 0.0
        assert lat4["cached_reuses"] == 1.0
        assert res4[0].status == "VERIFIED"

    finally:
        pipeline.detector.detect = original_detect
        pipeline.embedder.extract_batch = original_extract_batch

