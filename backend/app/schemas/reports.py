from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ClassAttendanceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    class_name: str
    department: str
    total_sessions: int
    total_students_enrolled: int
    present_count: int
    late_count: int
    absent_count: int
    avg_attendance_pct: float


class DefaulterStudentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    student_id: str
    student_name: str
    student_code: str
    roll_number: str
    department: str
    class_name: str
    total_sessions: int
    attended_sessions: int
    attendance_pct: float
    is_critical: bool = Field(..., description="True if attendance < 65%")


class DailyAttendanceTrend(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    record_date: date
    total_sessions: int
    present_count: int
    late_count: int
    absent_count: int
    attendance_pct: float


class InstitutionAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    overall_attendance_rate_pct: float
    total_sessions_conducted: int
    total_students_enrolled: int
    defaulter_students_count: int
    perfect_attendance_count: int
    class_breakdowns: List[ClassAttendanceSummary]
    daily_trends: List[DailyAttendanceTrend]
    defaulters: List[DefaulterStudentSummary]

