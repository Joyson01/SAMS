import pytest
import numpy as np
from ai_engine.base import DecisionState, MatchCandidate
from ai_engine.verification.temporal_verifier import TemporalVerifier
from backend.app.schemas.recognition import AIRecognitionConfig
from backend.app.services.recognition_service import RecognitionService


def test_temporal_verifier_provisional_info_accumulation():
    """Verify that TemporalVerifier properly exposes provisional candidate info and frames needed during verification."""
    verifier = TemporalVerifier(
        window_size=7,
        min_required_frames=4,
        min_consistency_ratio=0.75,
        min_average_confidence=0.60,
    )

    candidate = MatchCandidate(
        student_id="stu-joyson",
        student_code="STU-001",
        roll_number="TEB-01",
        name="Joyson Vadlya",
        similarity=0.59,
        confidence_pct=59.0,
    )

    # 1. Observation 1: Under min_required_frames -> Must be UNCERTAIN but with provisional candidate info
    res1 = verifier.add_observation(track_id=1, match=candidate, is_valid_quality=True, liveness_score=1.0)
    assert res1.is_confirmed is False
    assert res1.decision == DecisionState.UNCERTAIN
    assert res1.provisional_name == "Joyson Vadlya"
    assert res1.frames_needed == 3
    assert len(res1.confidence_history) == 1

    # 2. Observation 2 & 3
    res2 = verifier.add_observation(track_id=1, match=candidate, is_valid_quality=True, liveness_score=1.0)
    res3 = verifier.add_observation(track_id=1, match=candidate, is_valid_quality=True, liveness_score=1.0)
    assert res3.is_confirmed is False
    assert res3.provisional_name == "Joyson Vadlya"
    assert res3.frames_needed == 1

    # 3. Observation 4 with high confidence -> Becomes fully KNOWN and is_confirmed=True
    candidate_high = MatchCandidate(
        student_id="stu-joyson",
        student_code="STU-001",
        roll_number="TEB-01",
        name="Joyson Vadlya",
        similarity=0.75,
        confidence_pct=75.0,
    )
    res4 = verifier.add_observation(track_id=1, match=candidate_high, is_valid_quality=True, liveness_score=1.0)
    assert res4.is_confirmed is True
    assert res4.decision == DecisionState.KNOWN
    assert res4.confirmed_name == "Joyson Vadlya"
    assert res4.frames_needed == 0


def test_ai_recognition_config_dynamic_propagation():
    """Verify that updating AIRecognitionConfig updates all underlying engine modules without restart."""
    new_config = AIRecognitionConfig(
        known_threshold=0.68,
        uncertain_threshold=0.48,
        margin_threshold=0.08,
        min_face_size=80,
        min_sharpness=55.0,
        min_brightness=45.0,
        max_brightness=220.0,
        max_yaw=35.0,
        max_pitch=25.0,
        liveness_mode="STRICT",
        liveness_threshold=0.75,
        detection_confidence_threshold=0.55,
        min_required_frames=5,
    )

    updated = RecognitionService.set_config(new_config)
    assert updated.known_threshold == 0.68
    assert updated.liveness_mode == "STRICT"
    assert updated.min_face_size == 80

    pipeline = RecognitionService.get_config()
    assert pipeline.known_threshold == 0.68
    assert pipeline.liveness_threshold == 0.75
