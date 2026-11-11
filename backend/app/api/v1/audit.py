from typing import Optional
from fastapi import APIRouter, Depends, Query
from backend.app.core.security import get_current_user, require_roles
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.audit import AuditLogListResponse
from backend.app.services.audit_service import AuditService

router = APIRouter(prefix="/audit-logs", tags=["Compliance & Audit Logs"], dependencies=[Depends(require_roles("ADMIN"))])


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List Audit Logs",
    description="Retrieves administrative activity audit logs with filtering by action, entity type, and user ID.",
)
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action (e.g., MANUAL_OVERRIDE, CREATE, UPDATE)"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g., AttendanceRecord, Student)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    items, total = await AuditService.list_audit_logs(
        db=db,
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        page=page,
        page_size=page_size,
    )
    return AuditLogListResponse(
        total_count=total,
        page=page,
        page_size=page_size,
        items=items,
    )

