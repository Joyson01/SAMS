from fastapi import APIRouter
from backend.app.api.v1 import (
    attendance,
    audit,
    auth,
    cameras,
    classes,
    dashboard,
    health,
    media_attendance,
    phone_attendance,
    recognition,
    reports,
    stream,
    students,
    subjects,
    sync,
)

api_router = APIRouter()

# Mount API sub-routers
api_router.include_router(dashboard.router)
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(students.router)
api_router.include_router(subjects.router)
api_router.include_router(classes.router)
api_router.include_router(recognition.router)
api_router.include_router(attendance.router)
api_router.include_router(phone_attendance.router)
api_router.include_router(media_attendance.router)
api_router.include_router(reports.router)
api_router.include_router(cameras.router)
api_router.include_router(sync.router)
api_router.include_router(audit.router)
api_router.include_router(stream.router)

