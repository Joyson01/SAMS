from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubjectCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32, description="Unique course code, e.g. 24CSPC501C")
    name: str = Field(..., min_length=2, max_length=128, description="Course name, e.g. Theoretical Computer Science")
    short_name: Optional[str] = Field(None, max_length=32, description="Abbreviation, e.g. TCS")
    vertical: Optional[str] = Field(None, max_length=32, description="Vertical track, e.g. PCC, PEC, MDM, OE, VSEC")
    department: str = Field("Computer Engineering", min_length=2, max_length=64, description="Department, e.g. Computer Engineering")
    
    # Contact Hours
    theory_hours: int = Field(0, ge=0, le=20)
    tutorial_hours: int = Field(0, ge=0, le=20)
    practical_hours: int = Field(0, ge=0, le=20)

    # Credits Allotted
    theory_credits: int = Field(0, ge=0, le=20)
    tutorial_credits: int = Field(0, ge=0, le=20)
    practical_credits: int = Field(0, ge=0, le=20)
    credits: int = Field(4, ge=0, le=30, description="Total credits")

    semester: Optional[int] = Field(None, ge=1, le=12)
    academic_year: Optional[str] = Field(None, max_length=32)
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")
    assigned_classes: Optional[List[str]] = Field(default_factory=list, description="Assigned class names, e.g. ['TE-B']")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    vertical: Optional[str] = None
    department: Optional[str] = None
    theory_hours: Optional[int] = None
    tutorial_hours: Optional[int] = None
    practical_hours: Optional[int] = None
    theory_credits: Optional[int] = None
    tutorial_credits: Optional[int] = None
    practical_credits: Optional[int] = None
    credits: Optional[int] = None
    semester: Optional[int] = None
    academic_year: Optional[str] = None
    status: Optional[str] = None
    assigned_classes: Optional[List[str]] = None


class SubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    short_name: Optional[str] = None
    vertical: Optional[str] = None
    department: str
    theory_hours: int = 0
    tutorial_hours: int = 0
    practical_hours: int = 0
    theory_credits: int = 0
    tutorial_credits: int = 0
    practical_credits: int = 0
    credits: int
    semester: Optional[int] = None
    academic_year: Optional[str] = None
    status: str
    assigned_classes: List[str] = []
    total_sessions_count: int = 0
    created_at: datetime
    updated_at: datetime

