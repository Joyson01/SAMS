import pytest
from ai_engine.base import DecisionState, MatchCandidate
from ai_engine.verification.temporal_verifier import TemporalVerifier


def test_temporal_verifier_requires_minimum_frames():
    verifier = TemporalVerifier(window_size=7, min_required_frames=4, min_average_confidence=0.60)
    cand_rahul = MatchCandidate("s1", "STU-1", "CSE-1", "Rahul", 0.85, 90.0)

    # Frame 1: 1st observation -> Must NOT be confirmed yet
    res1 = verifier.add_observation(track_id=1, match=cand_rahul)
    assert res1.is_confirmed is False
    assert res1.decision == DecisionState.UNCERTAIN
    assert res1.votes_count == 1

    # Frame 2: 2nd observation -> Still accumulating
    res2 = verifier.add_observation(track_id=1, match=cand_rahul)
    assert res2.is_confirmed is False

    # Frame 3: 3rd observation -> Still accumulating
    res3 = verifier.add_observation(track_id=1, match=cand_rahul)
    assert res3.is_confirmed is False

    # Frame 4: 4th observation -> K=4 threshold satisfied, CONFIRMED!
    res4 = verifier.add_observation(track_id=1, match=cand_rahul)
    assert res4.is_confirmed is True
    assert res4.decision == DecisionState.KNOWN
    assert res4.confirmed_name == "Rahul"
    assert res4.average_similarity >= 0.80
    assert res4.votes_count == 4


def test_temporal_verifier_rejects_inconsistent_voting():
    verifier = TemporalVerifier(window_size=7, min_required_frames=4, min_consistency_ratio=0.75)
    cand_rahul = MatchCandidate("s1", "STU-1", "CSE-1", "Rahul", 0.80, 85.0)
    cand_priya = MatchCandidate("s2", "STU-2", "CSE-2", "Priya", 0.78, 80.0)

    # Alternating conflicting predictions
    verifier.add_observation(track_id=10, match=cand_rahul)
    verifier.add_observation(track_id=10, match=cand_priya)
    verifier.add_observation(track_id=10, match=cand_rahul)
    res = verifier.add_observation(track_id=10, match=cand_priya)

    # 2 votes Rahul, 2 votes Priya (50% consistency < 75% threshold)
    assert res.is_confirmed is False
    assert res.decision == DecisionState.UNCERTAIN
    assert "Inconsistent" in res.reason


def test_temporal_verifier_handles_occluded_frames():
    verifier = TemporalVerifier(window_size=7, min_required_frames=3)
    cand_rahul = MatchCandidate("s1", "STU-1", "CSE-1", "Rahul", 0.88, 92.0)

    # Frame 1: Clear
    verifier.add_observation(track_id=5, match=cand_rahul, is_valid_quality=True, is_occluded=False)
    # Frame 2: Occluded (hand over face / bad frame)
    verifier.add_observation(track_id=5, match=None, is_valid_quality=False, is_occluded=True)
    # Frame 3: Occluded
    verifier.add_observation(track_id=5, match=None, is_valid_quality=False, is_occluded=True)

    # Total valid frames is only 1, so track remains UNCERTAIN without crashing or false trigger
    res = verifier.get_track_status(track_id=5)
    assert res.is_confirmed is False
    assert res.total_valid_frames == 1

    # Frame 4 & 5: Clear frames resume
    verifier.add_observation(track_id=5, match=cand_rahul, is_valid_quality=True, is_occluded=False)
    res_final = verifier.add_observation(track_id=5, match=cand_rahul, is_valid_quality=True, is_occluded=False)

    assert res_final.is_confirmed is True
    assert res_final.confirmed_name == "Rahul"

