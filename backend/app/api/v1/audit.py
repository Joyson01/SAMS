from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from backend.app.core.security import require_roles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.models.classroom import ClassmateMessage, ClassroomPost
from backend.app.models.entities import AuditLog, User
from backend.app.schemas.audit import AuditLogListResponse
from backend.app.services.audit_service import AuditService, record_activity

router = APIRouter(prefix="/audit-logs", tags=["Compliance & Audit Logs"], dependencies=[Depends(require_roles("ADMIN"))])


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List Audit Logs",
    description="Retrieves administrative activity audit logs with filtering by action, entity type, and user ID.",
)
async def list_audit_logs(
    response: Response,
    action: Optional[str] = Query(None, description="Filter by action (e.g., MANUAL_OVERRIDE, CREATE, UPDATE)"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g., AttendanceRecord, Student)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    student_activity: bool = Query(False),
    sign_in_activity: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    response.headers["Cache-Control"] = "no-store"
    items, total = await AuditService.list_audit_logs(
        db=db,
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        page=page,
        page_size=page_size,
        student_activity=student_activity,
        sign_in_activity=sign_in_activity,
    )
    return AuditLogListResponse(
        total_count=total,
        page=page,
        page_size=page_size,
        items=items,
    )


@router.get("/{event_id}/message")
async def read_audited_message(
    event_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN")),
):
    event = await db.get(AuditLog, str(event_id))
    body = None
    if event and (event.action, event.entity_type) == ("STUDENT_SEND_MESSAGE", "ClassmateMessage"):
        body = await db.scalar(select(ClassmateMessage.body).where(ClassmateMessage.id == event.entity_id))
    elif event and (event.action, event.entity_type) == ("STUDENT_SEND_GROUP_MESSAGE", "ClassroomPost"):
        body = await db.scalar(select(ClassroomPost.body).where(
            ClassroomPost.id == event.entity_id, ClassroomPost.kind == "group_message",
        ))
    if body is None:
        raise HTTPException(404, "Message is no longer available for this audit entry.")

    record_activity(db, admin, "VIEW_CHAT_MESSAGE", "AuditLog", str(event_id))
    response.headers["Cache-Control"] = "no-store"
    return {"body": body}
