import math
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import StudentAlreadyExistsError, StudentNotFoundError
from backend.app.core.logging import logger
from backend.app.models.entities import AuditLog, FaceProfile, Student
from backend.app.schemas.student import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
    StudentStatsResponse,
    StudentUpdate,
)


class StudentService:
    """Business logic and database access layer for student management."""

    @staticmethod
    async def get_students(
        db: AsyncSession,
        search: Optional[str] = None,
        department: Optional[str] = None,
        class_name: Optional[str] = None,
        section: Optional[str] = None,
        status: Optional[str] = None,
        enrollment_status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> StudentListResponse:
        """Retrieves a paginated list of students with optional search and filters."""
        query = select(Student).options(selectinload(Student.face_profiles))

        # Apply search filter (name, code, roll, email)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Student.first_name.ilike(term),
                    Student.last_name.ilike(term),
                    Student.student_code.ilike(term),
                    Student.roll_number.ilike(term),
                    Student.email.ilike(term),
                )
            )

        # Apply exact category filters
        if department and department.strip():
            query = query.where(Student.department == department.strip())
        if class_name and class_name.strip():
            query = query.where(Student.class_name == class_name.strip())
        if section and section.strip():
            query = query.where(Student.section == section.strip())
        if status and status.strip():
            query = query.where(Student.status == status.strip().upper())
        if enrollment_status and enrollment_status.strip():
            query = query.where(Student.enrollment_status == enrollment_status.strip().upper())

        # Count total matching records
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Apply pagination & sorting
        offset = (page - 1) * limit
        query = query.order_by(Student.roll_number.asc()).offset(offset).limit(limit)

        result = await db.execute(query)
        students = result.scalars().all()

        # Batch-aggregate attendance metrics for students on this page in ONE query (eliminates N+1)
        attendance_stats: Dict[str, Tuple[float, int, int]] = {}
        if students:
            from backend.app.models.entities import AttendanceRecord
            from sqlalchemy import case
            st_ids = [s.id for s in students]
            stats_q = (
                select(
                    AttendanceRecord.student_id,
                    func.count(AttendanceRecord.id).label("total"),
                    func.sum(case((AttendanceRecord.status.in_(["PRESENT", "MANUAL_PRESENT", "LATE"]), 1), else_=0)).label("present_plus_late"),
                    func.sum(case((AttendanceRecord.status.in_(["PRESENT", "MANUAL_PRESENT"]), 1), else_=0)).label("present_only"),
                )
                .where(AttendanceRecord.student_id.in_(st_ids))
                .group_by(AttendanceRecord.student_id)
            )
            stats_res = await db.execute(stats_q)
            for sid, tot_cnt, p_l, p_only in stats_res.all():
                tot_val = tot_cnt or 0
                rate = round(float(p_l or 0) / tot_val * 100.0, 1) if tot_val > 0 else 0.0
                attendance_stats[str(sid)] = (rate, tot_val, int(p_only or 0))

        items = []
        for s in students:
            sample_cnt = len(s.face_profiles) if s.face_profiles else 0
            stat = attendance_stats.get(str(s.id))
            rate_val = stat[0] if stat else None
            tot_val = stat[1] if stat else None
            pres_val = stat[2] if stat else None

            student_resp = StudentResponse(
                id=s.id,
                student_code=s.student_code,
                roll_number=s.roll_number,
                first_name=s.first_name,
                last_name=s.last_name,
                email=s.email,
                department=s.department,
                class_name=s.class_name,
                section=s.section,
                status=s.status,
                enrollment_status=s.enrollment_status,
                avatar_url=s.avatar_url,
                sample_count=sample_cnt,
                attendance_rate_pct=rate_val,
                total_sessions=tot_val,
                present_sessions=pres_val,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            items.append(student_resp)

        total_pages = math.ceil(total / limit) if total > 0 else 1

        return StudentListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
        )

    @staticmethod
    async def get_student_by_id(db: AsyncSession, student_id: str) -> StudentResponse:
        """Retrieves a single student by primary UUID."""
        query = (
            select(Student)
            .where(Student.id == student_id)
            .options(selectinload(Student.face_profiles))
        )
        result = await db.execute(query)
        student = result.scalar_one_or_none()

        if not student:
            raise StudentNotFoundError(student_id)

        sample_cnt = len(student.face_profiles) if student.face_profiles else 0
        return StudentResponse(
            id=student.id,
            student_code=student.student_code,
            roll_number=student.roll_number,
            first_name=student.first_name,
            last_name=student.last_name,
            email=student.email,
            department=student.department,
            class_name=student.class_name,
            section=student.section,
            status=student.status,
            enrollment_status=student.enrollment_status,
            avatar_url=student.avatar_url,
            sample_count=sample_cnt,
            created_at=student.created_at,
            updated_at=student.updated_at,
        )

    @staticmethod
    async def create_student(
        db: AsyncSession,
        payload: StudentCreate,
        user_id: Optional[str] = None,
    ) -> StudentResponse:
        """Registers a new student after verifying field uniqueness."""
        # 1. Check duplicate student_code
        code_check = await db.execute(
            select(Student).where(Student.student_code == payload.student_code)
        )
        if code_check.scalar_one_or_none():
            raise StudentAlreadyExistsError("student code", payload.student_code)

        # 2. Check duplicate roll_number
        roll_check = await db.execute(
            select(Student).where(Student.roll_number == payload.roll_number)
        )
        if roll_check.scalar_one_or_none():
            raise StudentAlreadyExistsError("roll number", payload.roll_number)

        # 3. Check duplicate email
        email_check = await db.execute(
            select(Student).where(Student.email == payload.email)
        )
        if email_check.scalar_one_or_none():
            raise StudentAlreadyExistsError("email", payload.email)

        new_student = Student(
            student_code=payload.student_code,
            roll_number=payload.roll_number,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            department=payload.department,
            class_name=payload.class_name,
            section=payload.section,
            status=payload.status,
            enrollment_status="NOT_ENROLLED",
            avatar_url=payload.avatar_url,
        )
        db.add(new_student)
        await db.flush()

        # Create audit log entry
        audit = AuditLog(
            user_id=user_id,
            action="CREATE",
            entity_type="Student",
            entity_id=new_student.id,
            new_values=payload.model_dump(),
        )
        db.add(audit)
        await db.commit()

        logger.info(f"Created student {new_student.first_name} {new_student.last_name} ({new_student.roll_number}) with ID {new_student.id}")

        return StudentResponse(
            id=new_student.id,
            student_code=new_student.student_code,
            roll_number=new_student.roll_number,
            first_name=new_student.first_name,
            last_name=new_student.last_name,
            email=new_student.email,
            department=new_student.department,
            class_name=new_student.class_name,
            section=new_student.section,
            status=new_student.status,
            enrollment_status=new_student.enrollment_status,
            avatar_url=new_student.avatar_url,
            sample_count=0,
            created_at=new_student.created_at,
            updated_at=new_student.updated_at,
        )

    @staticmethod
    async def update_student(
        db: AsyncSession,
        student_id: str,
        payload: StudentUpdate,
        user_id: Optional[str] = None,
    ) -> StudentResponse:
        """Updates an existing student profile and logs changes."""
        query = (
            select(Student)
            .where(Student.id == student_id)
            .options(selectinload(Student.face_profiles))
        )
        result = await db.execute(query)
        student = result.scalar_one_or_none()

        if not student:
            raise StudentNotFoundError(student_id)

        update_dict = payload.model_dump(exclude_unset=True)
        if not update_dict:
            sample_cnt = len(student.face_profiles) if student.face_profiles else 0
            return StudentResponse(
                id=student.id,
                student_code=student.student_code,
                roll_number=student.roll_number,
                first_name=student.first_name,
                last_name=student.last_name,
                email=student.email,
                department=student.department,
                class_name=student.class_name,
                section=student.section,
                status=student.status,
                enrollment_status=student.enrollment_status,
                avatar_url=student.avatar_url,
                sample_count=sample_cnt,
                created_at=student.created_at,
                updated_at=student.updated_at,
            )

        # Check uniqueness if updating student_code
        if "student_code" in update_dict and update_dict["student_code"] != student.student_code:
            code_check = await db.execute(
                select(Student).where(
                    Student.student_code == update_dict["student_code"],
                    Student.id != student_id,
                )
            )
            if code_check.scalar_one_or_none():
                raise StudentAlreadyExistsError("student code", update_dict["student_code"])

        # Check uniqueness if updating roll_number
        if "roll_number" in update_dict and update_dict["roll_number"] != student.roll_number:
            roll_check = await db.execute(
                select(Student).where(
                    Student.roll_number == update_dict["roll_number"],
                    Student.id != student_id,
                )
            )
            if roll_check.scalar_one_or_none():
                raise StudentAlreadyExistsError("roll number", update_dict["roll_number"])

        # Check uniqueness if updating email
        if "email" in update_dict and update_dict["email"] != student.email:
            email_check = await db.execute(
                select(Student).where(
                    Student.email == update_dict["email"],
                    Student.id != student_id,
                )
            )
            if email_check.scalar_one_or_none():
                raise StudentAlreadyExistsError("email", update_dict["email"])

        old_values = {
            k: getattr(student, k) for k in update_dict.keys()
        }

        # Apply updates
        for field_name, value in update_dict.items():
            setattr(student, field_name, value)

        # Create audit log
        audit = AuditLog(
            user_id=user_id,
            action="UPDATE",
            entity_type="Student",
            entity_id=student.id,
            old_values=old_values,
            new_values=update_dict,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(student)

        sample_cnt = len(student.face_profiles) if student.face_profiles else 0
        return StudentResponse(
            id=student.id,
            student_code=student.student_code,
            roll_number=student.roll_number,
            first_name=student.first_name,
            last_name=student.last_name,
            email=student.email,
            department=student.department,
            class_name=student.class_name,
            section=student.section,
            status=student.status,
            enrollment_status=student.enrollment_status,
            avatar_url=student.avatar_url,
            sample_count=sample_cnt,
            created_at=student.created_at,
            updated_at=student.updated_at,
        )

    @staticmethod
    async def delete_student(
        db: AsyncSession,
        student_id: str,
        user_id: Optional[str] = None,
    ) -> bool:
        """Deletes a student and cascades deletion to face profiles and records."""
        query = select(Student).where(Student.id == student_id)
        result = await db.execute(query)
        student = result.scalar_one_or_none()

        if not student:
            raise StudentNotFoundError(student_id)

        old_values = {
            "student_code": student.student_code,
            "roll_number": student.roll_number,
            "name": f"{student.first_name} {student.last_name}",
            "email": student.email,
        }

        await db.delete(student)

        audit = AuditLog(
            user_id=user_id,
            action="DELETE",
            entity_type="Student",
            entity_id=student_id,
            old_values=old_values,
        )
        db.add(audit)
        await db.commit()

        # Invalidate/re-sync in-memory gallery cache so deleted student is immediately purged from matcher
        try:
            from backend.app.services.recognition_service import RecognitionService
            await RecognitionService.sync_gallery_from_db(db)
        except Exception as sync_err:
            logger.warning(f"Could not auto-sync gallery after deleting student {student_id}: {sync_err}")

        logger.info(f"Deleted student {student_id} ({old_values['name']})")
        return True

    @staticmethod
    async def get_student_statistics(db: AsyncSession) -> StudentStatsResponse:
        """Calculates system-wide student count metrics."""
        total_res = await db.execute(select(func.count(Student.id)))
        total = total_res.scalar_one() or 0

        enrolled_res = await db.execute(
            select(func.count(Student.id)).where(Student.enrollment_status == "ENROLLED")
        )
        enrolled = enrolled_res.scalar_one() or 0

        not_enrolled_res = await db.execute(
            select(func.count(Student.id)).where(Student.enrollment_status != "ENROLLED")
        )
        not_enrolled = not_enrolled_res.scalar_one() or 0

        active_res = await db.execute(
            select(func.count(Student.id)).where(Student.status == "ACTIVE")
        )
        active = active_res.scalar_one() or 0

        inactive_res = await db.execute(
            select(func.count(Student.id)).where(Student.status != "ACTIVE")
        )
        inactive = inactive_res.scalar_one() or 0

        dept_res = await db.execute(select(distinct(Student.department)))
        depts = [d for (d,) in dept_res.all() if d]

        class_res = await db.execute(select(distinct(Student.class_name)))
        classes = [c for (c,) in class_res.all() if c]

        return StudentStatsResponse(
            total_students=total,
            enrolled_count=enrolled,
            not_enrolled_count=not_enrolled,
            active_count=active,
            inactive_count=inactive,
            departments=sorted(depts),
            classes=sorted(classes),
        )

    @classmethod
    async def add_face_profile(
        cls,
        db: AsyncSession,
        student_id: str,
        profile_in: Any,
    ) -> FaceProfile:
        """Enrolls a new face profile embedding for a student."""
        student = await db.get(Student, student_id)
        if not student:
            raise StudentNotFoundError(student_id)

        profile = FaceProfile(
            student_id=student_id,
            embedding_data=profile_in.embedding_data,
            model_name=profile_in.model_name,
            model_version=profile_in.model_version,
            quality_score=profile_in.quality_score,
            pose_type=profile_in.pose_type,
            image_path=profile_in.image_path,
            image_hash=profile_in.image_hash,
        )
        db.add(profile)
        student.enrollment_status = "ENROLLED"
        await db.commit()
        await db.refresh(profile)
        logger.info(f"Added face profile for student {student.student_code} ({profile.pose_type})")

        # Invalidate & re-sync in-memory gallery cache so newly enrolled student is immediately recognized
        try:
            from backend.app.services.recognition_service import RecognitionService
            await RecognitionService.sync_gallery_from_db(db)
        except Exception as sync_err:
            logger.warning(f"Could not auto-sync gallery after face enrollment: {sync_err}")

        return profile
