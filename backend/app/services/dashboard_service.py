from sqlalchemy import case
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Camera,
    RecognitionEvent,
    Student,
)
from backend.app.schemas.dashboard import (
    DashboardActivityItem,
    DashboardActiveSession,
    DashboardCameraItem,
    DashboardExceptionItem,
    DashboardSessionItem,
    DashboardSummaryMetrics,
    DashboardSummaryResponse,
    DashboardTrendItem,
)
from backend.app.services.report_service import ReportService


def normalize_dt(ts: Any) -> datetime:
    if ts is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    return datetime.min.replace(tzinfo=timezone.utc)


def format_time_ago(ts: Any) -> str:
    if not ts:
        return "Unknown"
    norm = normalize_dt(ts)
    if norm == datetime.min.replace(tzinfo=timezone.utc):
        return "Unknown"
    now = datetime.now(timezone.utc)
    delta = max(0, int((now - norm).total_seconds()))
    if delta < 60:
        return "Just now"
    if delta < 3600:
        return f"{delta // 60}m ago"
    if delta < 86400:
        return f"{delta // 3600}h ago"
    return f"{delta // 86400}d ago"


class DashboardService:
    """Service providing consolidated, aggregated real-time dashboard data."""

    @classmethod
    async def get_dashboard_summary(cls, db: AsyncSession) -> DashboardSummaryResponse:
        now_utc = datetime.now(timezone.utc)
        today = date.today()

        # ==========================================
        # 1. STUDENTS METRICS
        # ==========================================
        students_q = select(Student).where(Student.status == "ACTIVE")
        students_res = await db.execute(students_q)
        all_students = students_res.scalars().all()
        total_students = len(all_students)

        enrolled_students = sum(1 for s in all_students if s.enrollment_status == "ENROLLED")
        pending_enrollment = sum(
            1 for s in all_students if s.enrollment_status in ["NOT_ENROLLED", "PARTIAL"]
        )

        # Class roster counts lookup: class_name -> count
        class_roster_counts: Dict[str, int] = {}
        for s in all_students:
            class_roster_counts[s.class_name] = class_roster_counts.get(s.class_name, 0) + 1

        # ==========================================
        # 2. TODAY'S SESSIONS & ATTENDANCE
        # ==========================================
        today_sessions_q = (
            select(AttendanceSession)
            .where(AttendanceSession.scheduled_date == today)
            .order_by(AttendanceSession.start_time.asc())
        )
        today_sessions_res = await db.execute(today_sessions_q)
        today_sessions_entities = today_sessions_res.scalars().all()

        today_session_ids = [s.id for s in today_sessions_entities]
        session_counts_map: Dict[str, Dict[str, int]] = {}
        if today_session_ids:
            counts_q = (
                select(
                    AttendanceRecord.session_id,
                    AttendanceRecord.status,
                    func.count(AttendanceRecord.id),
                )
                .where(AttendanceRecord.session_id.in_(today_session_ids))
                .group_by(AttendanceRecord.session_id, AttendanceRecord.status)
            )
            counts_res = await db.execute(counts_q)
            for sess_id, status_name, cnt in counts_res.all():
                if sess_id not in session_counts_map:
                    session_counts_map[sess_id] = {
                        "present": 0,
                        "late": 0,
                        "absent": 0,
                        "excused": 0,
                        "total": 0,
                    }
                st = status_name.upper()
                if st in ["PRESENT", "MANUAL_PRESENT"]:
                    session_counts_map[sess_id]["present"] += cnt
                elif st == "LATE":
                    session_counts_map[sess_id]["late"] += cnt
                elif st in ["ABSENT", "MANUAL_ABSENT"]:
                    session_counts_map[sess_id]["absent"] += cnt
                elif st in ["EXCUSED", "MANUAL_EXCUSED"]:
                    session_counts_map[sess_id]["excused"] += cnt
                session_counts_map[sess_id]["total"] += cnt

        today_sessions_items: List[DashboardSessionItem] = []
        present_today = 0
        absent_today = 0
        late_today = 0
        excused_today = 0
        total_records_today = 0

        for sess in today_sessions_entities:
            c = session_counts_map.get(
                sess.id, {"present": 0, "late": 0, "absent": 0, "excused": 0, "total": 0}
            )
            p = c["present"]
            a = c["absent"]
            l = c["late"]
            e = c["excused"]
            tot = c["total"]
            roster_tot = class_roster_counts.get(sess.class_name, 0)

            present_today += p
            absent_today += a
            late_today += l
            excused_today += e
            total_records_today += tot

            today_sessions_items.append(
                DashboardSessionItem(
                    id=sess.id,
                    session_code=sess.session_code,
                    subject=sess.subject,
                    class_name=sess.class_name,
                    room=sess.room,
                    scheduled_date=sess.scheduled_date,
                    start_time=sess.start_time.strftime("%H:%M") if sess.start_time else "00:00",
                    end_time=sess.end_time.strftime("%H:%M") if sess.end_time else "00:00",
                    present_count=p,
                    absent_count=a,
                    late_count=l,
                    excused_count=e,
                    total_records=tot,
                    total_roster_count=roster_tot,
                    status=sess.status,
                )
            )

        # Calculate attendance rate
        if total_records_today > 0:
            attendance_rate_pct = round(
                ((present_today + late_today + excused_today) / total_records_today) * 100.0, 1
            )
        else:
            # Fallback to institutional 30-day rate
            analytics = await ReportService.get_institution_analytics(db)
            attendance_rate_pct = analytics.overall_attendance_rate_pct

        summary = DashboardSummaryMetrics(
            total_students=total_students,
            enrolled_students=enrolled_students,
            pending_enrollment=pending_enrollment,
            present_today=present_today,
            absent_today=absent_today,
            late_today=late_today,
            excused_today=excused_today,
            attendance_rate_pct=attendance_rate_pct,
        )

        # ==========================================
        # 3. ACTIVE SESSION (LIVE)
        # ==========================================
        active_sess_q = (
            select(AttendanceSession)
            .where(AttendanceSession.status == "ACTIVE")
            .order_by(AttendanceSession.start_time.desc())
            .limit(1)
        )
        active_sess = (await db.execute(active_sess_q)).scalars().first()
        active_session_dto: Optional[DashboardActiveSession] = None

        if active_sess:
            # Calculate elapsed minutes
            elapsed = 0
            if active_sess.start_time:
                scheduled_start = datetime.combine(
                    active_sess.scheduled_date, active_sess.start_time, tzinfo=timezone.utc
                )
                elapsed = max(0, int((now_utc - scheduled_start).total_seconds() / 60))

            # Fetch camera name if assigned
            cam_name = "Live Attendance Camera"
            if active_sess.camera_id:
                cam = await db.get(Camera, active_sess.camera_id)
                if cam:
                    cam_name = cam.name

            roster_tot = class_roster_counts.get(active_sess.class_name, 0)
            act_counts = session_counts_map.get(
                active_sess.id, {"present": 0, "late": 0, "absent": 0, "excused": 0, "total": 0}
            )
            if active_sess.id not in session_counts_map:
                # Query counts for active session if not in today's list
                act_q = (
                    select(AttendanceRecord.status, func.count(AttendanceRecord.id))
                    .where(AttendanceRecord.session_id == active_sess.id)
                    .group_by(AttendanceRecord.status)
                )
                act_res = await db.execute(act_q)
                for st_name, cnt in act_res.all():
                    st = st_name.upper()
                    if st in ["PRESENT", "MANUAL_PRESENT"]:
                        act_counts["present"] += cnt
                    elif st == "LATE":
                        act_counts["late"] += cnt
                    elif st in ["ABSENT", "MANUAL_ABSENT"]:
                        act_counts["absent"] += cnt
                    elif st in ["EXCUSED", "MANUAL_EXCUSED"]:
                        act_counts["excused"] += cnt
                    act_counts["total"] += cnt

            active_session_dto = DashboardActiveSession(
                id=active_sess.id,
                session_code=active_sess.session_code,
                subject=active_sess.subject,
                class_name=active_sess.class_name,
                room=active_sess.room,
                scheduled_date=active_sess.scheduled_date,
                start_time=active_sess.start_time.strftime("%H:%M") if active_sess.start_time else "00:00",
                end_time=active_sess.end_time.strftime("%H:%M") if active_sess.end_time else "00:00",
                elapsed_minutes=elapsed,
                camera_name=cam_name,
                present_count=act_counts["present"] + act_counts["late"],
                absent_count=act_counts["absent"],
                total_roster_count=roster_tot,
                status="ACTIVE",
            )

        # ==========================================
        # 4. UPCOMING SESSIONS
        # ==========================================
        upcoming_q = (
            select(AttendanceSession)
            .where(
                and_(
                    AttendanceSession.status == "SCHEDULED",
                    AttendanceSession.scheduled_date >= today,
                )
            )
            .order_by(AttendanceSession.scheduled_date.asc(), AttendanceSession.start_time.asc())
            .limit(5)
        )
        upcoming_entities = (await db.execute(upcoming_q)).scalars().all()
        upcoming_sessions: List[DashboardSessionItem] = []
        for u in upcoming_entities:
            upcoming_sessions.append(
                DashboardSessionItem(
                    id=u.id,
                    session_code=u.session_code,
                    subject=u.subject,
                    class_name=u.class_name,
                    room=u.room,
                    scheduled_date=u.scheduled_date,
                    start_time=u.start_time.strftime("%H:%M") if u.start_time else "00:00",
                    end_time=u.end_time.strftime("%H:%M") if u.end_time else "00:00",
                    present_count=0,
                    absent_count=0,
                    late_count=0,
                    excused_count=0,
                    total_records=0,
                    total_roster_count=class_roster_counts.get(u.class_name, 0),
                    status=u.status,
                )
            )

        # ==========================================
        # 5. ATTENDANCE TREND (PAST 14 DAYS)
        # ==========================================
        trend_start = today - timedelta(days=13)
        analytics_trend = await ReportService.get_institution_analytics(
            db, start_date=trend_start, end_date=today
        )

        attendance_trend: List[DashboardTrendItem] = []
        for tr in analytics_trend.daily_trends:
            d_obj = tr.record_date
            day_name = d_obj.strftime("%a")  # e.g. Mon, Tue
            attendance_trend.append(
                DashboardTrendItem(
                    record_date=d_obj,
                    day_label=day_name,
                    present_count=tr.present_count,
                    absent_count=tr.absent_count,
                    late_count=tr.late_count,
                    attendance_pct=tr.attendance_pct,
                )
            )

        # ==========================================
        # 6. CAMERA STATUSES
        # ==========================================
        cameras_q = select(Camera).where(Camera.is_active == True).order_by(Camera.name.asc())
        cameras_entities = (await db.execute(cameras_q)).scalars().all()
        camera_items: List[DashboardCameraItem] = []
        offline_cams = 0

        for cam in cameras_entities:
            # Dynamic status evaluation based on last frame
            last_sec = None
            calc_status = cam.status
            if cam.last_frame_at:
                c_ts = cam.last_frame_at
                if c_ts.tzinfo is None:
                    c_ts = c_ts.replace(tzinfo=timezone.utc)
                last_sec = max(0, int((now_utc - c_ts).total_seconds()))

                if last_sec < 15:
                    calc_status = "STREAMING"
                elif last_sec < 60:
                    calc_status = "CONNECTED"
                elif last_sec < 180:
                    calc_status = "NO_FRAME"
                else:
                    calc_status = "OFFLINE"
            else:
                calc_status = "OFFLINE"

            if calc_status in ["OFFLINE", "ERROR"]:
                offline_cams += 1

            camera_items.append(
                DashboardCameraItem(
                    id=cam.id,
                    name=cam.name,
                    location=cam.location,
                    source_type=cam.source_type,
                    status=calc_status,
                    last_frame_seconds_ago=last_sec,
                    last_frame_at=cam.last_frame_at,
                )
            )

        # ==========================================
        # 7. RECENT ACTIVITY (REAL AUDIT & SESSIONS)
        # ==========================================
        recent_activities: List[DashboardActivityItem] = []

        # 7a. Recent Attendance Records
        recent_rec_q = (
            select(AttendanceRecord)
            .options(selectinload(AttendanceRecord.student), selectinload(AttendanceRecord.session))
            .order_by(AttendanceRecord.last_seen.desc())
            .limit(6)
        )
        recent_recs = (await db.execute(recent_rec_q)).scalars().all()
        for r in recent_recs:
            st_name = f"{r.student.first_name} {r.student.last_name}" if r.student else "Student"
            sess_name = r.session.subject if r.session else "Class Session"
            status_clean = r.status.replace("MANUAL_", "")
            recent_activities.append(
                DashboardActivityItem(
                    id=f"rec-{r.id}",
                    event_type="ATTENDANCE",
                    title=f"{st_name} marked {status_clean}",
                    subtitle=f"{sess_name} ({r.source})",
                    timestamp=r.last_seen,
                    time_ago=format_time_ago(r.last_seen),
                )
            )

        # 7b. Recent Audit Logs
        recent_audit_q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(4)
        recent_audits = (await db.execute(recent_audit_q)).scalars().all()
        for a in recent_audits:
            action_desc = a.action.replace("_", " ").title()
            recent_activities.append(
                DashboardActivityItem(
                    id=f"audit-{a.id}",
                    event_type="SESSION" if "SESSION" in a.action else "ENROLLMENT",
                    title=f"{action_desc} ({a.entity_type})",
                    subtitle="System administration event",
                    timestamp=a.created_at,
                    time_ago=format_time_ago(a.created_at),
                )
            )

        # 7c. Recent Unknown Face Recognition Events
        recent_recog_q = (
            select(RecognitionEvent)
            .where(RecognitionEvent.decision == "UNKNOWN")
            .order_by(RecognitionEvent.event_timestamp.desc())
            .limit(2)
        )
        recent_recogs = (await db.execute(recent_recog_q)).scalars().all()
        for rg in recent_recogs:
            recent_activities.append(
                DashboardActivityItem(
                    id=f"recog-{rg.id}",
                    event_type="UNKNOWN_FACE",
                    title="Unknown face detected",
                    subtitle="Visitor or unenrolled individual",
                    timestamp=rg.event_timestamp,
                    time_ago=format_time_ago(rg.event_timestamp),
                )
            )

        # Sort activities by timestamp descending and take top 8
        recent_activities.sort(key=lambda x: normalize_dt(x.timestamp), reverse=True)
        recent_activities = recent_activities[:8]

        # ==========================================
        # 8. NEEDS ATTENTION / EXCEPTIONS
        # ==========================================
        exceptions: List[DashboardExceptionItem] = []

        if pending_enrollment > 0:
            exceptions.append(
                DashboardExceptionItem(
                    type="UNENROLLED_STUDENTS",
                    title=f"{pending_enrollment} student(s) not face-enrolled",
                    description="Students pending face capture cannot be identified by the live camera.",
                    severity="warning",
                    action_tab="students",
                    count=pending_enrollment,
                )
            )

        if offline_cams > 0:
            exceptions.append(
                DashboardExceptionItem(
                    type="OFFLINE_CAMERA",
                    title=f"{offline_cams} camera(s) offline",
                    description="Camera feed is disconnected or not receiving video frames.",
                    severity="danger",
                    action_tab="cameras",
                    count=offline_cams,
                )
            )

        # Check for low confidence events in last 24h
        low_conf_q = select(func.count(RecognitionEvent.id)).where(
            and_(
                RecognitionEvent.event_timestamp >= now_utc - timedelta(hours=24),
                RecognitionEvent.decision == "UNCERTAIN",
            )
        )
        low_conf_count = (await db.execute(low_conf_q)).scalar() or 0
        if low_conf_count > 0:
            exceptions.append(
                DashboardExceptionItem(
                    type="LOW_CONFIDENCE",
                    title=f"{low_conf_count} low-confidence recognition(s)",
                    description="Ambiguous matches detected during attendance.",
                    severity="info",
                    action_tab="live",
                    count=low_conf_count,
                )
            )


        # Projected Attendance Risk / Defaulters
        defaulters_q = (
            select(
                AttendanceRecord.student_id,
                func.count(AttendanceRecord.id).label("total_sessions"),
                func.sum(
                    case(
                        (AttendanceRecord.status.in_(["PRESENT", "MANUAL_PRESENT", "LATE", "EXCUSED", "MANUAL_EXCUSED"]), 1),
                        else_=0
                    )
                ).label("attended_sessions")
            )
            .group_by(AttendanceRecord.student_id)
        )
        defaulters_res = await db.execute(defaulters_q)
        
        critical_count = 0
        warning_count = 0
        watch_count = 0
        
        for row in defaulters_res.all():
            total_sessions = row.total_sessions
            if total_sessions > 0:
                pct = (row.attended_sessions / total_sessions) * 100
                if pct < 65:
                    critical_count += 1
                elif pct < 75:
                    warning_count += 1
                elif pct < 85:
                    watch_count += 1
                    
        if critical_count > 0:
            exceptions.append(
                DashboardExceptionItem(
                    type="CRITICAL_DEFAULTERS",
                    title=f"{critical_count} student(s) critically low attendance (<65%)",
                    description="Immediate action required. Students fall below minimum attendance threshold.",
                    severity="danger",
                    action_tab="students",
                    count=critical_count,
                )
            )
            
        if warning_count > 0:
            exceptions.append(
                DashboardExceptionItem(
                    type="WARNING_DEFAULTERS",
                    title=f"{warning_count} student(s) at attendance risk (65-74%)",
                    description="Students are approaching the critical attendance threshold.",
                    severity="warning",
                    action_tab="students",
                    count=warning_count,
                )
            )
        return DashboardSummaryResponse(
            summary=summary,
            active_session=active_session_dto,
            upcoming_sessions=upcoming_sessions,
            today_sessions=today_sessions_items,
            attendance_trend=attendance_trend,
            cameras=camera_items,
            recent_activities=recent_activities,
            exceptions=exceptions,
            server_time=datetime.now(timezone.utc),
        )
