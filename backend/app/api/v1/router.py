from fastapi import APIRouter
from backend.app.api.v1 import (
    anonymous_detection,
    attendance,
    audit,
    auth,
    classes,
    dashboard,
    department,
    health,
    media_attendance,
    photo_attendance,
    recognition,
    reports,
    stream,
    student_portal,
    student_import,
    students,
    subjects,
    sync,
    teacher_assignments,
)

api_router = APIRouter()
api_router.include_router(anonymous_detection.router)

# Mount API sub-routers
api_router.include_router(dashboard.router)
api_router.include_router(department.router)
api_router.include_router(teacher_assignments.router)
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(student_portal.router)
api_router.include_router(student_import.router)
api_router.include_router(students.router)
api_router.include_router(subjects.router)
api_router.include_router(classes.router)
api_router.include_router(recognition.router)
api_router.include_router(attendance.router)
api_router.include_router(media_attendance.router)
api_router.include_router(reports.router)
api_router.include_router(sync.router)
api_router.include_router(audit.router)
api_router.include_router(stream.router)


api_router.include_router(photo_attendance.router)
