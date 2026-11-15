from datetime import date, time
import pytest
import uuid

from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.sync import SyncBatchPushRequest, SyncEventPayload
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.student_service import StudentService
from backend.app.services.sync_service import SyncService


@pytest.mark.asyncio
async def test_sync_service_enqueue_and_push_batch(test_db_session):
    # 1. Setup Student & Active Session
    student = await StudentService.create_student(
        test_db_session,
        StudentCreate(
            first_name="Meera",
            last_name="Reddy",
            student_code="STU-MEERA",
            roll_number="CSE-501",
            department="CSE",
            class_name="CSE-4A",
            section="A",
            email="meera@campus.edu",
        ),
    )
    session = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            session_code="SESS-SYNC-01",
            class_name="CSE-4A",
            subject="Embedded AI",
            room="Room-301",
            scheduled_date=date.today(),
            start_time=time(23, 0),
            end_time=time(23, 59),
        ),
    )
    await AttendanceService.start_session(test_db_session, session.id)

    # 2. Test Enqueue Event
    evt_uuid = str(uuid.uuid4())
    item = await SyncService.enqueue_event(
        test_db_session,
        event_type="ATTENDANCE_EVENT",
        payload={"session_id": session.id, "student_id": student.id, "confidence": 0.94},
        event_uuid=evt_uuid,
    )
    assert item.status == "PENDING"
    assert item.event_uuid == evt_uuid

    # 3. Test Process Push Batch from Edge
    push_event_uuid = str(uuid.uuid4())
    batch = SyncBatchPushRequest(
        client_id="jetson-nano-classroom-01",
        events=[
            SyncEventPayload(
                event_uuid=push_event_uuid,
                event_type="ATTENDANCE_EVENT",
                payload={"session_id": session.id, "student_id": student.id, "confidence": 0.91},
            )
        ],
    )
    push_res = await SyncService.process_push_batch(test_db_session, batch)
    assert push_res.synced_count == 1
    assert push_res.failed_count == 0

    # 4. Test Idempotency: Send the exact same batch again -> Should count as conflict (already synced)
    dup_res = await SyncService.process_push_batch(test_db_session, batch)
    assert dup_res.conflict_count == 1
    assert dup_res.synced_count == 0

    # 5. Test Delta Updates
    delta = await SyncService.get_delta_updates(test_db_session)
    assert len(delta.students) >= 1
    assert len(delta.sessions) >= 1

    # 6. Test Queue Status & Flush
    status = await SyncService.get_sync_queue_status(test_db_session)
    assert status.pending_count >= 1

    flushed = await SyncService.flush_pending_queue(test_db_session)
    assert flushed >= 1

    status_after = await SyncService.get_sync_queue_status(test_db_session)
    assert status_after.pending_count == 0

