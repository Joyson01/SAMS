from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    total_count: int
    page: int
    page_size: int
    items: List[AuditLogResponse]

