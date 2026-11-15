from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class DatabaseHealth(BaseModel):
    status: str = Field(..., description="Database connection status: 'connected' | 'degraded' | 'disconnected'")
    db_type: str = Field(..., description="Active database type (postgresql, sqlite_fallback, etc.)")
    latency_ms: float = Field(..., description="Query response time in milliseconds")
    error: Optional[str] = Field(None, description="Error message if disconnected")


class ServiceHealthResponse(BaseModel):
    status: str = Field("healthy", description="Overall service status: 'healthy' | 'degraded' | 'unhealthy'")
    service_name: str = Field(..., description="Project name")
    version: str = Field(..., description="Semantic version string")
    environment: str = Field(..., description="Runtime environment")
    timestamp: datetime = Field(..., description="Current UTC timestamp")
    database: DatabaseHealth = Field(..., description="Database health metrics")
    system_info: Dict[str, Any] = Field(default_factory=dict, description="Basic system telemetry")

