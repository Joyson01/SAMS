from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DashboardSummaryMetrics(BaseModel):
    total_students: int = 0
    enrolled_students: int = 0
    pending_enrollment: int = 0
    present_today: int = 0
    absent_today: int = 0
    late_today: int = 0
    excused_today: int = 0
    attendance_rate_pct: float = 0.0


class DashboardActiveSession(BaseModel):
    id: str
    session_code: str
    subject: str
    class_name: str
    room: str
    scheduled_date: date
    start_time: str
    end_time: str
    elapsed_minutes: int
    camera_name: Optional[str] = None
    present_count: int = 0
    absent_count: int = 0
    total_roster_count: int = 0
    status: str = "ACTIVE"


class DashboardSessionItem(BaseModel):
    id: str
    session_code: str
    subject: str
    class_name: str
    room: str
    scheduled_date: date
    start_time: str
    end_time: str
    present_count: int = 0
    absent_count: int = 0
    late_count: int = 0
    excused_count: int = 0
    total_records: int = 0
    total_roster_count: int = 0
    status: str


class DashboardTrendItem(BaseModel):
    record_date: date
    day_label: str
    present_count: int = 0
    absent_count: int = 0
    late_count: int = 0
    attendance_pct: float = 0.0


class DashboardCameraItem(BaseModel):
    id: str
    name: str
    location: str
    source_type: str
    status: str  # STREAMING, CONNECTED, NO_FRAME, OFFLINE
    last_frame_seconds_ago: Optional[int] = None
    last_frame_at: Optional[datetime] = None


class DashboardActivityItem(BaseModel):
    id: str
    event_type: str  # ATTENDANCE, SESSION, CAMERA, UNKNOWN_FACE, ENROLLMENT
    title: str
    subtitle: str
    timestamp: datetime
    time_ago: str
    meta: Optional[Dict[str, Any]] = None


class DashboardExceptionItem(BaseModel):
    type: str  # UNENROLLED_STUDENTS, OFFLINE_CAMERA, LOW_CONFIDENCE, SESSION_REVIEW
    title: str
    description: str
    severity: str  # warning, danger, info
    action_tab: Optional[str] = None
    count: int = 0


class DashboardSummaryResponse(BaseModel):
    summary: DashboardSummaryMetrics
    active_session: Optional[DashboardActiveSession] = None
    upcoming_sessions: List[DashboardSessionItem] = Field(default_factory=list)
    today_sessions: List[DashboardSessionItem] = Field(default_factory=list)
    attendance_trend: List[DashboardTrendItem] = Field(default_factory=list)
    cameras: List[DashboardCameraItem] = Field(default_factory=list)
    recent_activities: List[DashboardActivityItem] = Field(default_factory=list)
    exceptions: List[DashboardExceptionItem] = Field(default_factory=list)
    server_time: datetime = Field(default_factory=lambda: datetime.now())
