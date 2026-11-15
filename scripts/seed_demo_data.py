"""
SAMS Database Demo Data Seeder.

Populates the SAMS database with clean, fictional demo data:
- Fictional Academic Subjects
- Fictional Class Sections & Batches
- Fictional Students (no real biometric embeddings)
- Classroom Cameras
- Weekly Timetable Schedule
- Demo Attendance Sessions

Usage:
    python -m scripts.seed_demo_data
"""

import asyncio
import os
import sys
from datetime import date, datetime, time, timedelta, timezone

sys.path.insert(0, os.path.abspath("."))

from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.camera import CameraCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.schemas.timetable import TimetableEntryCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.camera_service import CameraService
from backend.app.services.class_service import ClassService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


async def seed_demo_data():
    print("=" * 60)
    print("🌱 SAMS DEMO DATA SEEDER")
    print("=" * 60)

    await init_db_schema()

    async with AsyncSessionLocal() as db:
        # 1. Academic Subjects
        print("\n[1/6] Creating Academic Subjects...")
        subjects_data = [
            SubjectCreate(
                code="CS401",
                name="Computer Networks",
                short_name="CN",
                department="Computer Science",
                credits=4,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS402",
                name="Artificial Intelligence & Machine Learning",
                short_name="AI-ML",
                department="Computer Science",
                credits=4,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS403",
                name="Database Management Systems",
                short_name="DBMS",
                department="Computer Science",
                credits=3,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS404",
                name="Computer Vision & Biometrics",
                short_name="CV",
                department="Computer Science",
                credits=4,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS405",
                name="Software Engineering & Agile Methodologies",
                short_name="SE",
                department="Computer Science",
                credits=3,
                semester=4,
                academic_year="2026-2027",
            ),
        ]
        created_subjects = {}
        for s in subjects_data:
            try:
                subj = await SubjectService.create_subject(db, s)
                created_subjects[s.code] = subj
                print(f"  [+] Subject: {subj.code} - {subj.name}")
            except Exception as e:
                print(f"  [!] Subject {s.code} note: {e}")

        # 2. Class Sections
        print("\n[2/6] Creating Class Sections...")
        classes_data = [
            ClassSectionCreate(
                name="CSE-4A",
                department="Computer Science",
                year=4,
                semester=4,
                section="A",
                academic_year="2026-2027",
            ),
            ClassSectionCreate(
                name="CSE-4B",
                department="Computer Science",
                year=4,
                semester=4,
                section="B",
                academic_year="2026-2027",
            ),
        ]
        created_classes = {}
        for c in classes_data:
            try:
                cls_sec = await ClassService.create_class(db, c)
                created_classes[c.name] = cls_sec
                print(f"  [+] Class: {cls_sec.name} ({cls_sec.department})")
            except Exception as e:
                print(f"  [!] Class {c.name} note: {e}")

        # 3. Fictional Demo Students
        print("\n[3/6] Creating Fictional Demo Students...")
        students_data = [
            StudentCreate(
                student_code="DEMO001",
                roll_number="CS2026-001",
                first_name="Aarav",
                last_name="Patel",
                email="aarav.patel@demo-campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="DEMO002",
                roll_number="CS2026-002",
                first_name="Diya",
                last_name="Iyer",
                email="diya.iyer@demo-campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="DEMO003",
                roll_number="CS2026-003",
                first_name="Kabir",
                last_name="Verma",
                email="kabir.verma@demo-campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="DEMO004",
                roll_number="CS2026-004",
                first_name="Ananya",
                last_name="Pandey",
                email="ananya.pandey@demo-campus.edu",
                department="Computer Science",
                class_name="CSE-4B",
                section="B",
            ),
            StudentCreate(
                student_code="DEMO005",
                roll_number="CS2026-005",
                first_name="Rohan",
                last_name="Mehta",
                email="rohan.mehta@demo-campus.edu",
                department="Computer Science",
                class_name="CSE-4B",
                section="B",
            ),
        ]
        created_students = []
        for st in students_data:
            try:
                s_obj = await StudentService.create_student(db, st)
                created_students.append(s_obj)
                print(f"  [+] Student: {s_obj.student_code} - {s_obj.first_name} {s_obj.last_name} ({s_obj.class_name})")
            except Exception as e:
                print(f"  [!] Student {st.student_code} note: {e}")

        # 4. Classroom Cameras
        print("\n[4/6] Creating Classroom Cameras...")
        cameras_data = [
            CameraCreate(
                name="Room 204 Main Webcam",
                location="Room 204 Front Desk",
                source_type="WEBCAM",
                assigned_class="CSE-4A",
            ),
            CameraCreate(
                name="Auditorium CCTV RTSP",
                location="Main Auditorium Hall",
                source_type="RTSP",
                stream_url="rtsp://demo-camera.local:554/live/stream1",
                assigned_class="CSE-4B",
            ),
        ]
        for cam_in in cameras_data:
            try:
                cam = await CameraService.create_camera(db, cam_in)
                print(f"  [+] Camera: {cam.name} ({cam.source_type})")
            except Exception as e:
                print(f"  [!] Camera {cam_in.name} note: {e}")

        # 5. Timetable Schedule
        print("\n[5/6] Creating Timetable Entries...")
        if "CSE-4A" in created_classes and "CS402" in created_subjects:
            try:
                cls_id = created_classes["CSE-4A"].id
                subj_id = created_subjects["CS402"].id
                from backend.app.models.entities import TimetableEntry
                from sqlalchemy import select
                exist_tt = await db.execute(select(TimetableEntry).where(TimetableEntry.class_id == cls_id))
                if not exist_tt.scalars().first():
                    tt = TimetableEntry(
                        class_id=cls_id,
                        subject_id=subj_id,
                        day_of_week="Monday",
                        start_time="09:00",
                        end_time="10:00",
                        entry_type="SUBJECT",
                        label="AI & Machine Learning Lecture",
                        room="Room 204",
                    )
                    db.add(tt)
                    await db.commit()
                    print("  [+] Timetable: Monday 09:00-10:00 CSE-4A (AI-ML)")
            except Exception as e:
                print(f"  [!] Timetable note: {e}")

        # 6. Showcase Attendance Session
        print("\n[6/6] Creating Demo Attendance Session...")
        try:
            today = date.today()
            subj_ai = created_subjects.get("CS402")
            subj_id = subj_ai.id if subj_ai else None
            session_payload = SessionCreate(
                class_name="CSE-4A",
                subject="Artificial Intelligence & Machine Learning",
                room="Room 204",
                scheduled_date=today,
                start_time=time(9, 0),
                end_time=time(10, 0),
                subject_id=subj_id,
                attendance_mode="AI_FACE_RECOGNITION",
            )
            demo_sess = await AttendanceService.create_session(db, session_payload)
            print(f"  [+] Session Created: ID {demo_sess.id} ({demo_sess.subject} - {demo_sess.class_name})")
        except Exception as e:
            print(f"  [!] Attendance session note: {e}")

    print("\n" + "=" * 60)
    print("✅ SAMS DEMO SEEDING COMPLETE!")
    print("   Note: Face enrollment must be completed locally per student")
    print("   via the Face Enrollment page (/enrollment) or mobile portal.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
