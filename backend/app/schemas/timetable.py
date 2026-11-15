from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TimetableEntryCreate(BaseModel):
    class_id: str = Field(..., description="Target Class Section UUID")
    subject_id: Optional[str] = Field(None, description="Optional associated Subject UUID")
    batch_id: Optional[str] = Field(None, description="Optional Batch UUID")
    day_of_week: str = Field(..., description="Day name, e.g. Monday, Tuesday, Wednesday, Thursday, Friday")
    start_time: str = Field(..., description="Start time slot string, e.g. 09:00")
    end_time: str = Field(..., description="End time slot string, e.g. 10:00")
    entry_type: str = Field("SUBJECT", description="SUBJECT, ACTIVITY, or BREAK")
    label: str = Field(..., description="Timetable cell label, e.g. TCS-DM, LUNCH BREAK, Mentoring")
    batch: Optional[str] = Field(None, description="Batch identifier, e.g. B1, B2, ALL")
    room: Optional[str] = Field(None, description="Room / Lab code, e.g. CR 26, L5, L4")
    effective_from: Optional[str] = Field("15/06/2026", description="Effective date")
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")


class TimetableEntryUpdate(BaseModel):
    subject_id: Optional[str] = None
    batch_id: Optional[str] = None
    day_of_week: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    entry_type: Optional[str] = None
    label: Optional[str] = None
    batch: Optional[str] = None
    room: Optional[str] = None
    effective_from: Optional[str] = None
    status: Optional[str] = None


class TimetableEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    class_id: str
    class_name: Optional[str] = None
    subject_id: Optional[str] = None
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    is_mapped: bool = False
    batch_id: Optional[str] = None
    day_of_week: str
    start_time: str
    end_time: str
    entry_type: str
    label: str
    batch: Optional[str] = None
    room: Optional[str] = None
    effective_from: Optional[str] = "15/06/2026"
    status: str
    has_existing_session: bool = False
    existing_session_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
