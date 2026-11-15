import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class FaceProfileCreate(BaseModel):
    embedding_data: List[float] = Field(..., description="512-dimensional ArcFace unit embedding vector")
    model_name: str = Field("ArcFace-ResNet50", max_length=64)
    model_version: str = Field("1.0.0", max_length=32)
    quality_score: float = Field(1.0, ge=0.0, le=1.0)
    pose_type: str = Field("FRONT", description="FRONT, LEFT_15, RIGHT_15, TILT_UP, TILT_DOWN, GLASSES")
    image_path: Optional[str] = None
    image_hash: Optional[str] = None


class FaceProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    model_name: str
    model_version: str
    quality_score: float
    pose_type: str
    image_path: Optional[str] = None
    created_at: datetime


class StudentBase(BaseModel):
    student_code: str = Field(
        ...,
        min_length=2,
        max_length=32,
        description="Unique identifier code (e.g. STU-2026-001)",
        examples=["STU-2026-001"],
    )
    roll_number: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Class/University roll number (e.g. CSE-2026-42)",
        examples=["CSE-2026-42"],
    )
    first_name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Student's first name",
        examples=["Rahul"],
    )
    last_name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Student's last name",
        examples=["Sharma"],
    )
    email: EmailStr = Field(
        ...,
        description="Institutional or personal email address",
        examples=["rahul.sharma@campus.edu"],
    )
    department: str = Field(
        ...,
        min_length=2,
        max_length=64,
        description="Academic department",
        examples=["Computer Science & Engineering"],
    )
    class_name: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Class or batch name (e.g. CSE-3A)",
        examples=["CSE-3A"],
    )
    section: str = Field(
        "A",
        min_length=1,
        max_length=16,
        description="Section identifier",
        examples=["A"],
    )
    status: str = Field(
        "ACTIVE",
        description="Student status: ACTIVE | INACTIVE | SUSPENDED",
        examples=["ACTIVE"],
    )
    avatar_url: Optional[str] = Field(
        None,
        description="Optional profile image or thumbnail URL",
    )

    @field_validator("student_code", "roll_number", "first_name", "last_name", "department", "class_name", "section")
    @classmethod
    def clean_text(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty or whitespace only.")
        return v.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid_statuses = {"ACTIVE", "INACTIVE", "SUSPENDED"}
        v_upper = v.strip().upper()
        if v_upper not in valid_statuses:
            raise ValueError(f"Invalid status '{v}'. Allowed values: {', '.join(valid_statuses)}")
        return v_upper


class StudentCreate(StudentBase):
    """Schema for registering a new student."""
    pass


class StudentUpdate(BaseModel):
    """Schema for updating an existing student (all fields optional)."""
    student_code: Optional[str] = Field(None, min_length=2, max_length=32)
    roll_number: Optional[str] = Field(None, min_length=1, max_length=32)
    first_name: Optional[str] = Field(None, min_length=1, max_length=64)
    last_name: Optional[str] = Field(None, min_length=1, max_length=64)
    email: Optional[EmailStr] = None
    department: Optional[str] = Field(None, min_length=2, max_length=64)
    class_name: Optional[str] = Field(None, min_length=1, max_length=32)
    section: Optional[str] = Field(None, min_length=1, max_length=16)
    status: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("student_code", "roll_number", "first_name", "last_name", "department", "class_name", "section")
    @classmethod
    def clean_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError("Field cannot be empty or whitespace only.")
            return v.strip()
        return v

    @field_validator("status")
    @classmethod
    def validate_optional_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            valid_statuses = {"ACTIVE", "INACTIVE", "SUSPENDED"}
            v_upper = v.strip().upper()
            if v_upper not in valid_statuses:
                raise ValueError(f"Invalid status '{v}'. Allowed values: {', '.join(valid_statuses)}")
            return v_upper
        return v


class StudentResponse(StudentBase):
    """Full student details response schema."""
    id: str
    enrollment_status: str = Field(
        ...,
        description="Face enrollment status: NOT_ENROLLED | PARTIAL | ENROLLED",
    )
    sample_count: int = Field(0, description="Number of enrolled face samples")
    attendance_rate_pct: Optional[float] = Field(None, description="Pre-calculated overall attendance rate percentage")
    total_sessions: Optional[int] = Field(None, description="Total class sessions recorded for student")
    present_sessions: Optional[int] = Field(None, description="Total sessions student was marked present")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StudentListResponse(BaseModel):
    """Paginated list of students."""
    items: List[StudentResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class StudentStatsResponse(BaseModel):
    """Aggregated student metrics."""
    total_students: int
    enrolled_count: int
    not_enrolled_count: int
    active_count: int
    inactive_count: int
    departments: List[str]
    classes: List[str]
