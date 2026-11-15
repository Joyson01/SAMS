import os
from pathlib import Path
import cv2
import numpy as np
import pytest

from ai_engine.base import DecisionState
from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
from ai_engine.recognition.vector_matcher import EnrolledTemplate

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(scope="module")
def face_pipeline():
    """Module-scoped pipeline instance to reuse ONNX sessions across tests."""
    return FaceRecognitionPipeline()


def test_real_pipeline_enroll_and_recognize(face_pipeline):
    sample_test_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"

    if not sample_test_path.exists():
        pytest.skip("Dataset images not found on disk")

    # 1. Read enrollment image
    img_p1 = cv2.imread(str(sample_test_path))

    # 2. Process enrollment sample
    ok_p1, emb_p1, q_p1, pose_p1, _ = face_pipeline.process_enrollment_image(img_p1)

    assert ok_p1 is True
    assert emb_p1 is not None and emb_p1.shape == (512,)

    # 3. Load Gallery with templates
    templates = [
        EnrolledTemplate("p1", "s_sample", "STU-001", "CSE-01", "Sample Student", emb_p1, q_p1.sharpness, pose_p1.pose_type),
    ]
    face_pipeline.load_gallery(templates)

    # 4. Recognize Sample Test Image
    img_test_sample = cv2.imread(str(sample_test_path))
    results_sample, latencies_sample = face_pipeline.process_frame(img_test_sample)

    assert len(results_sample) >= 1
    best_face = results_sample[0]
    assert best_face.decision == DecisionState.KNOWN
    assert best_face.best_match is not None
    assert best_face.best_match.name == "Sample Student"
    assert best_face.best_match.similarity >= 0.65

    # Check latency
    assert latencies_sample["total_pipeline_ms"] > 0


def test_multi_person_classroom_recognition(face_pipeline):
    grp_path = WORKSPACE_ROOT / "tests" / "fixtures" / "test_grp.jpg"
    if not grp_path.exists():
        pytest.skip("Group image not found")

    img_grp = cv2.imread(str(grp_path))
    results, latencies = face_pipeline.process_frame(img_grp, top_k=2)

    # Must detect multiple faces
    assert len(results) > 1
    print(f"\n[GROUP BENCHMARK] Detected {len(results)} faces in {latencies['total_pipeline_ms']}ms")

    # Verify every face has a valid decision state
    for r in results:
        assert r.decision in [DecisionState.KNOWN, DecisionState.UNKNOWN, DecisionState.UNCERTAIN]
        assert r.bbox.width > 0 and r.bbox.height > 0

