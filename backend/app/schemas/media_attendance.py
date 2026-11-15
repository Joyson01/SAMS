from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class MediaAttendanceItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    student_id: Optional[str] = None
    student_name: str
    student_code: Optional[str] = None
    roll_number: Optional[str] = None
    confidence: float = 0.0
    confidence_pct: float = 0.0
    attendance_status: str = "PRESENT"
    decision: str = "KNOWN"  # KNOWN, UNKNOWN, UNCERTAIN
    status: str = "VERIFIED"  # VERIFIED, VERIFYING, UNKNOWN, LOW_QUALITY
    already_present: bool = False
    alreadyPresent: bool = False
    attendance_marked: bool = True
    attendanceMarked: bool = True
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    observation_count: int = 1
    remarks: Optional[str] = None


class UnresolvedFaceItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    face_id: str
    decision: str = "UNKNOWN"  # UNKNOWN, UNCERTAIN
    status: str = "UNKNOWN"  # UNKNOWN, VERIFYING, LOW_QUALITY
    confidence: float = 0.0
    confidence_pct: float = 0.0
    timestamp_sec: Optional[float] = None
    frame_number: Optional[int] = None
    bbox: List[float] = Field(default_factory=list)
    quality_score: float = 1.0
    rejection_reason: Optional[str] = None


class DetectedMediaFaceItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    face_id: str
    bounding_box: Dict[str, float] = Field(default_factory=dict, description="{x, y, width, height}")
    bbox: List[float] = Field(default_factory=list, description="[x1, y1, x2, y2]")
    detection_confidence: float = 1.0
    quality_score: float = 1.0
    identity: str = "UNKNOWN"
    student_id: Optional[str] = None
    student_code: Optional[str] = None
    roll_number: Optional[str] = None
    recognition_confidence: float = 0.0
    confidence_pct: float = 0.0
    status: str = "UNKNOWN"  # VERIFIED | VERIFYING | UNKNOWN | LOW_QUALITY
    rejection_reason: Optional[str] = None


class MediaAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    job_id: Optional[str] = None
    session_id: str
    session_subject: Optional[str] = None
    session_class: Optional[str] = None
    media_type: str = "IMAGE"  # IMAGE, VIDEO
    filename: str
    duration_sec: Optional[float] = None
    resolution: Optional[str] = None
    faces_detected: int = 0
    facesDetected: int = 0
    recognized_count: int = 0
    studentsRecognized: int = 0
    unknown_count: int = 0
    unknownFaces: List[Dict[str, Any]] = Field(default_factory=list)
    uncertain_count: int = 0
    low_quality_count: int = 0
    attendance_marked_count: int = 0
    attendanceMarked: int = 0
    duplicates_prevented: int = 0
    recognized_students: List[MediaAttendanceItem] = Field(default_factory=list)
    attendanceCandidates: List[Dict[str, Any]] = Field(default_factory=list)
    unresolved_faces: List[UnresolvedFaceItem] = Field(default_factory=list)
    faces: List[DetectedMediaFaceItem] = Field(default_factory=list)
    results: List[Dict[str, Any]] = Field(default_factory=list)
    annotatedImagePath: Optional[str] = None
    annotated_image_url: Optional[str] = None
    processing_time_ms: float = 0.0
    status: str = "COMPLETED"
    message: Optional[str] = None


class MediaJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    session_id: str
    session_subject: Optional[str] = None
    session_class: Optional[str] = None
    media_type: str
    filename: str
    file_size_bytes: Optional[int] = None
    duration_sec: Optional[float] = None
    resolution: Optional[str] = None
    status: str
    progress_pct: float = 0.0
    frames_total: int = 0
    frames_processed: int = 0
    faces_detected_total: int = 0
    recognized_count: int = 0
    unknown_count: int = 0
    uncertain_count: int = 0
    attendance_marked_count: int = 0
    summary_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class SessionBiometricValidationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str
    subject: str
    class_name: str
    status: str
    total_enrolled_students: int
    students_with_face_data: int
    students_missing_face_data: int
    can_process: bool
    warning_message: Optional[str] = None
