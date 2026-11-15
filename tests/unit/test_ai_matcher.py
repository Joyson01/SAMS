import numpy as np
import pytest

from ai_engine.base import DecisionState
from ai_engine.recognition.arcface import l2_normalize
from ai_engine.recognition.vector_matcher import EnrolledTemplate, VectorMatcher


@pytest.fixture
def sample_matcher():
    matcher = VectorMatcher(
        known_threshold=0.60,
        uncertain_threshold=0.40,
        margin_threshold=0.06,
    )
    # Create two distinct student templates
    vec_rahul_1 = l2_normalize(np.random.RandomState(42).randn(512))
    vec_rahul_2 = l2_normalize(vec_rahul_1 + np.random.RandomState(43).randn(512) * 0.01)

    vec_priya = l2_normalize(np.random.RandomState(100).randn(512))

    templates = [
        EnrolledTemplate("p1", "s1", "STU-1", "CSE-1", "Rahul", vec_rahul_1, 0.95, "FRONT"),
        EnrolledTemplate("p2", "s1", "STU-1", "CSE-1", "Rahul", vec_rahul_2, 0.92, "LEFT_15"),
        EnrolledTemplate("p3", "s2", "STU-2", "CSE-2", "Priya", vec_priya, 0.90, "FRONT"),
    ]
    matcher.build_index(templates)
    return matcher, vec_rahul_1, vec_priya


def test_matcher_known_identity(sample_matcher):
    matcher, vec_rahul, _ = sample_matcher
    # Query with a vector very close to Rahul (cosine similarity ~0.95+)
    noise = np.random.RandomState(999).randn(512) * 0.005
    query_vec = l2_normalize(vec_rahul + noise)

    decision, best_match, candidates, reason = matcher.match(query_vec)

    assert decision == DecisionState.KNOWN
    assert best_match is not None
    assert best_match.name == "Rahul"
    assert best_match.similarity >= 0.85
    assert len(candidates) >= 1


def test_matcher_unknown_identity(sample_matcher):
    matcher, _, _ = sample_matcher
    # Query with an independent orthogonal vector
    query_stranger = l2_normalize(np.random.RandomState(9999).randn(512))

    decision, best_match, candidates, reason = matcher.match(query_stranger)

    assert decision == DecisionState.UNKNOWN
    assert "Unknown identity" in reason or best_match is None


def test_matcher_uncertain_identity(sample_matcher):
    matcher, vec_rahul, _ = sample_matcher
    # Construct a query vector with controlled cosine similarity around 0.50
    orthogonal_vec = l2_normalize(np.random.RandomState(777).randn(512))
    # Make orthogonal_vec strictly perpendicular to vec_rahul
    orthogonal_vec = l2_normalize(orthogonal_vec - np.dot(orthogonal_vec, vec_rahul) * vec_rahul)
    # Combine: cos_sim = 0.50 * 1.0 + 0.866 * 0 = 0.50
    query_uncertain = l2_normalize(vec_rahul * 0.50 + orthogonal_vec * 0.866)

    # Set specific thresholds for test
    matcher.set_thresholds(known_threshold=0.65, uncertain_threshold=0.35)
    decision, best_match, candidates, reason = matcher.match(query_uncertain)

    assert decision == DecisionState.UNCERTAIN
    assert best_match is not None
    assert 0.35 <= best_match.similarity < 0.65


def test_matcher_ambiguous_tie_forces_uncertain():
    matcher = VectorMatcher(known_threshold=0.55, margin_threshold=0.08)
    vec1 = l2_normalize(np.random.RandomState(1).randn(512))
    vec2 = l2_normalize(np.random.RandomState(2).randn(512))

    # Query is equidistant to both students
    query = l2_normalize(vec1 * 0.5 + vec2 * 0.5)

    templates = [
        EnrolledTemplate("p1", "s1", "STU-1", "CSE-1", "Student A", vec1, 0.9, "FRONT"),
        EnrolledTemplate("p2", "s2", "STU-2", "CSE-2", "Student B", vec2, 0.9, "FRONT"),
    ]
    matcher.build_index(templates)
    decision, best_match, candidates, reason = matcher.match(query)

    # Because candidate #1 and candidate #2 are tied, decision MUST NOT be forced KNOWN
    assert decision == DecisionState.UNCERTAIN
    assert "Ambiguous" in reason

