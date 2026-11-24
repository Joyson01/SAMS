from contextvars import ContextVar
from datetime import timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, event, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload
from starlette.types import Scope

from backend.app.core.client_ip import validated_ip
from backend.app.models.entities import AuditLog, User
from backend.app.schemas.audit import AuditLogResponse


audit_client: ContextVar[tuple[str | None, str | None]] = ContextVar("audit_client", default=(None, None))


audit_request: ContextVar[tuple[str, str, Scope] | None] = ContextVar("audit_request", default=None)


def client_metadata(host: str | None, agent: str | None) -> tuple[str | None, str | None]:
    address = validated_ip(host)
    user_agent = "".join(character for character in (agent or "") if character.isprintable()).strip()[:255]
    return address, user_agent or None


@event.listens_for(Session, "before_flush")
def attach_audit_client(session: Session, _context, _instances) -> None:
    address, user_agent = audit_client.get()
    request = audit_request.get()
    if request is None and not address and not user_agent:
        return
    for record in session.new:
        if isinstance(record, AuditLog):
            record.ip_address = record.ip_address or address
            record.user_agent = record.user_agent or user_agent
            if request:
                request_id, method, scope = request
                route = getattr(scope.get("route"), "path", None)
                request_values = {"id": request_id, "method": method}
                if route:
                    request_values["route"] = route
                record.new_values = {**(record.new_values or {}), "_request": request_values}


def record_activity(db: AsyncSession, user: User | None, action: str, entity_type: str, entity_id: str,
                    *, metadata: dict[str, str | int] | None = None) -> None:
    """Add request metadata to the caller's transaction without retaining submitted content."""
    address, user_agent = audit_client.get()
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity_type=entity_type,
                    entity_id=entity_id, new_values=metadata, ip_address=address, user_agent=user_agent))


def record_student_activity(db: AsyncSession, user: User, action: str, entity_type: str, entity_id: str,
                    *, metadata: dict[str, str | int] | None = None) -> None:
    if user.role == "STUDENT":
        record_activity(db, user, f"STUDENT_{action}", entity_type, entity_id, metadata=metadata)


class AuditService:
    """Service managing compliance audit logging, activity tracking, and history search."""

    @classmethod
    async def log_action(
        cls,
        db: AsyncSession,
        action: str,
        entity_type: str,
        entity_id: str,
        user_id: Optional[str] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        """Records an immutable audit trail entry."""
        log_entry = AuditLog(
            user_id=user_id,
            action=action.upper(),
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        return log_entry

    @classmethod
    async def list_audit_logs(
        cls,
        db: AsyncSession,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        student_activity: bool = False,
        sign_in_activity: bool = False,
    ) -> Tuple[List[AuditLogResponse], int]:
        """Lists audit logs with filtering and pagination."""
        query = select(AuditLog).options(selectinload(AuditLog.user))
        filters = []

        if student_activity:
            filters.append(AuditLog.action.startswith("STUDENT_", autoescape=True))

        if sign_in_activity:
            filters.append(AuditLog.action.in_(("SIGN_IN", "STUDENT_SIGN_IN", "SIGN_IN_FAILED", "STUDENT_SIGN_IN_FAILED", "SIGN_OUT", "STUDENT_SIGN_OUT")))

        if action:
            filters.append(AuditLog.action == action.upper())
        if entity_type:
            filters.append(AuditLog.entity_type == entity_type)
        if user_id:
            filters.append(AuditLog.user_id == user_id)

        if filters:
            query = query.where(and_(*filters))

        # Total count
        count_q = select(func.count(AuditLog.id))
        if filters:
            count_q = count_q.where(and_(*filters))
        total_count = (await db.execute(count_q)).scalar_one()

        query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        logs = result.scalars().all()

        responses = [
            AuditLogResponse(
                id=log.id,
                user_id=log.user_id,
                username=log.user.username if log.user else ("Unidentified account" if log.action == "SIGN_IN_FAILED" else "System"),
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                old_values=log.old_values,
                new_values={key: value for key, value in (log.new_values or {}).items() if key != "_request"} or None,
                request_details=(log.new_values or {}).get("_request"),
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at if log.created_at.tzinfo else log.created_at.replace(tzinfo=timezone.utc),
            )
            for log in logs
        ]

        return responses, total_count

