from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CameraCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64, description="Human-readable camera name")
    location: str = Field(..., min_length=2, max_length=128, description="Classroom / Hall / Entryway location")
    source_type: str = Field("WEBCAM", description="WEBCAM, MOBILE, RTSP")
    device_id: Optional[str] = Field(None, max_length=256, description="Hardware webcam deviceId from enumerateDevices")
    stream_url: Optional[str] = Field(None, max_length=512, description="RTSP URL or device identifier")
    target_fps: int = Field(15, ge=1, le=60)
    resolution: str = Field("1280x720")
    assigned_class: Optional[str] = Field(None, max_length=64, description="Class code for auto-selection (e.g. CSE-4A)")
    detection_zone: Optional[Dict[str, Any]] = Field(None, description="Optional bounding detection zone coordinates")
    is_active: bool = Field(True)

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid = {"WEBCAM", "MOBILE", "RTSP"}
        if v.upper() not in valid:
            raise ValueError(f"Invalid source_type '{v}'. Allowed: {sorted(valid)}")
        return v.upper()


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    source_type: Optional[str] = None
    device_id: Optional[str] = None
    stream_url: Optional[str] = None
    target_fps: Optional[int] = None
    resolution: Optional[str] = None
    assigned_class: Optional[str] = None
    detection_zone: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None


class CameraResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location: str
    source_type: str
    device_id: Optional[str] = None
    stream_url: Optional[str] = None
    status: str = "OFFLINE"  # CONNECTED, STREAMING, RECONNECTING, NO_FRAME, OFFLINE, ERROR
    is_active: bool
    target_fps: int
    resolution: str
    assigned_class: Optional[str] = None
    detection_zone: Optional[Dict[str, Any]] = None
    is_connected: bool = False
    fps: float = 0.0
    seconds_since_last_frame: Optional[float] = None
    last_heartbeat: Optional[datetime] = None
    last_frame_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class CameraTestResult(BaseModel):
    success: bool
    status: str  # CAMERA READY vs CAMERA ERROR
    message: str
    connection: bool = False
    stream: bool = False
    frames: bool = False
    detector: bool = False
    resolution: Optional[str] = None
    fps: float = 0.0
    latency_ms: float = 0.0


class MobilePairingResponse(BaseModel):
    token: str
    camera_id: str
    camera_name: str
    location: str
    source_type: str
    pairing_url: str
    expires_at: datetime
    status: str


class ONVIFDiscoveredCamera(BaseModel):
    name: str
    ip: str
    port: int = 80
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    rtsp_url_hint: str
    is_reachable: bool = True


class ONVIFDiscoveryResponse(BaseModel):
    cameras: List[ONVIFDiscoveredCamera] = []
    scanned_subnet: str
    total_found: int = 0
