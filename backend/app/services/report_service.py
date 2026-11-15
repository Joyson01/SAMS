import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.models.entities import AttendanceRecord, AttendanceSession, Student
from backend.app.schemas.reports import (
    ClassAttendanceSummary,
    DailyAttendanceTrend,
    DefaulterStudentSummary,
    InstitutionAnalyticsResponse,
)


class ReportService:
    """Service generating institutional attendance analytics, trend charts, defaulter lists, and CSV exports."""

    @classmethod
    async def get_institution_analytics(
        cls,
        db: AsyncSession,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        department: Optional[str] = None,
        class_name: Optional[str] = None,
    ) -> InstitutionAnalyticsResponse:
        """Computes comprehensive analytics across sessions, classes, and individual student histories."""
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        # 1. Query Total Enrolled Active Students
        student_query = select(Student).where(Student.status == "ACTIVE")
        if department:
            student_query = student_query.where(Student.department == department)
        if class_name:
            student_query = student_query.where(Student.class_name == class_name)

        student_res = await db.execute(student_query)
        all_students = student_res.scalars().all()
        total_students_enrolled = len(all_students)

        # 2. Query Sessions in date window
        session_query = select(AttendanceSession).where(
            and_(
                AttendanceSession.scheduled_date >= start_date,
                AttendanceSession.scheduled_date <= end_date,
            )
        )
        if class_name:
            session_query = session_query.where(AttendanceSession.class_name == class_name)

        session_res = await db.execute(session_query)
        sessions = session_res.scalars().all()
        total_sessions_conducted = len(sessions)

        # 3. Query All Attendance Records in window with relationships
        records_query = (
            select(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .join(Student, AttendanceRecord.student_id == Student.id)
            .where(
                and_(
                    AttendanceSession.scheduled_date >= start_date,
                    AttendanceSession.scheduled_date <= end_date,
                )
            )
            .options(selectinload(AttendanceRecord.session), selectinload(AttendanceRecord.student))
        )
        if department:
            records_query = records_query.where(Student.department == department)
        if class_name:
            records_query = records_query.where(Student.class_name == class_name)

        records_res = await db.execute(records_query)
        records = records_res.scalars().all()

        # 4. Aggregations
        present_count = 0
        late_count = 0
        absent_count = 0

        # Class breakdown: class_name -> {present, late, absent, sessions: set(), students: set()}
        class_stats: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"present": 0, "late": 0, "absent": 0, "sessions": set(), "students": set(), "dept": ""}
        )

        # Daily trends: date -> {present, late, absent, sessions: set()}
        daily_stats: Dict[date, Dict[str, Any]] = defaultdict(
            lambda: {"present": 0, "late": 0, "absent": 0, "sessions": set()}
        )

        # Student attendance counter: student_id -> {present, late, absent, total_sessions}
        student_counters: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"present": 0, "late": 0, "absent": 0, "total": 0, "obj": None}
        )

        for st in all_students:
            student_counters[st.id]["obj"] = st
            class_stats[st.class_name]["students"].add(st.id)
            class_stats[st.class_name]["dept"] = st.department

        for s in sessions:
            daily_stats[s.scheduled_date]["sessions"].add(s.id)
            class_stats[s.class_name]["sessions"].add(s.id)

        for r in records:
            st = r.student
            sess = r.session
            if not st or not sess:
                continue

            status = r.status.upper()
            is_present = status in ["PRESENT", "MANUAL_PRESENT"]
            is_late = status == "LATE"
            is_absent = status in ["ABSENT", "MANUAL_ABSENT"]

            if is_present:
                present_count += 1
                class_stats[sess.class_name]["present"] += 1
                daily_stats[sess.scheduled_date]["present"] += 1
                student_counters[st.id]["present"] += 1
            elif is_late:
                late_count += 1
                class_stats[sess.class_name]["late"] += 1
                daily_stats[sess.scheduled_date]["late"] += 1
                student_counters[st.id]["late"] += 1
            else:
                absent_count += 1
                class_stats[sess.class_name]["absent"] += 1
                daily_stats[sess.scheduled_date]["absent"] += 1
                student_counters[st.id]["absent"] += 1

            student_counters[st.id]["total"] += 1

        total_records_count = present_count + late_count + absent_count
        overall_rate = (
            round((present_count + late_count) / total_records_count * 100.0, 1)
            if total_records_count > 0
            else 0.0
        )

        # Build Class Summaries
        class_summaries: List[ClassAttendanceSummary] = []
        for c_name, c_data in sorted(class_stats.items()):
            c_present = c_data["present"]
            c_late = c_data["late"]
            c_absent = c_data["absent"]
            c_total = c_present + c_late + c_absent
            c_rate = round((c_present + c_late) / c_total * 100.0, 1) if c_total > 0 else 0.0

            class_summaries.append(
                ClassAttendanceSummary(
                    class_name=c_name,
                    department=c_data["dept"] or "General",
                    total_sessions=len(c_data["sessions"]),
                    total_students_enrolled=len(c_data["students"]),
                    present_count=c_present,
                    late_count=c_late,
                    absent_count=c_absent,
                    avg_attendance_pct=c_rate,
                )
            )

        # Build Daily Trends
        daily_trends: List[DailyAttendanceTrend] = []
        for d_date in sorted(daily_stats.keys()):
            d_data = daily_stats[d_date]
            d_p = d_data["present"]
            d_l = d_data["late"]
            d_a = d_data["absent"]
            d_total = d_p + d_l + d_a
            d_rate = round((d_p + d_l) / d_total * 100.0, 1) if d_total > 0 else 0.0

            daily_trends.append(
                DailyAttendanceTrend(
                    record_date=d_date,
                    total_sessions=len(d_data["sessions"]),
                    present_count=d_p,
                    late_count=d_l,
                    absent_count=d_a,
                    attendance_pct=d_rate,
                )
            )

        # Build Defaulters and Perfect Attendees
        defaulters: List[DefaulterStudentSummary] = []
        perfect_attendance_count = 0

        for s_id, s_data in student_counters.items():
            st_obj = s_data["obj"]
            if not st_obj:
                continue

            s_tot = s_data["total"]
            s_att = s_data["present"] + s_data["late"]

            if s_tot == 0:
                continue

            s_rate = round(s_att / s_tot * 100.0, 1)

            if s_rate >= 100.0:
                perfect_attendance_count += 1
            elif s_rate < 75.0:
                defaulters.append(
                    DefaulterStudentSummary(
                        student_id=s_id,
                        student_name=f"{st_obj.first_name} {st_obj.last_name}",
                        student_code=st_obj.student_code,
                        roll_number=st_obj.roll_number,
                        department=st_obj.department,
                        class_name=st_obj.class_name,
                        total_sessions=s_tot,
                        attended_sessions=s_att,
                        attendance_pct=s_rate,
                        is_critical=s_rate < 65.0,
                    )
                )

        # Sort defaulters ascending by attendance percentage (worst first)
        defaulters.sort(key=lambda item: item.attendance_pct)

        return InstitutionAnalyticsResponse(
            overall_attendance_rate_pct=overall_rate,
            total_sessions_conducted=total_sessions_conducted,
            total_students_enrolled=total_students_enrolled,
            defaulter_students_count=len(defaulters),
            perfect_attendance_count=perfect_attendance_count,
            class_breakdowns=class_summaries,
            daily_trends=daily_trends,
            defaulters=defaulters,
        )

    @classmethod
    async def export_attendance_csv(
        cls,
        db: AsyncSession,
        session_id: Optional[str] = None,
        class_name: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> str:
        """Generates an RFC-4180 compliant CSV string containing detailed attendance logs."""
        query = (
            select(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .join(Student, AttendanceRecord.student_id == Student.id)
            .options(selectinload(AttendanceRecord.session), selectinload(AttendanceRecord.student))
        )
        filters = []
        if session_id:
            filters.append(AttendanceRecord.session_id == session_id)
        if class_name:
            filters.append(AttendanceSession.class_name == class_name)
        if start_date:
            filters.append(AttendanceSession.scheduled_date >= start_date)
        if end_date:
            filters.append(AttendanceSession.scheduled_date <= end_date)

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(AttendanceSession.scheduled_date.desc(), Student.roll_number.asc())
        records = (await db.execute(query)).scalars().all()

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Write CSV Headers
        writer.writerow(
            [
                "Record ID",
                "Session Code",
                "Subject",
                "Class",
                "Room",
                "Date",
                "Student Code",
                "Roll Number",
                "Student Name",
                "Department",
                "Status",
                "Confidence (%)",
                "First Seen",
                "Last Seen",
                "Remarks",
            ]
        )

        for r in records:
            st = r.student
            sess = r.session
            writer.writerow(
                [
                    r.id,
                    sess.session_code if sess else "N/A",
                    sess.subject if sess else "N/A",
                    sess.class_name if sess else "N/A",
                    sess.room if sess else "N/A",
                    sess.scheduled_date.isoformat() if sess else "N/A",
                    st.student_code if st else "N/A",
                    st.roll_number if st else "N/A",
                    f"{st.first_name} {st.last_name}" if st else "N/A",
                    st.department if st else "N/A",
                    r.status,
                    f"{r.confidence * 100:.1f}" if r.confidence > 0 else "0.0",
                    r.first_seen.strftime("%H:%M:%S") if r.first_seen else "N/A",
                    r.last_seen.strftime("%H:%M:%S") if r.last_seen else "N/A",
                    r.remarks or "",
                ]
            )

        return output.getvalue()

