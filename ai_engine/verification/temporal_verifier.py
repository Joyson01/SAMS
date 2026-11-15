import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple
import numpy as np

from ai_engine.base import DecisionState, MatchCandidate


@dataclass
class FrameObservation:
    timestamp: float
    candidate_id: Optional[str]
    candidate_code: Optional[str]
    candidate_roll: Optional[str]
    candidate_name: Optional[str]
    similarity: float
    liveness_score: float
    is_valid: bool
    is_occluded: bool


@dataclass
class TemporalVerificationResult:
    track_id: int
    decision: DecisionState
    is_confirmed: bool
    confirmed_student_id: Optional[str]
    confirmed_code: Optional[str]
    confirmed_roll: Optional[str]
    confirmed_name: Optional[str]
    average_similarity: float
    average_liveness: float
    votes_count: int
    total_valid_frames: int
    reason: str
    provisional_student_id: Optional[str] = None
    provisional_code: Optional[str] = None
    provisional_roll: Optional[str] = None
    provisional_name: Optional[str] = None
    frames_needed: int = 0
    confidence_history: List[float] = field(default_factory=list)


class TemporalVerifier:
    """Sliding-window multi-frame temporal evidence accumulator for reliable identity verification."""

    def __init__(
        self,
        window_size: int = 7,
        min_required_frames: int = 4,
        min_consistency_ratio: float = 0.75,
        min_average_confidence: float = 0.50,
        min_liveness_threshold: float = 0.70,
        track_expiry_seconds: float = 15.0,
    ):
        self.window_size = window_size
        self.min_required_frames = min_required_frames
        self.min_consistency_ratio = min_consistency_ratio
        self.min_average_confidence = min_average_confidence
        self.min_liveness_threshold = min_liveness_threshold
        self.track_expiry_seconds = track_expiry_seconds

        # Map: track_id -> Deque[FrameObservation]
        self._buffers: Dict[int, Deque[FrameObservation]] = defaultdict(
            lambda: deque(maxlen=self.window_size)
        )
        self._last_seen: Dict[int, float] = {}

    def clear(self) -> None:
        """Resets all active tracking buffers."""
        self._buffers.clear()
        self._last_seen.clear()

    def add_observation(
        self,
        track_id: int,
        match: Optional[MatchCandidate],
        is_valid_quality: bool = True,
        is_occluded: bool = False,
        liveness_score: float = 1.0,
    ) -> TemporalVerificationResult:
        """Records a new observation for a tracked face and evaluates multi-frame consensus."""
        now = time.time()
        self._last_seen[track_id] = now
        buf = self._buffers[track_id]

        is_live_valid = liveness_score >= self.min_liveness_threshold

        # Record observation
        obs = FrameObservation(
            timestamp=now,
            candidate_id=match.student_id if match else None,
            candidate_code=match.student_code if match else None,
            candidate_roll=match.roll_number if match else None,
            candidate_name=match.name if match else None,
            similarity=match.similarity if match else 0.0,
            liveness_score=liveness_score,
            is_valid=is_valid_quality and not is_occluded and is_live_valid,
            is_occluded=is_occluded,
        )
        buf.append(obs)

        # Cleanup old tracks
        self._cleanup_expired_tracks(now)

        return self._evaluate_track(track_id)

    def get_track_status(self, track_id: int) -> TemporalVerificationResult:
        """Queries the current verification status of a track."""
        return self._evaluate_track(track_id)

    def _evaluate_track(self, track_id: int) -> TemporalVerificationResult:
        """Analyzes accumulated evidence inside the sliding window."""
        buf = self._buffers.get(track_id)
        if not buf:
            return TemporalVerificationResult(
                track_id=track_id,
                decision=DecisionState.UNKNOWN,
                is_confirmed=False,
                confirmed_student_id=None,
                confirmed_code=None,
                confirmed_roll=None,
                confirmed_name=None,
                average_similarity=0.0,
                average_liveness=0.0,
                votes_count=0,
                total_valid_frames=0,
                reason="No observations recorded.",
            )

        # Filter valid, unoccluded, live frames
        valid_obs = [o for o in buf if o.is_valid and o.candidate_id is not None]
        total_valid = len(valid_obs)
        history = [round(o.similarity, 3) for o in buf if o.candidate_id is not None]

        # 1. Check if enough valid frames have been accumulated
        if total_valid < self.min_required_frames:
            occluded_count = sum(1 for o in buf if o.is_occluded)
            spoof_count = sum(1 for o in buf if o.liveness_score < self.min_liveness_threshold)
            frames_needed = max(1, self.min_required_frames - total_valid)

            provisional = valid_obs[-1] if valid_obs else None
            reason = (
                f"Verifying identity ({total_valid}/{self.min_required_frames} frames). Need {frames_needed} more frame{'s' if frames_needed > 1 else ''}."
            )
            if occluded_count > 0:
                reason += f" ({occluded_count} frames occluded/held)."
            if spoof_count > 0:
                reason += f" ({spoof_count} spoof attacks rejected)."

            return TemporalVerificationResult(
                track_id=track_id,
                decision=DecisionState.UNCERTAIN,
                is_confirmed=False,
                confirmed_student_id=None,
                confirmed_code=None,
                confirmed_roll=None,
                confirmed_name=None,
                average_similarity=round(float(np.mean([o.similarity for o in valid_obs])) if valid_obs else 0.0, 4),
                average_liveness=round(float(np.mean([o.liveness_score for o in valid_obs])) if valid_obs else 0.0, 3),
                votes_count=total_valid,
                total_valid_frames=total_valid,
                reason=reason,
                provisional_student_id=provisional.candidate_id if provisional else None,
                provisional_code=provisional.candidate_code if provisional else None,
                provisional_roll=provisional.candidate_roll if provisional else None,
                provisional_name=provisional.candidate_name if provisional else None,
                frames_needed=frames_needed,
                confidence_history=history,
            )

        # 2. Count identity votes across valid frames
        student_votes: Dict[str, List[FrameObservation]] = defaultdict(list)
        for o in valid_obs:
            assert o.candidate_id is not None
            student_votes[o.candidate_id].append(o)

        # Find top voted candidate
        top_student_id, top_observations = max(
            student_votes.items(), key=lambda item: len(item[1])
        )
        votes_count = len(top_observations)
        consistency_ratio = votes_count / total_valid
        representative = top_observations[-1]

        # 3. Check Consistency Ratio
        if consistency_ratio < self.min_consistency_ratio:
            return TemporalVerificationResult(
                track_id=track_id,
                decision=DecisionState.UNCERTAIN,
                is_confirmed=False,
                confirmed_student_id=None,
                confirmed_code=None,
                confirmed_roll=None,
                confirmed_name=None,
                average_similarity=round(float(np.mean([o.similarity for o in top_observations])), 4),
                average_liveness=round(float(np.mean([o.liveness_score for o in top_observations])), 3),
                votes_count=votes_count,
                total_valid_frames=total_valid,
                reason=f"Inconsistent identity votes ({votes_count}/{total_valid} = {consistency_ratio:.1%} < {self.min_consistency_ratio:.1%}).",
                provisional_student_id=representative.candidate_id,
                provisional_code=representative.candidate_code,
                provisional_roll=representative.candidate_roll,
                provisional_name=representative.candidate_name,
                frames_needed=1,
                confidence_history=history,
            )

        # 4. Check Average Similarity and Liveness
        avg_sim = float(np.mean([o.similarity for o in top_observations]))
        avg_liv = float(np.mean([o.liveness_score for o in top_observations]))

        if avg_sim >= self.min_average_confidence and avg_liv >= self.min_liveness_threshold:
            return TemporalVerificationResult(
                track_id=track_id,
                decision=DecisionState.KNOWN,
                is_confirmed=True,
                confirmed_student_id=top_student_id,
                confirmed_code=representative.candidate_code,
                confirmed_roll=representative.candidate_roll,
                confirmed_name=representative.candidate_name,
                average_similarity=round(avg_sim, 4),
                average_liveness=round(avg_liv, 3),
                votes_count=votes_count,
                total_valid_frames=total_valid,
                reason=f"Identity confirmed ({votes_count}/{total_valid} frames, avg similarity {avg_sim:.3f} >= {self.min_average_confidence:.3f}, liveness {avg_liv:.2f}).",
                provisional_student_id=representative.candidate_id,
                provisional_code=representative.candidate_code,
                provisional_roll=representative.candidate_roll,
                provisional_name=representative.candidate_name,
                frames_needed=0,
                confidence_history=history,
            )
        else:
            return TemporalVerificationResult(
                track_id=track_id,
                decision=DecisionState.UNCERTAIN,
                is_confirmed=False,
                confirmed_student_id=None,
                confirmed_code=None,
                confirmed_roll=None,
                confirmed_name=None,
                average_similarity=round(avg_sim, 4),
                average_liveness=round(avg_liv, 3),
                votes_count=votes_count,
                total_valid_frames=total_valid,
                reason=f"Threshold not met (avg similarity {avg_sim:.3f} < {self.min_average_confidence:.3f}, liveness {avg_liv:.2f}).",
                provisional_student_id=representative.candidate_id,
                provisional_code=representative.candidate_code,
                provisional_roll=representative.candidate_roll,
                provisional_name=representative.candidate_name,
                frames_needed=1,
                confidence_history=history,
            )

    def _cleanup_expired_tracks(self, now: float) -> None:
        """Purges track buffers that have not received frames for > expiry threshold."""
        expired = [
            t_id
            for t_id, last_time in self._last_seen.items()
            if now - last_time > self.track_expiry_seconds
        ]
        for t_id in expired:
            self._buffers.pop(t_id, None)
            self._last_seen.pop(t_id, None)
