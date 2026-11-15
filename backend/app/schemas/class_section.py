from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClassSectionCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64, description="Class name, e.g. TE-B")
    department: str = Field("Computer Engineering", min_length=2, max_length=64, description="Department, e.g. Computer Engineering")
    effective_from: Optional[str] = Field("15/06/2026", max_length=32, description="Effective from date, e.g. 15/06/2026")
    year: Optional[int] = Field(None, ge=1, le=6)
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: str = Field("B", max_length=16)
    academic_year: Optional[str] = Field(None, max_length=32)
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")
    assigned_subject_ids: Optional[List[str]] = Field(default_factory=list, description="List of Subject UUIDs assigned to this class")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip().upper()


class ClassSectionUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    effective_from: Optional[str] = None
    year: Optional[int] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    academic_year: Optional[str] = None
    status: Optional[str] = None
    assigned_subject_ids: Optional[List[str]] = None


class ClassSectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    department: str
    effective_from: Optional[str] = "15/06/2026"
    year: Optional[int] = None
    semester: Optional[int] = None
    section: str
    academic_year: Optional[str] = None
    status: str
    student_count: int = 0
    subject_count: int = 0
    total_curriculum_credits: int = 0
    created_at: datetime
    updated_at: datetime

