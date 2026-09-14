from datetime import date, datetime, time
import os
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SessionCreate(BaseModel):
    session_code: Optional[str] = Field(None, description="Unique session code (auto-generated if empty)")
    timetable_entry_id: Optional[str] = Field(None, description="UUID of the originating timetable slot if scheduled from timetable")
    subject_id: Optional[str] = Field(None, description="UUID of the academic Subject")
    class_id: Optional[str] = Field(None, description="UUID of the academic ClassSection")
    class_name: str = Field(..., min_length=1, max_length=64, description="Target class/batch (e.g. TE-B)")
    subject: str = Field(..., min_length=1, max_length=128, description="Course or subject name / timetable label")
    room: str = Field(..., min_length=1, max_length=32, description="Classroom or hall number")
    scheduled_date: Optional[date] = Field(default_factory=date.today)
    start_time: time
    end_time: time
    late_threshold_minutes: int = Field(10, ge=0, le=60, description="Grace period before marking late arrival")
    attendance_mode: str = Field("AI_FACE_RECOGNITION", description="AI_FACE_RECOGNITION or MANUAL")
    camera_id: Optional[str] = Field(None, description="Assigned camera identifier")
    camera_ids: List[str] = Field(default_factory=list)

    @field_validator("class_name", "subject", "room", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class SessionUpdate(BaseModel):
    timetable_entry_id: Optional[str] = None
    subject_id: Optional[str] = None
    class_id: Optional[str] = None
    subject: Optional[str] = None
    class_name: Optional[str] = None
    room: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    late_threshold_minutes: Optional[int] = None
    attendance_mode: Optional[str] = None
    camera_id: Optional[str] = None
    status: Optional[str] = None  # SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED
    camera_ids: Optional[List[str]] = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_code: str
    timetable_entry_id: Optional[str] = None
    subject_id: Optional[str] = None
    class_id: Optional[str] = None
    class_name: str
    subject: str
    subject_code: Optional[str] = None
    room: str
    scheduled_date: date
    start_time: time
    end_time: time
    late_threshold_minutes: int = 10
    attendance_mode: str = "AI_FACE_RECOGNITION"
    status: str
    camera_id: Optional[str] = None
    camera_ids: List[str]
    total_records: int = 0
    present_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    excused_count: int = 0
    created_at: datetime
    updated_at: datetime


class AttendanceMarkPayload(BaseModel):
    student_id: str = Field(..., description="UUID of the student")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Recognition confidence score")
    status: Optional[str] = Field(None, description="Optional status override (e.g. PRESENT, ABSENT, LATE, EXCUSED)")
    track_id: Optional[int] = None
    camera_id: Optional[str] = None
    liveness_score: float = Field(1.0, ge=0.0, le=1.0)
    source: str = Field("AI", description="AI or MANUAL")
    verification_metadata: Dict[str, Any] = Field(default_factory=dict)
    remarks: Optional[str] = None


class BatchAttendanceMarkPayload(BaseModel):
    records: List[AttendanceMarkPayload]


class AttendanceRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    student_id: str
    student_name: str
    student_code: str
    roll_number: str
    status: str  # PRESENT, LATE, ABSENT, EXCUSED, MANUAL_PRESENT, MANUAL_ABSENT, MANUAL_EXCUSED
    source: str = "AI"
    confidence: float
    first_seen: datetime
    last_seen: datetime
    track_id: Optional[int]
    liveness_score: float
    remarks: Optional[str]
    created_at: datetime
    updated_at: datetime


class AttendanceOverridePayload(BaseModel):
    status: str = Field(..., description="New status: PRESENT, ABSENT, LATE, EXCUSED, MANUAL_PRESENT, MANUAL_ABSENT, MANUAL_EXCUSED")
    remarks: str = Field(..., min_length=2, description="Explanation for manual override or excused absence")
    modified_by_user_id: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = {"PRESENT", "ABSENT", "LATE", "EXCUSED", "MANUAL_PRESENT", "MANUAL_ABSENT", "MANUAL_EXCUSED"}
        if v.upper() not in valid:
            raise ValueError(f"Invalid attendance status '{v}'. Allowed: {sorted(valid)}")
        return v.upper()


class StudentAttendanceSummary(BaseModel):
    student_id: str
    total_sessions: int
    present_sessions: int
    late_sessions: int
    absent_sessions: int
    excused_sessions: int = 0
    attendance_rate_pct: float
    records: List[AttendanceRecordResponse]


class ClassRosterStudentItem(BaseModel):
    student_id: str
    student_name: str
    student_code: str
    roll_number: str
    attendance_status: str  # PRESENT, LATE, ABSENT, NOT_RECORDED, etc.
    presence_state: str     # PRESENT_AND_VISIBLE, TEMPORARILY_NOT_VISIBLE, NOT_CURRENTLY_VISIBLE, NOT_SEEN, VERIFYING
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    seconds_since_last_seen: Optional[float] = None
    confidence: float = 0.0
    source: str = "AUTO_ROSTER"
    record_id: Optional[str] = None


class SessionRosterResponse(BaseModel):
    session_id: str
    class_name: str
    subject: str
    total_enrolled: int
    present_count: int
    late_count: int
    absent_count: int
    in_frame_count: int
    away_count: int
    attendance_rate_pct: float
    roster: List[ClassRosterStudentItem]
