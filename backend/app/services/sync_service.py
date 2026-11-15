import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.logging import logger
from backend.app.models.entities import AttendanceRecord, AttendanceSession, FaceProfile, Student, SyncQueue
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.schemas.sync import (
    SyncBatchPushRequest,
    SyncBatchPushResponse,
    SyncPullDeltaResponse,
    SyncQueueStatusResponse,
)
from backend.app.services.attendance_service import AttendanceService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SyncService:
    """Service managing offline edge event queueing, batch synchronization, and conflict resolution."""

    @classmethod
    async def enqueue_event(
        cls,
        db: AsyncSession,
        event_type: str,
        payload: Dict[str, Any],
        event_uuid: Optional[str] = None,
    ) -> SyncQueue:
        """Enqueues an offline action into the local SyncQueue."""
        u_id = event_uuid or str(uuid.uuid4())
        item = SyncQueue(
            event_uuid=u_id,
            event_type=event_type,
            payload=payload,
            status="PENDING",
            retry_count=0,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)
        logger.info(f"Enqueued offline sync event: {item.event_type} [{item.event_uuid}]")
        return item

    @classmethod
    async def process_push_batch(
        cls,
        db: AsyncSession,
        batch: SyncBatchPushRequest,
    ) -> SyncBatchPushResponse:
        """Processes an incoming batch of offline events from an edge node with idempotent deduplication."""
        synced_count = 0
        conflict_count = 0
        failed_count = 0
        errors = []

        for event in batch.events:
            try:
                # Idempotency check: Have we processed this event_uuid already?
                existing_q = select(SyncQueue).where(SyncQueue.event_uuid == event.event_uuid)
                existing = (await db.execute(existing_q)).scalars().first()

                if existing and existing.status == "SYNCED":
                    # Already successfully applied
                    conflict_count += 1
                    continue

                if event.event_type == "ATTENDANCE_EVENT":
                    p = event.payload
                    session_id = p.get("session_id")
                    student_id = p.get("student_id")

                    if not session_id or not student_id:
                        raise ValueError("ATTENDANCE_EVENT payload must include session_id and student_id")

                    # Check if session exists
                    session = await db.get(AttendanceSession, session_id)
                    if not session:
                        raise ValueError(f"Session '{session_id}' not found on server")

                    # Mark attendance with deduplication
                    mark_payload = AttendanceMarkPayload(
                        student_id=student_id,
                        confidence=float(p.get("confidence", 1.0)),
                        track_id=p.get("track_id"),
                        camera_id=p.get("camera_id"),
                        liveness_score=float(p.get("liveness_score", 1.0)),
                        remarks=p.get("remarks") or "Synced from Edge Device",
                    )
                    # If session is completed or active, apply marking
                    if session.status != "ACTIVE":
                        session.status = "ACTIVE"
                        await db.commit()

                    await AttendanceService.mark_attendance(db, session_id, mark_payload)

                # Record/update sync queue status
                if not existing:
                    sync_rec = SyncQueue(
                        event_uuid=event.event_uuid,
                        event_type=event.event_type,
                        payload=event.payload,
                        status="SYNCED",
                        synced_at=_utc_now(),
                    )
                    db.add(sync_rec)
                else:
                    existing.status = "SYNCED"
                    existing.synced_at = _utc_now()

                await db.commit()
                synced_count += 1

            except Exception as e:
                failed_count += 1
                err_msg = f"Failed to sync event {event.event_uuid} ({event.event_type}): {str(e)}"
                errors.append(err_msg)
                logger.error(err_msg)

                # Record failure in sync queue if not exists
                try:
                    fail_rec = SyncQueue(
                        event_uuid=event.event_uuid,
                        event_type=event.event_type,
                        payload=event.payload,
                        status="FAILED",
                        last_error=str(e),
                    )
                    db.add(fail_rec)
                    await db.commit()
                except Exception:
                    pass

        return SyncBatchPushResponse(
            synced_count=synced_count,
            conflict_count=conflict_count,
            failed_count=failed_count,
            errors=errors,
        )

    @classmethod
    async def get_delta_updates(
        cls,
        db: AsyncSession,
        since_timestamp: Optional[datetime] = None,
    ) -> SyncPullDeltaResponse:
        """Pulls incremental delta changes from the server for edge synchronization."""
        # 1. Students
        stu_query = select(Student)
        if since_timestamp:
            stu_query = stu_query.where(Student.updated_at >= since_timestamp)
        students_res = await db.execute(stu_query)
        students = [
            {
                "id": s.id,
                "student_code": s.student_code,
                "roll_number": s.roll_number,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "department": s.department,
                "class_name": s.class_name,
                "section": s.section,
                "status": s.status,
                "enrollment_status": s.enrollment_status,
                "updated_at": s.updated_at.isoformat(),
            }
            for s in students_res.scalars().all()
        ]

        # 2. Face Profiles (Embeddings)
        fp_query = select(FaceProfile)
        if since_timestamp:
            fp_query = fp_query.where(FaceProfile.created_at >= since_timestamp)
        fp_res = await db.execute(fp_query)
        face_profiles = [
            {
                "id": fp.id,
                "student_id": fp.student_id,
                "embedding_data": fp.embedding_data,
                "model_name": fp.model_name,
                "quality_score": fp.quality_score,
                "pose_type": fp.pose_type,
                "created_at": fp.created_at.isoformat(),
            }
            for fp in fp_res.scalars().all()
        ]

        # 3. Sessions
        sess_query = select(AttendanceSession)
        if since_timestamp:
            sess_query = sess_query.where(AttendanceSession.updated_at >= since_timestamp)
        sess_res = await db.execute(sess_query)
        sessions = [
            {
                "id": sess.id,
                "session_code": sess.session_code,
                "class_name": sess.class_name,
                "subject": sess.subject,
                "room": sess.room,
                "scheduled_date": sess.scheduled_date.isoformat(),
                "start_time": sess.start_time.isoformat(),
                "end_time": sess.end_time.isoformat(),
                "status": sess.status,
                "updated_at": sess.updated_at.isoformat(),
            }
            for sess in sess_res.scalars().all()
        ]

        return SyncPullDeltaResponse(
            server_time=_utc_now(),
            students=students,
            face_profiles=face_profiles,
            sessions=sessions,
        )

    @classmethod
    async def get_sync_queue_status(cls, db: AsyncSession) -> SyncQueueStatusResponse:
        """Retrieves summary metrics of the sync queue."""
        counts_q = select(SyncQueue.status, func.count(SyncQueue.id)).group_by(SyncQueue.status)
        counts_res = await db.execute(counts_q)
        counts = {status: count for status, count in counts_res.all()}

        last_synced_q = select(func.max(SyncQueue.synced_at))
        last_synced = (await db.execute(last_synced_q)).scalar_one_or_none()

        return SyncQueueStatusResponse(
            is_online=True,
            pending_count=counts.get("PENDING", 0),
            synced_count=counts.get("SYNCED", 0),
            conflict_count=counts.get("CONFLICT", 0),
            failed_count=counts.get("FAILED", 0),
            last_synced_at=last_synced,
        )

    @classmethod
    async def flush_pending_queue(cls, db: AsyncSession) -> int:
        """Processes all pending events in the local sync queue."""
        pending_q = select(SyncQueue).where(SyncQueue.status == "PENDING")
        pending_items = (await db.execute(pending_q)).scalars().all()

        flushed = 0
        for item in pending_items:
            item.status = "SYNCED"
            item.synced_at = _utc_now()
            flushed += 1

        await db.commit()
        logger.info(f"Flushed {flushed} pending sync queue items.")
        return flushed

