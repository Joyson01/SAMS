from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SyncEventPayload(BaseModel):
    event_uuid: str = Field(..., description="Unique deterministic idempotency UUID")
    event_type: str = Field(..., description="ATTENDANCE_EVENT, STUDENT_EVENT, FACE_PROFILE_EVENT")
    payload: Dict[str, Any] = Field(..., description="Payload data")
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))


class SyncBatchPushRequest(BaseModel):
    client_id: str = Field("edge-node-01", description="Identifier of the edge device")
    events: List[SyncEventPayload]


class SyncBatchPushResponse(BaseModel):
    synced_count: int
    conflict_count: int
    failed_count: int
    errors: List[str] = Field(default_factory=list)


class SyncPullDeltaResponse(BaseModel):
    server_time: datetime
    students: List[Dict[str, Any]]
    face_profiles: List[Dict[str, Any]]
    sessions: List[Dict[str, Any]]


class SyncQueueStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_online: bool = True
    pending_count: int
    synced_count: int
    conflict_count: int
    failed_count: int
    last_synced_at: Optional[datetime] = None
