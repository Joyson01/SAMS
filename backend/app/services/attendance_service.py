from datetime import date, datetime, time, timedelta, timezone
import os
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import (
    RecordNotFoundError,
    SAMSException,
    SessionAlreadyExistsError,
    SessionConflictError,
    SessionNotActiveError,
    SessionNotFoundError,
    StudentNotFoundError,
)
from backend.app.core.logging import logger
from backend.app.models.entities import AttendanceRecord, AttendanceSession, AuditLog, ClassSection, Student, Subject
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    AttendanceRecordResponse,
    ClassRosterStudentItem,
    SessionCreate,
    SessionResponse,
    SessionRosterResponse,
    SessionUpdate,
    StudentAttendanceSummary,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AttendanceService:
    """Service layer managing academic attendance sessions, subjects, deduplication, and audit trails."""

    @classmethod
    async def create_session(cls, db: AsyncSession, session_in: SessionCreate, creator_user_id: Optional[str] = None) -> AttendanceSession:
        """Creates a new scheduled attendance session with subject/class resolution and conflict checks."""
        subject_name = session_in.subject
        subject_code = None

        # Resolve subject if subject_id provided
        if session_in.subject_id:
            subj = await db.get(Subject, session_in.subject_id)
            if subj:
                subject_name = subj.name
                subject_code = subj.code

        # Resolve class if class_id provided
        class_name = session_in.class_name
        if session_in.class_id:
            cls_obj = await db.get(ClassSection, session_in.class_id)
            if cls_obj:
                class_name = cls_obj.name

        # Auto-generate session code if not provided
        session_code = session_in.session_code
        if not session_code:
            sched_date_str = (session_in.scheduled_date or date.today()).strftime("%Y%m%d")
            clean_cls = class_name.replace(" ", "-")
            session_code = f"SESS-{clean_cls}-{sched_date_str}-{os.urandom(2).hex()}"
        else:
            code_q = select(AttendanceSession).where(AttendanceSession.session_code == session_code)
            existing_code = (await db.execute(code_q)).scalars().first()
            if existing_code:
                raise SessionAlreadyExistsError(session_code)

        # Conflict check: Overlapping session for same class on same date
        existing_conflict_q = select(AttendanceSession).where(
            and_(
                AttendanceSession.class_name == class_name,
                AttendanceSession.scheduled_date == (session_in.scheduled_date or date.today()),
                AttendanceSession.status.in_(["SCHEDULED", "ACTIVE"]),
                or_(
                    and_(
                        AttendanceSession.start_time <= session_in.start_time,
                        AttendanceSession.end_time > session_in.start_time,
                    ),
                    and_(
                        AttendanceSession.start_time < session_in.end_time,
                        AttendanceSession.end_time >= session_in.end_time,
                    ),
                    and_(
                        AttendanceSession.start_time >= session_in.start_time,
                        AttendanceSession.end_time <= session_in.end_time,
                    ),
                ),
            )
        )
        conflicts = (await db.execute(existing_conflict_q)).scalars().all()
        if conflicts:
            logger.warning(f"Session conflict detected for class {class_name} with existing session {conflicts[0].session_code}")
            raise SessionConflictError(
                f"An attendance session already exists for {class_name} at this time slot on {session_in.scheduled_date or date.today()}.",
                existing_session_id=conflicts[0].id,
            )

        session = AttendanceSession(
            session_code=session_code,
            timetable_entry_id=session_in.timetable_entry_id,
            subject_id=session_in.subject_id,
            class_id=session_in.class_id,
            class_name=class_name,
            subject=subject_name,
            room=session_in.room,
            scheduled_date=session_in.scheduled_date or date.today(),
            start_time=session_in.start_time,
            end_time=session_in.end_time,
            late_threshold_minutes=session_in.late_threshold_minutes,
            attendance_mode=session_in.attendance_mode,
            camera_id=session_in.camera_id,
            camera_ids=session_in.camera_ids or ([session_in.camera_id] if session_in.camera_id else []),
            status="SCHEDULED",
            created_by_user_id=creator_user_id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        logger.info(f"Created attendance session: {session.session_code} for {session.class_name} ({session.subject})")
        return session

    @classmethod
    async def get_session_by_id(cls, db: AsyncSession, session_id: str) -> SessionResponse:
        """Retrieves single session with aggregated attendance counts."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        # Compute attendance stats
        stats_q = (
            select(
                AttendanceRecord.status,
                func.count(AttendanceRecord.id),
            )
            .where(AttendanceRecord.session_id == session_id)
            .group_by(AttendanceRecord.status)
        )
        stats_res = await db.execute(stats_q)
        counts = {status_name: cnt for status_name, cnt in stats_res.all()}

        present_cnt = counts.get("PRESENT", 0) + counts.get("MANUAL_PRESENT", 0)
        late_cnt = counts.get("LATE", 0)
        absent_cnt = counts.get("ABSENT", 0) + counts.get("MANUAL_ABSENT", 0)
        excused_cnt = counts.get("EXCUSED", 0) + counts.get("MANUAL_EXCUSED", 0)
        total_cnt = sum(counts.values())

        subject_code = None
        if session.subject_id:
            subj = await db.get(Subject, session.subject_id)
            if subj:
                subject_code = subj.code

        return SessionResponse(
            id=session.id,
            session_code=session.session_code,
            timetable_entry_id=session.timetable_entry_id,
            subject_id=session.subject_id,
            class_id=session.class_id,
            class_name=session.class_name,
            subject=session.subject,
            subject_code=subject_code,
            room=session.room,
            scheduled_date=session.scheduled_date,
            start_time=session.start_time,
            end_time=session.end_time,
            late_threshold_minutes=session.late_threshold_minutes,
            attendance_mode=session.attendance_mode,
            status=session.status,
            camera_id=session.camera_id,
            camera_ids=session.camera_ids or [],
            total_records=total_cnt,
            present_count=present_cnt,
            late_count=late_cnt,
            absent_count=absent_cnt,
            excused_count=excused_cnt,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    @classmethod
    async def list_sessions(
        cls,
        db: AsyncSession,
        class_name: Optional[str] = None,
        subject: Optional[str] = None,
        subject_id: Optional[str] = None,
        status: Optional[str] = None,
        scheduled_date: Optional[date] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[SessionResponse], int]:
        """Lists attendance sessions with filtering and pagination."""
        query = select(AttendanceSession)
        filters = []

        if class_name:
            filters.append(AttendanceSession.class_name == class_name)
        if subject:
            filters.append(AttendanceSession.subject.ilike(f"%{subject}%"))
        if subject_id:
            filters.append(AttendanceSession.subject_id == subject_id)
        if status:
            filters.append(AttendanceSession.status == status.upper())
        if scheduled_date:
            filters.append(AttendanceSession.scheduled_date == scheduled_date)

        if filters:
            query = query.where(and_(*filters))

        count_query = select(func.count(AttendanceSession.id))
        if filters:
            count_query = count_query.where(and_(*filters))
        total_count = (await db.execute(count_query)).scalar_one()

        query = query.order_by(AttendanceSession.scheduled_date.desc(), AttendanceSession.start_time.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        sessions = result.scalars().all()

        if not sessions:
            return [], total_count

        session_ids = [s.id for s in sessions]

        stats_q = (
            select(
                AttendanceRecord.session_id,
                AttendanceRecord.status,
                func.count(AttendanceRecord.id).label('cnt'),
            )
            .where(AttendanceRecord.session_id.in_(session_ids))
            .group_by(AttendanceRecord.session_id, AttendanceRecord.status)
        )
        stats_res = await db.execute(stats_q)

        counts_by_session = {sid: {} for sid in session_ids}
        for sid, status_name, cnt in stats_res.all():
            counts_by_session[sid][status_name] = cnt

        subject_ids = list({s.subject_id for s in sessions if s.subject_id})
        subjects_map = {}
        if subject_ids:
            subj_q = select(Subject.id, Subject.code).where(Subject.id.in_(subject_ids))
            subj_res = await db.execute(subj_q)
            subjects_map = {sid: code for sid, code in subj_res.all()}

        responses = []
        for s in sessions:
            counts = counts_by_session[s.id]
            present_cnt = counts.get("PRESENT", 0) + counts.get("MANUAL_PRESENT", 0)
            late_cnt = counts.get("LATE", 0)
            absent_cnt = counts.get("ABSENT", 0) + counts.get("MANUAL_ABSENT", 0)
            excused_cnt = counts.get("EXCUSED", 0) + counts.get("MANUAL_EXCUSED", 0)
            total_cnt = sum(counts.values())

            subject_code = subjects_map.get(s.subject_id) if s.subject_id else None

            responses.append(SessionResponse(
                id=s.id,
                session_code=s.session_code,
                timetable_entry_id=s.timetable_entry_id,
                subject_id=s.subject_id,
                class_id=s.class_id,
                class_name=s.class_name,
                subject=s.subject,
                subject_code=subject_code,
                room=s.room,
                scheduled_date=s.scheduled_date,
                start_time=s.start_time,
                end_time=s.end_time,
                late_threshold_minutes=s.late_threshold_minutes,
                attendance_mode=s.attendance_mode,
                status=s.status,
                camera_id=s.camera_id,
                camera_ids=s.camera_ids or [],
                total_records=total_cnt,
                present_count=present_cnt,
                late_count=late_cnt,
                absent_count=absent_cnt,
                excused_count=excused_cnt,
                created_at=s.created_at,
                updated_at=s.updated_at,
            ))

        return responses, total_count

    @classmethod
    async def start_session(cls, db: AsyncSession, session_id: str) -> SessionResponse:
        """Starts an attendance session, setting its status to ACTIVE."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        session.status = "ACTIVE"
        await db.commit()
        await db.refresh(session)
        logger.info(f"Started attendance session: {session.session_code}")
        return await cls.get_session_by_id(db, session_id)

    @classmethod
    async def close_session(cls, db: AsyncSession, session_id: str, auto_mark_absent: bool = True) -> SessionResponse:
        """Closes an attendance session (COMPLETED) and auto-marks remaining class students as ABSENT."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        session.status = "COMPLETED"

        if auto_mark_absent:
            # Query all active students enrolled in this class
            students_q = select(Student).where(
                and_(
                    Student.class_name == session.class_name,
                    Student.status == "ACTIVE",
                )
            )
            students_res = await db.execute(students_q)
            class_students = students_res.scalars().all()

            # Query student IDs who already have records
            existing_records_q = select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session_id)
            existing_res = await db.execute(existing_records_q)
            marked_student_ids = set(existing_res.scalars().all())

            # Auto-mark unrecorded students as ABSENT
            for st in class_students:
                if st.id not in marked_student_ids:
                    absent_record = AttendanceRecord(
                        session_id=session_id,
                        student_id=st.id,
                        status="ABSENT",
                        source="AUTO_ROSTER",
                        confidence=0.0,
                        liveness_score=0.0,
                        verification_metadata={"source": "AUTO_ABSENT_ON_CLOSE"},
                        remarks="Absent (Not detected during session)",
                    )
                    db.add(absent_record)

        await db.commit()
        await db.refresh(session)

        # Cleanup runtime presence tracker
        from backend.app.services.presence_service import presence_manager
        presence_manager.reset_session(session_id)

        logger.info(f"Closed attendance session: {session.session_code}")
        return await cls.get_session_by_id(db, session_id)

    @classmethod
    async def mark_attendance(
        cls,
        db: AsyncSession,
        session_id: str,
        payload: AttendanceMarkPayload,
        allow_non_active: bool = False,
    ) -> AttendanceRecordResponse:
        """Marks attendance ONCE per student+session with strict 3-level duplicate protection and presence tracking."""
        from sqlalchemy.exc import IntegrityError
        from backend.app.services.presence_service import presence_manager

        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        if not allow_non_active and session.status != "ACTIVE":
            raise SessionNotActiveError(session_id, session.status)

        student = await db.get(Student, payload.student_id)
        if not student:
            raise StudentNotFoundError(payload.student_id)

        now = _utc_now()

        # Update in-memory Presence Manager
        presence_state, is_first_verified = presence_manager.observe_student(
            session_id=session_id,
            student=student,
            confidence=payload.confidence,
            camera_id=payload.camera_id,
        )

        # Determine assigned status: explicit payload override OR auto PRESENT/LATE based on scheduled time
        if payload.status:
            assigned_status = payload.status.upper()
        else:
            assigned_status = "PRESENT"
            grace_min = session.late_threshold_minutes or 10
            scheduled_start = datetime.combine(session.scheduled_date, session.start_time, tzinfo=timezone.utc)
            if now > (scheduled_start + timedelta(minutes=grace_min)):
                assigned_status = "LATE"

        # Level 1 Duplicate Check: Query existing record for this (session, student)
        query = (
            select(AttendanceRecord)
            .where(
                and_(
                    AttendanceRecord.session_id == session_id,
                    AttendanceRecord.student_id == payload.student_id,
                )
            )
            .options(selectinload(AttendanceRecord.student))
        )
        existing = (await db.execute(query)).scalars().first()

        if existing:
            # Auto-recovery: If previously marked ABSENT, NOT_DETECTED, or REVIEW_REQUIRED, upgrade to PRESENT/LATE
            if existing.status in ["ABSENT", "MANUAL_ABSENT", "NOT_DETECTED", "REVIEW_REQUIRED"]:
                existing.status = assigned_status
                existing.first_seen = now
                existing.source = payload.source or "AI"
                existing.confidence = payload.confidence
                existing.remarks = payload.remarks or f"Recovered from {existing.status} to {assigned_status}"
                logger.info(f"[STATE RECOVERY] Student {student.student_code} recovered from ABSENT to {assigned_status}")
            elif payload.status:
                existing.status = assigned_status
                if payload.remarks:
                    existing.remarks = payload.remarks
                if payload.source:
                    existing.source = payload.source
            else:
                if payload.confidence > existing.confidence:
                    existing.confidence = payload.confidence

            existing.last_seen = now
            if payload.track_id:
                existing.track_id = payload.track_id
            if payload.camera_id:
                existing.camera_id = payload.camera_id

            await db.commit()
            await db.refresh(existing)
            if assigned_status in ["ABSENT", "MANUAL_ABSENT"]:
                presence_manager.remove_student(session_id, payload.student_id)
            else:
                presence_manager.mark_student_present(session_id, student, payload.camera_id)
            logger.info(f"[PRESENCE TRACKING] Updated last_seen for {student.student_code} ({presence_state})")
            return cls._serialize_record(existing, student)

        # Level 2 & 3: Atomic insertion with unique constraint fallback
        try:
            new_record = AttendanceRecord(
                session_id=session_id,
                student_id=payload.student_id,
                status=assigned_status,
                source=payload.source or "AI",
                first_seen=now,
                last_seen=now,
                confidence=payload.confidence,
                track_id=payload.track_id,
                camera_id=payload.camera_id,
                liveness_score=payload.liveness_score,
                verification_metadata=payload.verification_metadata,
                remarks=payload.remarks or f"Marked via {assigned_status}",
            )
            db.add(new_record)
            await db.commit()
            await db.refresh(new_record)

            if assigned_status in ["ABSENT", "MANUAL_ABSENT"]:
                presence_manager.remove_student(session_id, payload.student_id)
            else:
                presence_manager.mark_student_present(session_id, student, payload.camera_id)
            logger.info(f"[FIRST VERIFIED] Marked attendance ONCE: {student.student_code} ({student.first_name} {student.last_name}) as {assigned_status}")
            return cls._serialize_record(new_record, student)
        except IntegrityError:
            # Concurrent duplicate caught by database unique constraint
            await db.rollback()
            existing_after_race = (await db.execute(query)).scalars().first()
            if existing_after_race:
                if existing_after_race.status in ["ABSENT", "MANUAL_ABSENT", "NOT_DETECTED", "REVIEW_REQUIRED"]:
                    existing_after_race.status = assigned_status
                    existing_after_race.first_seen = now
                    existing_after_race.source = payload.source or "AI"
                    existing_after_race.confidence = payload.confidence
                    existing_after_race.remarks = payload.remarks or f"Recovered from {existing_after_race.status} to {assigned_status}"
                existing_after_race.last_seen = now
                if payload.confidence > existing_after_race.confidence:
                    existing_after_race.confidence = payload.confidence
                await db.commit()
                return cls._serialize_record(existing_after_race, student)
            raise

    @classmethod
    async def override_record(
        cls,
        db: AsyncSession,
        record_id: str,
        override_in: AttendanceOverridePayload,
        user_id: Optional[str] = None,
    ) -> AttendanceRecordResponse:
        """Manually corrects attendance record (PRESENT, ABSENT, LATE, EXCUSED) with audit trail logging."""
        record = await db.get(AttendanceRecord, record_id)
        if not record:
            raise RecordNotFoundError(record_id)

        student = await db.get(Student, record.student_id)
        if not student:
            raise SAMSException("Student associated with this record not found.", status_code=404)

        old_status = record.status
        new_status = override_in.status

        # Update record
        record.status = new_status
        record.source = "MANUAL"
        record.remarks = f"Manual override: {override_in.remarks}"
        record.marked_by_user_id = user_id or override_in.modified_by_user_id
        record.updated_at = _utc_now()

        # Create Audit Log Entry
        audit = AuditLog(
            user_id=user_id or override_in.modified_by_user_id,
            action="MANUAL_OVERRIDE",
            entity_type="AttendanceRecord",
            entity_id=record_id,
            old_values={"status": old_status},
            new_values={"status": new_status, "remarks": override_in.remarks},
        )
        db.add(audit)

        await db.commit()
        await db.refresh(record)
        logger.info(f"Manual override for record {record_id}: {old_status} -> {new_status} ({override_in.remarks})")
        return cls._serialize_record(record, student)

    @classmethod
    async def mark_manual_attendance(
        cls,
        db: AsyncSession,
        session_id: str,
        student_id: str,
        status: str,
        remarks: str = "Manual Attendance",
        user_id: Optional[str] = None,
    ) -> AttendanceRecordResponse:
        """Directly marks manual attendance for a student (e.g. excused absence or manual roll-call)."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        student = await db.get(Student, student_id)
        if not student:
            raise StudentNotFoundError(student_id)

        now = _utc_now()
        query = select(AttendanceRecord).where(
            and_(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == student_id,
            )
        )
        existing = (await db.execute(query)).scalars().first()

        if existing:
            existing.status = status
            existing.source = "MANUAL"
            existing.remarks = remarks
            existing.marked_by_user_id = user_id
            existing.updated_at = now
            await db.commit()
            await db.refresh(existing)

            # Synchronize with PresenceManager
            from backend.app.services.presence_service import presence_manager
            if status.upper() in ["ABSENT", "MANUAL_ABSENT"]:
                presence_manager.remove_student(session_id, student_id)
            elif status.upper() in ["PRESENT", "LATE", "MANUAL_PRESENT"]:
                presence_manager.mark_student_present(session_id, student)

            return cls._serialize_record(existing, student)

        new_rec = AttendanceRecord(
            session_id=session_id,
            student_id=student_id,
            status=status,
            source="MANUAL",
            first_seen=now,
            last_seen=now,
            confidence=1.0,
            remarks=remarks,
            marked_by_user_id=user_id,
        )
        db.add(new_rec)
        await db.commit()
        await db.refresh(new_rec)

        # Synchronize with PresenceManager
        from backend.app.services.presence_service import presence_manager
        if status.upper() in ["ABSENT", "MANUAL_ABSENT"]:
            presence_manager.remove_student(session_id, student_id)
        elif status.upper() in ["PRESENT", "LATE", "MANUAL_PRESENT"]:
            presence_manager.mark_student_present(session_id, student)

        return cls._serialize_record(new_rec, student)

    @classmethod
    async def get_session_roster(
        cls,
        db: AsyncSession,
        session_id: str,
    ) -> SessionRosterResponse:
        """Retrieves the complete class roster for a session, merging enrolled students,
        authoritative attendance records, and live runtime presence tracking data.
        """
        from backend.app.services.presence_service import presence_manager

        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        # 1. Fetch all active students enrolled in this session's class
        students_q = (
            select(Student)
            .where(
                and_(
                    Student.class_name == session.class_name,
                    Student.status == "ACTIVE",
                )
            )
            .order_by(Student.roll_number.asc(), Student.first_name.asc())
        )
        students = (await db.execute(students_q)).scalars().all()

        # 2. Fetch existing attendance records for this session
        records_q = (
            select(AttendanceRecord)
            .where(AttendanceRecord.session_id == session_id)
        )
        records = (await db.execute(records_q)).scalars().all()
        records_by_student = {r.student_id: r for r in records}

        # 3. Fetch runtime presence states
        presence_items = presence_manager.get_session_presence(session_id)
        presence_by_student = {p.student_id: p for p in presence_items}

        roster_items: List[ClassRosterStudentItem] = []
        present_count = 0
        late_count = 0
        absent_count = 0
        in_frame_count = 0
        away_count = 0

        for st in students:
            rec = records_by_student.get(st.id)
            pres = presence_by_student.get(st.id)

            # Determine attendance status
            if rec:
                att_status = rec.status
                first_seen = rec.first_seen
                last_seen = rec.last_seen
                confidence = rec.confidence
                source = rec.source or "AI"
                record_id = rec.id
            else:
                att_status = "NOT_RECORDED"
                first_seen = pres.first_seen if pres else None
                last_seen = pres.last_seen if pres else None
                confidence = pres.confidence if pres else 0.0
                source = "AUTO_ROSTER"
                record_id = None

            # Determine presence state
            if pres:
                pres_state = pres.presence_state.value
                sec_since = pres.seconds_since_last_seen
            else:
                pres_state = "NOT_SEEN"
                sec_since = None

            if pres_state == "PRESENT_AND_VISIBLE":
                in_frame_count += 1
            elif pres_state in ["TEMPORARILY_NOT_VISIBLE", "NOT_CURRENTLY_VISIBLE", "NOT_SEEN"]:
                away_count += 1

            if att_status in ["PRESENT", "MANUAL_PRESENT"]:
                present_count += 1
            elif att_status in ["LATE", "MANUAL_LATE"]:
                late_count += 1
            else:
                absent_count += 1

            roster_items.append(
                ClassRosterStudentItem(
                    student_id=st.id,
                    student_name=f"{st.first_name} {st.last_name}".strip(),
                    student_code=st.student_code or "N/A",
                    roll_number=st.roll_number or "N/A",
                    attendance_status=att_status,
                    presence_state=pres_state,
                    first_seen=first_seen,
                    last_seen=last_seen,
                    seconds_since_last_seen=sec_since,
                    confidence=confidence,
                    source=source,
                    record_id=record_id,
                )
            )

        total_enrolled = len(students)
        attendance_rate = (
            round((present_count + late_count) / total_enrolled * 100.0, 1)
            if total_enrolled > 0
            else 0.0
        )

        return SessionRosterResponse(
            session_id=session.id,
            class_name=session.class_name,
            subject=session.subject,
            total_enrolled=total_enrolled,
            present_count=present_count,
            late_count=late_count,
            absent_count=absent_count,
            in_frame_count=in_frame_count,
            away_count=away_count,
            attendance_rate_pct=attendance_rate,
            roster=roster_items,
        )

    @classmethod
    async def get_session_records(
        cls,
        db: AsyncSession,
        session_id: str,
        status: Optional[str] = None,
    ) -> List[AttendanceRecordResponse]:
        """Retrieves all attendance records for a session."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        query = (
            select(AttendanceRecord)
            .where(AttendanceRecord.session_id == session_id)
            .options(selectinload(AttendanceRecord.student))
        )
        if status:
            query = query.where(AttendanceRecord.status == status.upper())

        query = query.order_by(AttendanceRecord.first_seen.asc())
        records = (await db.execute(query)).scalars().all()

        return [cls._serialize_record(r, r.student) for r in records]

    @classmethod
    async def get_student_attendance_history(
        cls,
        db: AsyncSession,
        student_id: str,
    ) -> StudentAttendanceSummary:
        """Retrieves historical attendance analytics for a student."""
        student = await db.get(Student, student_id)
        if not student:
            raise SAMSException(f"Student with ID '{student_id}' does not exist.", status_code=404)

        query = (
            select(AttendanceRecord)
            .where(AttendanceRecord.student_id == student_id)
            .order_by(AttendanceRecord.first_seen.desc())
        )
        records = (await db.execute(query)).scalars().all()

        total = len(records)
        present = sum(1 for r in records if r.status in ["PRESENT", "MANUAL_PRESENT"])
        late = sum(1 for r in records if r.status == "LATE")
        absent = sum(1 for r in records if r.status in ["ABSENT", "MANUAL_ABSENT"])
        excused = sum(1 for r in records if r.status in ["EXCUSED", "MANUAL_EXCUSED"])
        rate = round((present + late) / total * 100.0, 1) if total > 0 else 0.0

        record_responses = [cls._serialize_record(r, student) for r in records]

        return StudentAttendanceSummary(
            student_id=student_id,
            total_sessions=total,
            present_sessions=present,
            late_sessions=late,
            absent_sessions=absent,
            excused_sessions=excused,
            attendance_rate_pct=rate,
            records=record_responses,
        )

    @staticmethod
    def _serialize_record(record: AttendanceRecord, student: Student) -> AttendanceRecordResponse:
        return AttendanceRecordResponse(
            id=record.id,
            session_id=record.session_id,
            student_id=record.student_id,
            student_name=f"{student.first_name} {student.last_name}" if student else "Unknown",
            student_code=student.student_code if student else "N/A",
            roll_number=student.roll_number if student else "N/A",
            status=record.status,
            source=record.source or "AI",
            confidence=record.confidence,
            first_seen=record.first_seen,
            last_seen=record.last_seen,
            track_id=record.track_id,
            liveness_score=record.liveness_score,
            remarks=record.remarks,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
