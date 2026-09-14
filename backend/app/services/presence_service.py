from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.entities import PresenceEvent, Student


class PresenceState(str, Enum):
    NOT_SEEN = "NOT_SEEN"
    DETECTED = "DETECTED"
    VERIFYING = "VERIFYING"
    PRESENT_AND_VISIBLE = "PRESENT_AND_VISIBLE"
    TEMPORARILY_NOT_VISIBLE = "TEMPORARILY_NOT_VISIBLE"
    NOT_CURRENTLY_VISIBLE = "NOT_CURRENTLY_VISIBLE"


class StudentPresenceDTO(BaseModel):
    student_id: str
    student_name: str
    student_code: str
    roll_number: str
    attendance_status: str  # PRESENT, LATE, ABSENT, etc.
    presence_state: PresenceState
    first_seen: datetime
    last_seen: datetime
    seconds_since_last_seen: float
    confidence: float
    return_count: int
    camera_id: Optional[str] = None


class StudentTrackState:
    def __init__(
        self,
        student_id: str,
        student_name: str,
        student_code: str,
        roll_number: str,
        first_seen: datetime,
        confidence: float,
        camera_id: Optional[str] = None,
    ):
        self.student_id = student_id
        self.student_name = student_name
        self.student_code = student_code
        self.roll_number = roll_number
        self.first_seen = first_seen
        self.last_seen = first_seen
        self.confidence = confidence
        self.camera_id = camera_id
        self.consecutive_frames = 1
        self.is_attendance_marked = False
        self.presence_state = PresenceState.VERIFYING
        self.return_count = 0
        self.total_detections = 1


class PresenceManager:
    """In-memory presence tracking engine maintaining runtime visibility states for active attendance sessions."""

    OCCLUSION_GRACE_SEC = 10.0  # 10s grace period for momentary face obstruction
    PRESENCE_TIMEOUT_SEC = 30.0  # 30s timeout after which student is marked NOT_CURRENTLY_VISIBLE
    MIN_CONSECUTIVE_FRAMES = 2   # Temporal verification: 2 consecutive frames before marking attendance

    def __init__(self):
        # Map: session_id -> { student_id -> StudentTrackState }
        self._sessions: Dict[str, Dict[str, StudentTrackState]] = {}

    def observe_student(
        self,
        session_id: str,
        student: Student,
        confidence: float,
        camera_id: Optional[str] = None,
    ) -> Tuple[PresenceState, bool]:
        """Registers a face observation for a student in an active session.

        Returns:
            Tuple[PresenceState, bool_should_mark_attendance]:
                - PresenceState: current presence state
                - bool_should_mark_attendance: True if and only if this is the FIRST verified appearance
        """
        now = datetime.now(timezone.utc)

        if session_id not in self._sessions:
            self._sessions[session_id] = {}

        session_tracks = self._sessions[session_id]

        if student.id not in session_tracks:
            # First appearance of student in this session
            track = StudentTrackState(
                student_id=student.id,
                student_name=f"{student.first_name} {student.last_name}",
                student_code=student.student_code,
                roll_number=student.roll_number,
                first_seen=now,
                confidence=confidence,
                camera_id=camera_id,
            )
            session_tracks[student.id] = track

            # If threshold is 1 frame or lower, confirm immediately; else require verification
            if self.MIN_CONSECUTIVE_FRAMES <= 1:
                track.presence_state = PresenceState.PRESENT_AND_VISIBLE
                track.is_attendance_marked = True
                return PresenceState.PRESENT_AND_VISIBLE, True

            track.presence_state = PresenceState.VERIFYING
            return PresenceState.VERIFYING, False

        track = session_tracks[student.id]
        track.last_seen = now
        track.confidence = max(track.confidence, confidence)
        track.total_detections += 1
        track.camera_id = camera_id

        # Check if returning from absence or temporary occlusion
        if track.presence_state in [PresenceState.NOT_CURRENTLY_VISIBLE, PresenceState.TEMPORARILY_NOT_VISIBLE]:
            track.presence_state = PresenceState.PRESENT_AND_VISIBLE
            track.return_count += 1
            # Already marked previously, do NOT mark again
            return PresenceState.PRESENT_AND_VISIBLE, False

        track.consecutive_frames += 1

        # Check if passing temporal verification threshold for the first time
        if not track.is_attendance_marked and track.consecutive_frames >= self.MIN_CONSECUTIVE_FRAMES:
            track.is_attendance_marked = True
            track.presence_state = PresenceState.PRESENT_AND_VISIBLE
            return PresenceState.PRESENT_AND_VISIBLE, True

        track.presence_state = PresenceState.PRESENT_AND_VISIBLE
        return PresenceState.PRESENT_AND_VISIBLE, False

    def remove_student(self, session_id: str, student_id: str) -> bool:
        """Removes a student from active presence tracking (e.g. when manually marked absent)."""
        if session_id in self._sessions and student_id in self._sessions[session_id]:
            del self._sessions[session_id][student_id]
            return True
        return False

    def mark_student_present(
        self,
        session_id: str,
        student: Student,
        camera_id: Optional[str] = None,
    ) -> None:
        """Explicitly adds or confirms a student in presence tracking (e.g. manual present)."""
        now = datetime.now(timezone.utc)
        if session_id not in self._sessions:
            self._sessions[session_id] = {}
        track = self._sessions[session_id].get(student.id)
        if not track:
            track = StudentTrackState(
                student_id=student.id,
                student_name=f"{student.first_name} {student.last_name}",
                student_code=student.student_code,
                roll_number=student.roll_number,
                first_seen=now,
                confidence=1.0,
                camera_id=camera_id,
            )
            self._sessions[session_id][student.id] = track
        track.is_attendance_marked = True
        track.presence_state = PresenceState.PRESENT_AND_VISIBLE
        track.last_seen = now

    def get_session_presence(self, session_id: str) -> List[StudentPresenceDTO]:
        """Computes live presence states for all students observed in a session."""
        now = datetime.now(timezone.utc)
        if session_id not in self._sessions:
            return []

        session_tracks = self._sessions[session_id]
        results: List[StudentPresenceDTO] = []

        for track in session_tracks.values():
            elapsed = (now - track.last_seen).total_seconds()

            # Dynamic state transition based on elapsed time
            if elapsed > self.PRESENCE_TIMEOUT_SEC:
                state = PresenceState.NOT_CURRENTLY_VISIBLE
            elif elapsed > self.OCCLUSION_GRACE_SEC:
                state = PresenceState.TEMPORARILY_NOT_VISIBLE
            else:
                state = PresenceState.PRESENT_AND_VISIBLE

            track.presence_state = state

            results.append(
                StudentPresenceDTO(
                    student_id=track.student_id,
                    student_name=track.student_name,
                    student_code=track.student_code,
                    roll_number=track.roll_number,
                    attendance_status="PRESENT" if track.is_attendance_marked else "VERIFYING",
                    presence_state=state,
                    first_seen=track.first_seen,
                    last_seen=track.last_seen,
                    seconds_since_last_seen=round(elapsed, 1),
                    confidence=track.confidence,
                    return_count=track.return_count,
                    camera_id=track.camera_id,
                )
            )

        # Sort: Visible first, then by last_seen descending
        results.sort(key=lambda s: (s.presence_state != PresenceState.PRESENT_AND_VISIBLE, -s.last_seen.timestamp()))
        return results

    def reset_session(self, session_id: str) -> None:
        """Cleans up session tracking when session is closed."""
        self._sessions.pop(session_id, None)


# Global singleton instance
presence_manager = PresenceManager()

