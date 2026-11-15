import platform
import sys
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.database.session import check_database_connection
from backend.app.schemas.health import DatabaseHealth, ServiceHealthResponse

router = APIRouter(tags=["Health & System"])


@router.get(
    "/health",
    response_model=ServiceHealthResponse,
    summary="System and Database Health Check",
    description="Returns current system status, environment configuration, and database connection latency.",
)
async def get_health_status() -> ServiceHealthResponse:
    db_connected, db_info, latency_ms = await check_database_connection()

    db_health = DatabaseHealth(
        status="connected" if db_connected else "disconnected",
        db_type=db_info if db_connected else "unknown",
        latency_ms=latency_ms,
        error=None if db_connected else db_info,
    )

    overall_status = "healthy" if db_connected else "degraded"

    return ServiceHealthResponse(
        status=overall_status,
        service_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        database=db_health,
        system_info={
            "python_version": sys.version.split()[0],
            "os": platform.system(),
            "platform": platform.platform(),
            "debug": settings.DEBUG,
        },
    )


@router.get("/ping", summary="Quick Liveness Probe")
async def ping() -> Dict[str, str]:
    return {"status": "ok", "message": "pong"}
