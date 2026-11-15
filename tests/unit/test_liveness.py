from pathlib import Path
import cv2
import numpy as np
import pytest

from ai_engine.base import BoundingBox, DecisionState, MatchCandidate
from ai_engine.liveness.base import AttackType
from ai_engine.liveness.liveness_detector import LivenessDetector
from ai_engine.liveness.texture_checker import TextureLivenessDetector
from ai_engine.verification.temporal_verifier import TemporalVerifier

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def liveness_detector():
    return LivenessDetector(liveness_threshold=0.70)


def test_genuine_face_passes_liveness(liveness_detector):
    sample_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
    if not sample_path.exists():
        pytest.skip("Dataset image not found")

    img = cv2.imread(str(sample_path))
    h, w = img.shape[:2]
    bbox = BoundingBox(int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8), 0.98)

    result = liveness_detector.predict(img, bbox)
    assert result.is_live is True
    assert result.liveness_score >= 0.70
    assert result.attack_type == AttackType.GENUINE
    assert result.details["skin_chroma_dist"] < 40.0


def test_screen_replay_moiré_rejection(liveness_detector):
    # Create synthetic screen replay attack by overlaying high frequency pixel grid
    img = np.ones((200, 200, 3), dtype=np.uint8) * 160
    # Add strong 2D periodic sinusoidal moiré pattern
    y, x = np.mgrid[0:200, 0:200]
    moiré = np.sin(x * 1.5) * np.cos(y * 1.5) * 50.0
    img[:, :, 0] = np.clip(img[:, :, 0] + moiré, 0, 255)
    img[:, :, 1] = np.clip(img[:, :, 1] + moiré, 0, 255)
    img[:, :, 2] = np.clip(img[:, :, 2] + moiré, 0, 255)

    bbox = BoundingBox(10, 10, 190, 190, 0.95)
    result = liveness_detector.predict(img, bbox)

    assert result.is_live is False
    assert result.liveness_score < 0.70
    assert result.attack_type in [AttackType.SCREEN_REPLAY_2D, AttackType.RIGID_CUTOUT, AttackType.UNKNOWN_SPOOF]


def test_print_photo_chromatic_rejection(liveness_detector):
    # Create synthetic flat paper printout with unnatural chromaticity (pure monochrome/desaturated)
    img = np.ones((200, 200, 3), dtype=np.uint8) * 128

    bbox = BoundingBox(10, 10, 190, 190, 0.95)
    result = liveness_detector.predict(img, bbox)

    assert result.is_live is False
    assert result.liveness_score < 0.70
    assert result.attack_type in [AttackType.PRINT_PHOTO_2D, AttackType.UNKNOWN_SPOOF]


def test_temporal_verifier_rejects_spoofed_frames():
    verifier = TemporalVerifier(window_size=7, min_required_frames=4, min_liveness_threshold=0.70)
    cand_student = MatchCandidate("s1", "STU-1", "CSE-1", "Student", 0.90, 95.0)

    # Feed 4 frames with high visual similarity (0.90) BUT low liveness (0.35) -> SPOOF ATTACK!
    for _ in range(4):
        res = verifier.add_observation(
            track_id=1,
            match=cand_student,
            is_valid_quality=True,
            is_occluded=False,
            liveness_score=0.35,  # Spoof detected!
        )

    # Must NOT confirm identity
    assert res.is_confirmed is False
    assert res.decision == DecisionState.UNCERTAIN
    assert "spoof" in res.reason.lower()

