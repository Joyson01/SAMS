import asyncio
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
import cv2
import numpy as np

from backend.app.core.logging import logger
from backend.app.core.security import hash_password
from backend.app.database.session import AsyncSessionLocal, check_database_connection, init_db_schema
from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    Camera,
    FaceProfile,
    Student,
    SyncQueue,
    User,
)
from backend.app.services.recognition_service import get_pipeline

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent.parent


async def seed_database():
    """Seeds rich demonstration data across all 13 subsystems."""
    logger.info("Verifying database connectivity...")
    await check_database_connection()
    logger.info("Initializing database schema...")
    await init_db_schema()

    async with AsyncSessionLocal() as db:
        # Clear existing data for clean demo state
        logger.info("Clearing previous records...")
        await db.execute(SyncQueue.__table__.delete())
        await db.execute(AuditLog.__table__.delete())
        await db.execute(AttendanceRecord.__table__.delete())
        await db.execute(AttendanceSession.__table__.delete())
        await db.execute(Camera.__table__.delete())
        await db.execute(FaceProfile.__table__.delete())
        await db.execute(Student.__table__.delete())
        await db.execute(User.__table__.delete())
        await db.commit()

        # 1. Seed Users
        logger.info("Seeding Users...")
        admin = User(
            username="admin",
            email="admin@campus.edu",
            password_hash=hash_password("Admin#2026"),
            full_name="Dr. Rajesh Sharma (Administrator)",
            role="ADMIN",
            is_active=True,
        )
        faculty = User(
            username="faculty",
            email="faculty@campus.edu",
            password_hash=hash_password("Faculty#2026"),
            full_name="Prof. Priya Verma",
            role="FACULTY",
            is_active=True,
        )
        operator = User(
            username="operator",
            email="operator@campus.edu",
            password_hash=hash_password("Operator#2026"),
            full_name="Vikram Seth (Security Lead)",
            role="OPERATOR",
            is_active=True,
        )
        db.add_all([admin, faculty, operator])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(faculty)

        # 2. Seed Students
        logger.info("Seeding Students...")
        students_data = [
            ("Pankaj", "Tripathi", "STU-2026-001", "CSE-401", "Computer Science", "CSE-4A", "A", "pankaj.t@campus.edu", "ENROLLED"),
            ("Ananya", "Pandey", "STU-2026-002", "CSE-402", "Computer Science", "CSE-4A", "A", "ananya.p@campus.edu", "ENROLLED"),
            ("Rahul", "Sharma", "STU-2026-003", "CSE-403", "Computer Science", "CSE-4A", "A", "rahul.s@campus.edu", "ENROLLED"),
            ("Sneha", "Patel", "STU-2026-004", "CSE-404", "Computer Science", "CSE-4A", "A", "sneha.p@campus.edu", "PARTIAL"),
            ("Aarav", "Mehta", "STU-2026-005", "CSE-405", "Computer Science", "CSE-4A", "A", "aarav.m@campus.edu", "NOT_ENROLLED"),
            ("Pooja", "Nair", "STU-2026-006", "ECE-301", "Electronics & Comm", "ECE-3B", "B", "pooja.n@campus.edu", "ENROLLED"),
            ("Rohan", "Gupta", "STU-2026-007", "ECE-302", "Electronics & Comm", "ECE-3B", "B", "rohan.g@campus.edu", "ENROLLED"),
            ("Kavita", "Iyer", "STU-2026-008", "MECH-201", "Mechanical Eng", "MECH-2A", "A", "kavita.i@campus.edu", "ENROLLED"),
        ]

        created_students = []
        for fn, ln, code, roll, dept, cls_name, sec, em, enr in students_data:
            s = Student(
                student_code=code,
                roll_number=roll,
                first_name=fn,
                last_name=ln,
                email=em,
                department=dept,
                class_name=cls_name,
                section=sec,
                status="ACTIVE",
                enrollment_status=enr,
            )
            db.add(s)
            created_students.append(s)

        await db.commit()
        for s in created_students:
            await db.refresh(s)

        # 3. Seed Real Face Embeddings (using sample images)
        logger.info("Extracting and enrolling face embeddings...")
        pipeline = get_pipeline()
        img_pankaj = WORKSPACE_ROOT / "src" / "Test" / "pankaj.jpg"

        if img_pankaj.exists():
            raw_img = cv2.imread(str(img_pankaj))
            faces = pipeline.detector.detect(raw_img)
            if faces:
                crop = pipeline.aligner.align(raw_img, faces[0].landmarks)
                real_emb = pipeline.embedder.extract_from_crop(crop)

                fp1 = FaceProfile(
                    student_id=created_students[0].id,  # Pankaj
                    embedding_data=real_emb.tolist(),
                    model_name="ArcFace-ResNet50",
                    model_version="1.0.0",
                    quality_score=0.98,
                    pose_type="FRONT",
                    image_path=str(img_pankaj),
                )
                db.add(fp1)

        # Synthetic distinct embeddings for other enrolled students
        rng = np.random.RandomState(42)
        for s in created_students[1:]:
            if s.enrollment_status in ("ENROLLED", "PARTIAL"):
                emb_vec = rng.randn(512).astype(np.float32)
                emb_vec = emb_vec / np.linalg.norm(emb_vec)
                fp = FaceProfile(
                    student_id=s.id,
                    embedding_data=emb_vec.tolist(),
                    model_name="ArcFace-ResNet50",
                    model_version="1.0.0",
                    quality_score=0.95,
                    pose_type="FRONT",
                )
                db.add(fp)

        await db.commit()

        # 4. Seed Cameras
        logger.info("Seeding Camera devices...")
        cam1 = Camera(
            name="Room-401 Main Cam",
            location="Room-401 Computer Lab",
            source_type="WEBCAM",
            stream_url="0",
            target_fps=15,
            is_active=True,
        )
        cam2 = Camera(
            name="Auditorium-A Front PTZ",
            location="Main Auditorium",
            source_type="RTSP",
            stream_url="rtsp://192.168.1.100:554/live",
            target_fps=20,
            is_active=True,
        )
        cam3 = Camera(
            name="Hallway Gate-3 Dome",
            location="Academic Block A",
            source_type="RTSP",
            stream_url="rtsp://192.168.1.101:554/ch1",
            target_fps=10,
            is_active=False,
        )
        db.add_all([cam1, cam2, cam3])
        await db.commit()

        # 5. Seed Attendance Sessions & Records
        logger.info("Seeding Attendance Sessions and Records...")
        today = date.today()

        # Session 1: Active Session for today
        sess_active = AttendanceSession(
            session_code="SESS-2026-TODAY-01",
            class_name="CSE-4A",
            subject="Computer Vision & Deep Learning",
            room="Room-401",
            scheduled_date=today,
            start_time=time(9, 0),
            end_time=time(10, 30),
            status="ACTIVE",
        )
        db.add(sess_active)
        await db.commit()
        await db.refresh(sess_active)

        # Mark Pankaj and Rahul Present
        t_now = datetime.now(timezone.utc)
        r1 = AttendanceRecord(
            session_id=sess_active.id,
            student_id=created_students[0].id,  # Pankaj
            first_seen=t_now - timedelta(minutes=15),
            last_seen=t_now - timedelta(minutes=2),
            confidence=0.96,
            status="PRESENT",
            liveness_score=0.98,
            remarks="AI Live Recognition",
        )
        r2 = AttendanceRecord(
            session_id=sess_active.id,
            student_id=created_students[2].id,  # Rahul
            first_seen=t_now - timedelta(minutes=10),
            last_seen=t_now - timedelta(minutes=1),
            confidence=0.92,
            status="PRESENT",
            liveness_score=0.95,
            remarks="AI Live Recognition",
        )
        db.add_all([r1, r2])

        # Session 2: Completed Past Session (CSE-4A)
        sess_past1 = AttendanceSession(
            session_code="SESS-2026-PAST-01",
            class_name="CSE-4A",
            subject="Artificial Intelligence Principles",
            room="Room-401",
            scheduled_date=today - timedelta(days=1),
            start_time=time(11, 0),
            end_time=time(12, 30),
            status="COMPLETED",
        )
        db.add(sess_past1)
        await db.commit()
        await db.refresh(sess_past1)

        # Populate records for past session
        past_time1 = datetime.now(timezone.utc) - timedelta(days=1, hours=2)
        for idx, s in enumerate(created_students[:5]):  # CSE-4A students
            st = "PRESENT" if idx in (0, 1, 2) else ("LATE" if idx == 3 else "ABSENT")
            rec = AttendanceRecord(
                session_id=sess_past1.id,
                student_id=s.id,
                first_seen=past_time1,
                last_seen=past_time1 + timedelta(minutes=45),
                confidence=0.94 if st != "ABSENT" else 1.0,
                status=st,
                liveness_score=0.96 if st != "ABSENT" else 1.0,
                remarks="Auto-logged session" if st != "ABSENT" else "Auto-marked Absent upon closure",
            )
            db.add(rec)

        # Session 3: Completed Past Session (ECE-3B)
        sess_past2 = AttendanceSession(
            session_code="SESS-2026-PAST-02",
            class_name="ECE-3B",
            subject="Digital Signal Processing",
            room="Lab-2",
            scheduled_date=today - timedelta(days=2),
            start_time=time(14, 0),
            end_time=time(15, 30),
            status="COMPLETED",
        )
        db.add(sess_past2)
        await db.commit()
        await db.refresh(sess_past2)

        past_time2 = datetime.now(timezone.utc) - timedelta(days=2, hours=3)
        for s in created_students[5:7]:  # ECE-3B students
            db.add(
                AttendanceRecord(
                    session_id=sess_past2.id,
                    student_id=s.id,
                    first_seen=past_time2,
                    last_seen=past_time2 + timedelta(minutes=30),
                    confidence=0.91,
                    status="PRESENT",
                    liveness_score=0.94,
                    remarks="AI Live Recognition",
                )
            )

        # 6. Seed Audit Logs
        logger.info("Seeding Audit Logs...")
        db.add_all([
            AuditLog(
                user_id=admin.id,
                action="CREATE",
                entity_type="Student",
                entity_id=created_students[0].id,
                new_values={"student_code": "STU-2026-001", "name": "Pankaj Tripathi"},
                ip_address="127.0.0.1",
                user_agent="Mozilla/5.0",
            ),
            AuditLog(
                user_id=admin.id,
                action="MANUAL_OVERRIDE",
                entity_type="AttendanceRecord",
                entity_id=created_students[1].id,
                old_values={"status": "ABSENT"},
                new_values={"status": "MANUAL_PRESENT", "reason": "Medical certificate verified"},
                ip_address="192.168.1.45",
                user_agent="Mozilla/5.0",
            ),
            AuditLog(
                user_id=faculty.id,
                action="UPDATE",
                entity_type="AttendanceSession",
                entity_id=sess_past1.id,
                old_values={"status": "ACTIVE"},
                new_values={"status": "COMPLETED"},
                ip_address="127.0.0.1",
                user_agent="Mozilla/5.0",
            ),
        ])

        # 7. Seed Offline Sync Queue
        db.add_all([
            SyncQueue(
                event_uuid="sync-evt-001",
                event_type="ATTENDANCE_EVENT",
                payload={"session_id": sess_active.id, "student_id": created_students[0].id},
                status="SYNCED",
                synced_at=datetime.now(timezone.utc) - timedelta(minutes=5),
            ),
            SyncQueue(
                event_uuid="sync-evt-002",
                event_type="RECOGNITION_TELEMETRY",
                payload={"fps": 18.4, "latency_ms": 42.1},
                status="SYNCED",
                synced_at=datetime.now(timezone.utc) - timedelta(minutes=3),
            ),
        ])

        await db.commit()
        logger.info("✓ Demonstration database successfully seeded with realistic enterprise data!")


if __name__ == "__main__":
    asyncio.run(seed_database())
