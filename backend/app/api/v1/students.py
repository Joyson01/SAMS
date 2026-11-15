from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from backend.app.core.security import get_current_user
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

router = APIRouter(prefix="/students", tags=["Student Management"], dependencies=[Depends(get_current_user)])


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
    )


@router.get(
    "/stats",
    response_model=StudentStatsResponse,
    summary="Student Metrics Summary",
    description="Returns aggregate counts for students, face enrollment completion, active/inactive distribution, and class lists.",
)
async def get_student_statistics(
    db: AsyncSession = Depends(get_db),
) -> StudentStatsResponse:
    return await StudentService.get_student_statistics(db=db)


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
) -> StudentResponse:
    return await StudentService.create_student(db=db, payload=payload)


@router.get(
    "/{student_id}",
    response_model=StudentResponse,
    summary="Get Student Details",
    description="Fetches full student profile details and face sample count by UUID.",
)
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> StudentResponse:
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
) -> StudentResponse:
    return await StudentService.update_student(db=db, student_id=student_id, payload=payload)


@router.delete(
    "/{student_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Student",
    description="Deletes a student record and cascades deletion to all associated biometric profiles and attendance records.",
)
async def delete_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
):
    await StudentService.delete_student(db=db, student_id=student_id)
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
):
    from dataclasses import asdict
    import cv2
    import numpy as np
    from backend.app.schemas.student import FaceProfileCreate
    from backend.app.services.recognition_service import RecognitionService, get_pipeline

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        return {"success": False, "message": "Failed to decode image buffer. Provide valid JPEG or PNG file."}

    pipeline = get_pipeline()
    is_accepted, embedding, quality, pose, guidance = pipeline.process_enrollment_image(image)

    if not is_accepted or embedding is None:
        return {
            "success": False,
            "message": guidance,
            "quality": asdict(quality) if quality else None,
            "pose": asdict(pose) if pose else None,
        }

    q_score = round(min(1.0, quality.sharpness / 120.0), 2) if quality else 1.0

    # Store face profile
    profile = await StudentService.add_face_profile(
        db=db,
        student_id=student_id,
        profile_in=FaceProfileCreate(
            embedding_data=embedding.tolist(),
            model_name="ArcFace-ResNet50",
            model_version="1.0.0",
            quality_score=q_score,
            pose_type=pose_type.upper(),
        ),
    )

    # Sync vector matcher in memory
    await RecognitionService.sync_gallery_from_db(db)

    return {
        "success": True,
        "message": "Face sample successfully verified, embedded, and enrolled.",
        "profile_id": profile.id,
        "pose_type": profile.pose_type,
        "quality_score": profile.quality_score,
    }


