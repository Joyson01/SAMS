import numpy as np

from backend.app.services.phone_capture_service import assess_capture, normalize_embedding, select_candidates


def test_normalize_embedding_rejects_invalid_legacy_vectors():
    assert normalize_embedding([1.0, 2.0], expected_size=512) is None
    assert normalize_embedding([float("nan")] * 512) is None
    assert normalize_embedding([0.0] * 512) is None

    result = normalize_embedding([2.0] * 512)
    assert result is not None
    assert np.isclose(np.linalg.norm(result), 1.0)


def test_assess_capture_returns_actionable_quality_guidance():
    dark = np.zeros((200, 200, 3), dtype=np.uint8)
    assert assess_capture(dark, []).code == "TOO_DARK"

    flat = np.full((200, 200, 3), 128, dtype=np.uint8)
    assert assess_capture(flat, []).code == "BLURRY"

    textured = np.indices((200, 200)).sum(axis=0) % 2 * 255
    clear = np.repeat(textured[:, :, None], 3, axis=2).astype(np.uint8)
    tiny = [{"bbox": [0, 0, 20, 20], "is_quality_valid": False, "quality_reason": "Face too small"}]
    assert assess_capture(clear, tiny).code == "FACE_TOO_SMALL"


def test_select_candidates_routes_close_matches_to_review():
    detections = [{
        "student_id": "student-a", "similarity": .82, "second_similarity": .80,
        "is_recognized": True, "is_quality_valid": True,
    }]
    accepted, review = select_candidates(detections, threshold=.70, ambiguity_margin=.05)
    assert accepted == []
    assert review == ["student-a"]

