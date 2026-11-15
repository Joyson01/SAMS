from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.entities import AuditLog, User
from backend.app.schemas.audit import AuditLogResponse


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
    ) -> Tuple[List[AuditLogResponse], int]:
        """Lists audit logs with filtering and pagination."""
        query = select(AuditLog).options(selectinload(AuditLog.user))
        filters = []

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

        query = query.order_by(AuditLog.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        logs = result.scalars().all()

        responses = [
            AuditLogResponse(
                id=log.id,
                user_id=log.user_id,
                username=log.user.username if log.user else "System",
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                old_values=log.old_values,
                new_values=log.new_values,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at,
            )
            for log in logs
        ]

        return responses, total_count

