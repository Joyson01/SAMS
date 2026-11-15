import pytest


@pytest.mark.parametrize(
    "score,bucket",
    [
        (0.39, "UNKNOWN"),
        (0.40, "NEEDS_REVIEW"),
        (0.57, "NEEDS_REVIEW"),
        (0.58, "VERIFIED"),
    ],
)
def test_boundaries(score, bucket):
    from ai_engine.recognition.photo_matcher import classify_scores

    assert classify_scores([("a", score), ("b", 0.1)]) == bucket


def test_margin_and_duplicate_winner():
    from ai_engine.recognition.photo_matcher import classify_scores, assign_faces

    assert classify_scores([("a", 0.7), ("b", 0.68)]) == "NEEDS_REVIEW"
    assert classify_scores([("a", 0.60), ("b", 0.55)]) == "VERIFIED"
    faces = [
        {"bucket": "VERIFIED", "student_id": "a", "similarity": v, "quality_flags": []}
        for v in [0.7, 0.9]
    ]
    result = assign_faces(faces)
    assert [f["bucket"] for f in result] == ["NEEDS_REVIEW", "VERIFIED"]
    assert classify_scores([]) == "UNKNOWN"
