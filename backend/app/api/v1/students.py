from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from backend.app.core.security import require_roles, get_current_user
from backend.app.core.teacher_access import require_student_access
from backend.app.models.entities import User
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.student import (
    StudentCreate,
    StudentListResponse,
    StudentResponse,
    StudentStatsResponse,
    StudentUpdate,
)
from backend.app.services.student_service import StudentService

router = APIRouter(prefix="/students", tags=["Student Management"], dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))])


@router.get(
    "",
    response_model=StudentListResponse,
    summary="List Students with Search and Filters",
    description="Retrieves a paginated list of students. Supports fuzzy search across name, code, roll number, and email.",
)
async def list_students(
    search: Optional[str] = Query(None, description="Search term for name, code, roll number, or email"),
    department: Optional[str] = Query(None, description="Filter by department"),
    class_name: Optional[str] = Query(None, description="Filter by class/batch name"),
    section: Optional[str] = Query(None, description="Filter by section"),
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, INACTIVE, SUSPENDED)"),
    enrollment_status: Optional[str] = Query(None, description="Filter by face enrollment (NOT_ENROLLED, PARTIAL, ENROLLED)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudentListResponse:
    return await StudentService.get_students(
        db=db,
        search=search,
        department=department,
        class_name=class_name,
        section=section,
        status=status,
        enrollment_status=enrollment_status,
        page=page,
        limit=limit,
        teacher_id=user.id if user.role == "FACULTY" else None,
    )


@router.get(
    "/stats",
    response_model=StudentStatsResponse,
    summary="Student Metrics Summary",
    description="Returns aggregate counts for students, face enrollment completion, active/inactive distribution, and class lists.",
)
async def get_student_statistics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudentStatsResponse:
    return await StudentService.get_student_statistics(db, teacher_id=user.id if user.role == "FACULTY" else None)


@router.post(
    "",
    response_model=StudentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a New Student",
    description="Creates a new student record with uniqueness guarantees for student code, roll number, and email.",
)
async def create_student(
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN", "OPERATOR")),
) -> StudentResponse:
    return await StudentService.create_student(db=db, payload=payload, user_id=actor.id)


@router.get(
    "/{student_id}",
    response_model=StudentResponse,
    summary="Get Student Details",
    description="Fetches full student profile details and face sample count by UUID.",
)
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudentResponse:
    await require_student_access(db, user, student_id)
    return await StudentService.get_student_by_id(db=db, student_id=student_id)


@router.put(
    "/{student_id}",
    response_model=StudentResponse,
    summary="Update Student Profile",
    description="Updates student metadata and logs the mutation to the audit trail.",
)
async def update_student(
    student_id: str,
    payload: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN", "OPERATOR")),
) -> StudentResponse:
    return await StudentService.update_student(db=db, student_id=student_id, payload=payload, user_id=actor.id)


@router.delete(
    "/{student_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Student",
    description="Deletes a student record and cascades deletion to all associated biometric profiles and attendance records.",
)
async def delete_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN", "OPERATOR")),
):
    await StudentService.delete_student(db=db, student_id=student_id, user_id=actor.id)
    return {"status": "success", "message": f"Student '{student_id}' has been permanently deleted."}


@router.post(
    "/{student_id}/enroll",
    summary="Capture & Enroll Face Sample",
    description="Processes an uploaded camera photo for face detection, pose validation, quality check, and ArcFace embedding generation.",
)
async def enroll_student_face(
    student_id: str,
    file: UploadFile = File(..., description="JPEG/PNG face image capture"),
    pose_type: str = Form("FRONT", description="FRONT, LEFT_15, RIGHT_15, TILT_UP, TILT_DOWN, GLASSES"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from backend.app.services.enrollment_service import enroll
    await require_student_access(db, user, student_id)
    return await enroll(db, student_id, await file.read(10*1024*1024+1), pose_type.upper())


@router.get('/{student_id}/enroll/status')
async def get_enrollment_status(
    student_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await require_student_access(db, user, student_id)
    from backend.app.services.enrollment_service import enrollment_status
    return await enrollment_status(db, student_id)


@router.delete("/{student_id}/enroll", summary="Remove a student's face data")
async def remove_student_face_data(
    student_id: str, db: AsyncSession = Depends(get_db),
    admin=Depends(require_roles("ADMIN")),
):
    from backend.app.services.enrollment_service import remove_face_data
    return await remove_face_data(db, student_id, admin.id)


@router.post('/{student_id}/enroll/check')
async def check_enrollment(
    student_id: str, file: UploadFile = File(...), pose_type: str = Form('FRONT'),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    await require_student_access(db, user, student_id)
    import asyncio
    from backend.app.services.enrollment_service import check_image
    await StudentService.get_student_by_id(db, student_id)
    result, _ = await asyncio.to_thread(check_image, await file.read(10*1024*1024+1), pose_type.upper())
    return result
