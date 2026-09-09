import time
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class CachedIdentity:
    """Stored biometric identity associated with a persistent ByteTrack ID."""
    track_id: int
    student_id: str
    student_code: str
    roll_number: str
    name: str
    confidence: float
    is_confirmed: bool
    liveness_score: float = 1.0
    first_recognized_frame: int = 0
    last_recognized_frame: int = 0
    last_recognized_timestamp: float = 0.0
    last_seen_frame: int = 0
    last_seen_timestamp: float = 0.0
    total_cached_reuses: int = 0


class TrackIdentityCache:
    """Manages cached biometric identities across video frames to gate expensive ArcFace inferences."""

    def __init__(
        self,
        revalidation_interval_frames: int = 30,
        max_lost_frames_for_cache: int = 3,
        cache_ttl_seconds: float = 30.0,
    ):
        self.revalidation_interval_frames = revalidation_interval_frames
        self.max_lost_frames_for_cache = max_lost_frames_for_cache
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cache: Dict[int, CachedIdentity] = {}

    @property
    def total_entries(self) -> int:
        return len(self._cache)

    def get(self, track_id: int) -> Optional[CachedIdentity]:
        return self._cache.get(track_id)

    def should_run_recognition(
        self,
        track_id: int,
        frame_idx: int,
        is_occluded: bool = False,
        time_since_update: int = 0,
    ) -> bool:
        """Determines if heavy ArcFace recognition should be executed for a track.

        Returns:
            True: If track is new, unconfirmed, occluded, reappeared after significant loss,
                  or has exceeded the revalidation interval.
            False: If track has a reliable, verified cached identity that can be safely reused.
        """
        cached = self._cache.get(track_id)
        # CASE A: New track / no cached identity
        if cached is None:
            return True

        # CASE C: Identity is not confirmed known (e.g. uncertain or accumulating votes)
        if not cached.is_confirmed:
            return True

        # CASE D: Track was lost or occluded for multiple frames
        if is_occluded or time_since_update > self.max_lost_frames_for_cache:
            return True

        # Periodic Revalidation check: frame interval or wall-clock TTL
        if (frame_idx - cached.last_recognized_frame) >= self.revalidation_interval_frames:
            return True

        now = time.time()
        if (now - cached.last_recognized_timestamp) > self.cache_ttl_seconds:
            return True

        # CASE B: Reliable confirmed track -> SKIP ArcFace
        return False

    def update_identity(
        self,
        track_id: int,
        student_id: str,
        student_code: str,
        roll_number: str,
        name: str,
        confidence: float,
        is_confirmed: bool,
        liveness_score: float = 1.0,
        frame_idx: int = 0,
    ) -> CachedIdentity:
        """Stores or refreshes confirmed identity for a track."""
        now = time.time()
        cached = self._cache.get(track_id)
        if cached is None:
            cached = CachedIdentity(
                track_id=track_id,
                student_id=student_id,
                student_code=student_code,
                roll_number=roll_number,
                name=name,
                confidence=confidence,
                is_confirmed=is_confirmed,
                liveness_score=liveness_score,
                first_recognized_frame=frame_idx,
                last_recognized_frame=frame_idx,
                last_recognized_timestamp=now,
                last_seen_frame=frame_idx,
                last_seen_timestamp=now,
            )
            self._cache[track_id] = cached
        else:
            cached.student_id = student_id
            cached.student_code = student_code
            cached.roll_number = roll_number
            cached.name = name
            cached.confidence = confidence
            cached.is_confirmed = is_confirmed
            cached.liveness_score = liveness_score
            cached.last_recognized_frame = frame_idx
            cached.last_recognized_timestamp = now
            cached.last_seen_frame = frame_idx
            cached.last_seen_timestamp = now
        return cached

    def touch(self, track_id: int, frame_idx: int) -> None:
        """Updates last_seen metadata when cached identity is reused without recognition."""
        cached = self._cache.get(track_id)
        if cached:
            cached.last_seen_frame = frame_idx
            cached.last_seen_timestamp = time.time()
            cached.total_cached_reuses += 1

    def remove(self, track_id: int) -> None:
        self._cache.pop(track_id, None)

    def prune_stale(self, active_track_ids: List[int]) -> None:
        """Removes cache entries for tracks that are no longer tracked by ByteTrack."""
        active_set = set(active_track_ids)
        to_remove = [t_id for t_id in self._cache if t_id not in active_set]
        for t_id in to_remove:
            del self._cache[t_id]

    def clear(self) -> None:
        self._cache.clear()

