from pathlib import Path
import cv2
import numpy as np
import pytest

from ai_engine.base import DecisionState
from ai_engine.pipeline.video_pipeline import VideoRecognitionPipeline
from ai_engine.recognition.vector_matcher import EnrolledTemplate

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


def test_partial_occlusion_recovery_and_confirmation():
    """Demonstrates:

    Student visible (Frame 1)
    -> Student partially occluded by hand/obstacle (Frames 2-3) -> Tracker holds track ID & state
    -> Clear frames reappear (Frames 4-5) -> Temporal verifier confirms identity!
    """
    sample_test_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"

    if not sample_test_path.exists():
        pytest.skip("Dataset images not found on disk")

    pipeline = VideoRecognitionPipeline(detection_interval=1)

    # 1. Enroll sample student
    img_enroll = cv2.imread(str(sample_test_path))
    emb_p = pipeline.embedder.extract_from_image(img_enroll, pipeline.detector.detect(img_enroll)[0].landmarks)

    template = EnrolledTemplate("p1", "s_sample", "STU-001", "CSE-01", "Sample Student", emb_p, 0.95, "FRONT")
    pipeline.load_gallery([template])
    pipeline.reset_tracking()

    # Load clean test image
    img_clean = cv2.imread(str(sample_test_path))

    # 2. Frame 1: Clear face
    results_f1, _ = pipeline.process_frame(img_clean)
    assert len(results_f1) == 1
    t_id = results_f1[0].track_id
    assert results_f1[0].decision == DecisionState.UNCERTAIN  # Frame 1: accumulating (1/4)

    # 3. Frame 2: Simulated heavy partial occlusion (black box over bottom half of face)
    img_occluded = img_clean.copy()
    h, w = img_occluded.shape[:2]
    # Occlude lower 60% of image (mouth and nose covered)
    cv2.rectangle(img_occluded, (0, int(h * 0.45)), (w, h), (0, 0, 0), -1)

    results_f2, _ = pipeline.process_frame(img_occluded)
    # Tracker should either maintain track or classify as occluded/uncertain without false match
    if len(results_f2) > 0:
        assert results_f2[0].track_id == t_id
        assert results_f2[0].is_confirmed is False

    # 4. Frame 3: Another occluded frame
    results_f3, _ = pipeline.process_frame(img_occluded)
    if len(results_f3) > 0:
        assert results_f3[0].is_confirmed is False

    # 5. Frames 4, 5, 6: Clear face returns!
    results_f4, _ = pipeline.process_frame(img_clean)
    results_f5, _ = pipeline.process_frame(img_clean)
    results_f6, _ = pipeline.process_frame(img_clean)

    assert len(results_f6) == 1
    confirmed_face = results_f6[0]

    # Track ID must be preserved throughout
    assert confirmed_face.track_id == t_id
    # Verification must now be CONFIRMED KNOWN as clear evidence was accumulated!
    assert confirmed_face.decision == DecisionState.KNOWN
    assert confirmed_face.is_confirmed is True
    assert confirmed_face.confirmed_name == "Sample Student"
    assert confirmed_face.average_similarity >= 0.65
    print(f"\n[OCCLUSION RECOVERY PASSED] Track #{t_id} confirmed as {confirmed_face.confirmed_name} (avg sim {confirmed_face.average_similarity:.4f}) across occlusion gap.")

