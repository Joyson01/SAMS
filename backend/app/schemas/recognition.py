from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CandidateDTO(BaseModel):
    student_id: str
    student_code: str
    roll_number: str
    name: str
    similarity: float = Field(..., description="Cosine similarity score in range [-1.0, 1.0]")
    confidence_pct: float = Field(..., description="Normalized confidence percentage (0-100%)")


class DetectedFaceResultDTO(BaseModel):
    face_idx: int
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2, det_score]")
    landmarks: List[List[float]] = Field(..., description="5 fiducial landmark coordinates [[x, y], ...]")
    decision: str = Field(..., description="Decision state: KNOWN | UNKNOWN | UNCERTAIN")
    best_match: Optional[CandidateDTO] = None
    top_candidates: List[CandidateDTO] = []
    sharpness: float
    brightness: float
    is_quality_valid: bool
    pose_type: str
    yaw: float
    pitch: float
    roll: float
    decision_reason: str
    track_id: Optional[int] = None
    status: Optional[str] = Field("VERIFYING", description="VERIFIED | VERIFYING | UNKNOWN | QUALITY_REJECTED")
    provisional_name: Optional[str] = None
    frames_needed: Optional[int] = 0
    confidence_history: Optional[List[float]] = []
    liveness_score: Optional[float] = 1.0
    is_live: Optional[bool] = True


class DetectionDiagnosticDTO(BaseModel):
    raw_count: int = Field(0, description="Raw face candidates detected before NMS")
    nms_count: int = Field(0, description="Detected faces remaining after IoU NMS and sanity filters")
    tracks_count: int = Field(0, description="Active persistent tracks tracked by ByteTrack")
    recognized_count: int = Field(0, description="Faces confirmed with recognized identity")


class RecognitionResponse(BaseModel):
    total_faces_detected: int
    faces: List[DetectedFaceResultDTO]
    latency_breakdown_ms: Dict[str, float]
    thresholds_applied: Dict[str, Any]
    index_student_count: int
    debug_telemetry: Optional[DetectionDiagnosticDTO] = None


class ThresholdsConfig(BaseModel):
    known_threshold: float = Field(0.60, ge=0.0, le=1.0, description="Minimum cosine similarity for KNOWN identity")
    uncertain_threshold: float = Field(0.45, ge=0.0, le=1.0, description="Lower similarity bound below which face is UNKNOWN")
    margin_threshold: float = Field(0.05, ge=0.0, le=0.5, description="Minimum score gap required between top candidate and 2nd candidate")


class AIRecognitionConfig(BaseModel):
    # Recognition Thresholds
    known_threshold: float = Field(0.50, ge=0.30, le=0.95, description="Minimum cosine similarity for VERIFIED identity")
    uncertain_threshold: float = Field(0.35, ge=0.20, le=0.80, description="Medium confidence bound for VERIFYING / POSSIBLE MATCH")
    margin_threshold: float = Field(0.05, ge=0.01, le=0.30, description="Minimum margin between 1st and 2nd top matches")
    
    # Temporal & Tracking
    min_required_frames: int = Field(4, ge=1, le=15, description="Consecutive valid frames needed for temporal confirmation")
    window_size: int = Field(7, ge=3, le=25, description="Sliding window size for multi-frame consensus")
    min_consistency_ratio: float = Field(0.70, ge=0.50, le=1.0, description="Minimum voting consistency ratio")
    tracking_enabled: bool = Field(True, description="Enable ByteTrack multi-target Kalman tracking")
    recognition_interval: int = Field(2, ge=1, le=10, description="Frames between heavy recognition inferences")
    
    # Quality & Filtering
    min_face_size: int = Field(40, ge=20, le=200, description="Minimum width/height in pixels")
    min_sharpness: float = Field(45.0, ge=10.0, le=200.0, description="Laplacian blur variance threshold")
    min_brightness: float = Field(40.0, ge=10.0, le=100.0, description="Minimum illumination")
    max_brightness: float = Field(235.0, ge=150.0, le=255.0, description="Maximum illumination / overexposure")
    max_yaw: float = Field(45.0, ge=15.0, le=75.0, description="Maximum horizontal head turn angle")
    max_pitch: float = Field(35.0, ge=10.0, le=60.0, description="Maximum vertical head tilt angle")
    
    # Liveness / Anti-Spoofing
    liveness_mode: str = Field("BASIC", description="DISABLED | BASIC | STRICT")
    liveness_threshold: float = Field(0.70, ge=0.30, le=0.95, description="Liveness confidence score cutoff")
    
    # Detection
    detection_confidence_threshold: float = Field(0.50, ge=0.20, le=0.90, description="Face detector minimum confidence")
    presence_grace_period_seconds: int = Field(45, ge=5, le=300, description="Seconds before student marked away")

