import asyncio
import traceback
from typing import Any, Dict, List, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.logging import logger
from backend.app.database.session import get_db
from backend.app.schemas.media_attendance import (
    MediaAnalysisResponse,
    MediaJobResponse,
    SessionBiometricValidationResponse,
)
from backend.app.services.attendance_service import SessionNotFoundError
from backend.app.services.media_attendance_service import (
    MediaAttendanceService,
    MAX_IMAGE_SIZE_BYTES,
    MAX_VIDEO_SIZE_BYTES,
)
from backend.app.services.media_processing_service import (
    media_processing_service,
    UNKNOWN_THRESHOLD,
    HIGH_CONFIDENCE,
)

router = APIRouter(prefix="/media-attendance", tags=["Media Attendance"])


@router.get(
    "/session-validation/{session_id}",
    response_model=SessionBiometricValidationResponse,
    summary="Validate Session & Enrolled Student Biometrics",
    description="Checks if session exists, counts enrolled students, and evaluates registered face embeddings readiness.",
)
async def validate_session_biometrics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionBiometricValidationResponse:
    try:
        return await MediaAttendanceService.validate_session_biometrics(db, session_id)
    except SessionNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except Exception as exc:
        logger.error(f"Error validating session {session_id}: {exc}", exc_info=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to validate session biometrics: {exc}")


@router.post(
    "/analyze-image",
    summary="Diagnostic Face Detection & Recognition on Image",
    description="Development diagnostic endpoint returning structured face bounding boxes, confidences, and identity matches without modifying session attendance.",
)
async def diagnose_image(
    file: Optional[UploadFile] = File(None, description="Image JPEG/PNG/WEBP"),
    image: Optional[UploadFile] = File(None, description="Image JPEG/PNG/WEBP (alias)"),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    upload_file = file or image
    if not upload_file:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No image file provided.")

    image_bytes = await upload_file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty.")

    try:
        res = await asyncio.to_thread(
            media_processing_service.process_image_attendance,
            image_input=image_bytes,
            session_id=None,
            filename=upload_file.filename or "diag.jpg",
        )
        return {
            "faces_detected": res["faces_detected"],
            "faces": res["faces"],
            "recognized_count": res["students_recognized"],
            "unknown_count": res["unknown_faces"],
            "results": res["results"],
        }
    except Exception as exc:
        logger.error(f"Error diagnosing image: {exc}", exc_info=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Diagnostic image processing failed: {exc}")


@router.post(
    "/image",
    response_model=MediaAnalysisResponse,
    summary="Analyze Static Image for Attendance",
    description="Runs face detection, normalized embedding extraction, and marks attendance for recognized students in the chosen session.",
)
@router.post(
    "/image-attendance",
    response_model=MediaAnalysisResponse,
    summary="Analyze Static Image for Attendance (Alias)",
)
async def analyze_image_attendance(
    session_id: Optional[str] = Form(None, description="Attendance session ID"),
    sessionId: Optional[str] = Form(None, description="Attendance session ID (alias)"),
    threshold: float = Form(UNKNOWN_THRESHOLD, description="Similarity threshold"),
    file: Optional[UploadFile] = File(None, description="Classroom photo JPEG/PNG/WEBP"),
    image: Optional[UploadFile] = File(None, description="Classroom photo JPEG/PNG/WEBP (alias)"),
    photo: Optional[UploadFile] = File(None, description="Classroom photo JPEG/PNG/WEBP (alias)"),
    db: AsyncSession = Depends(get_db),
) -> MediaAnalysisResponse:
    target_session_id = session_id or sessionId
    if not target_session_id or target_session_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select an attendance session before processing image.",
        )

    upload_file = file or image or photo
    if upload_file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image file uploaded. Please provide an image file.",
        )

    image_bytes = await upload_file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image file exceeds max allowed size of {MAX_IMAGE_SIZE_BYTES // (1024*1024)} MB.",
        )

    try:
        return await MediaAttendanceService.analyze_image(
            db=db,
            session_id=target_session_id.strip(),
            image_bytes=image_bytes,
            filename=upload_file.filename or "classroom_photo.jpg",
            threshold=threshold,
        )
    except SessionNotFoundError as s_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(s_err))
    except ValueError as v_err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(v_err))
    except Exception as exc:
        logger.error(f"Image recognition engine error: {exc}", exc_info=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image recognition engine error: {exc}")


@router.post(
    "/video",
    response_model=MediaJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload Video for Attendance Processing",
    description="Uploads a recorded lecture/classroom video and starts background frame extraction, face tracking, and temporal attendance verification.",
)
@router.post(
    "/video-attendance",
    response_model=MediaJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload Video for Attendance Processing (Alias)",
)
async def process_video_attendance(
    session_id: Optional[str] = Form(None, description="Attendance session ID"),
    sessionId: Optional[str] = Form(None, description="Attendance session ID (alias)"),
    sample_fps: Optional[float] = Form(None, description="Sampling FPS for frame extraction"),
    sample_rate: Optional[float] = Form(None, description="Sampling FPS for frame extraction (alias)"),
    file: Optional[UploadFile] = File(None, description="Recorded video file (MP4, AVI, MKV, MOV, WebM)"),
    video: Optional[UploadFile] = File(None, description="Recorded video file alias"),
    clip: Optional[UploadFile] = File(None, description="Recorded video file alias"),
    db: AsyncSession = Depends(get_db),
) -> MediaJobResponse:
    target_session_id = session_id or sessionId
    if not target_session_id or target_session_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select an attendance session before uploading video.",
        )

    upload_file = file or video or clip
    if upload_file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No video file uploaded. Please provide a video file.",
        )

    allowed_exts = {".mp4", ".avi", ".mkv", ".mov", ".webm"}
    file_ext = "." + (upload_file.filename or "video.mp4").split(".")[-1].lower()
    if file_ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported video format '{file_ext}'. Allowed formats: {sorted(allowed_exts)}",
        )

    video_bytes = await upload_file.read()
    if len(video_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded video is empty.")

    if len(video_bytes) > MAX_VIDEO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video file exceeds max size of {MAX_VIDEO_SIZE_BYTES // (1024*1024)} MB.",
        )

    actual_fps = sample_fps if sample_fps is not None else (sample_rate if sample_rate is not None else 2.0)

    try:
        job = await MediaAttendanceService.create_video_job(
            db=db,
            session_id=target_session_id.strip(),
            video_bytes=video_bytes,
            filename=upload_file.filename or "recorded_lecture.mp4",
        )

        # Launch background processing task
        asyncio.create_task(
            MediaAttendanceService.process_video_background(
                job_id=job.id,
                sample_fps=actual_fps,
            )
        )

        job_resp = await MediaAttendanceService.get_job_by_id(db, job.id)
        return job_resp or MediaJobResponse.model_validate(job)
    except SessionNotFoundError as s_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(s_err))
    except ValueError as v_err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(v_err))
    except Exception as exc:
        logger.error(f"Failed to initialize video processing: {exc}", exc_info=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to initialize video processing: {exc}")


@router.get(
    "/jobs",
    response_model=List[MediaJobResponse],
    summary="List Media Processing Jobs",
    description="Lists historical media processing jobs with status, progress, and detection summaries.",
)
async def list_media_jobs(
    session_id: Optional[str] = Query(None, description="Filter by attendance session"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> List[MediaJobResponse]:
    return await MediaAttendanceService.list_jobs(db, session_id=session_id, limit=limit)


@router.get(
    "/jobs/{job_id}",
    response_model=MediaJobResponse,
    summary="Get Media Job Status & Summary",
)
async def get_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> MediaJobResponse:
    job = await MediaAttendanceService.get_job_by_id(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media job not found.")
    return job


@router.get(
    "/jobs/{job_id}/results",
    response_model=Dict[str, Any],
    summary="Get Detailed Processing Results for Media Job",
)
async def get_media_job_results(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    job = await MediaAttendanceService.get_job_by_id(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media job not found.")
    return {
        "job": job.model_dump(),
        "summary": job.summary_json or {},
    }


@router.post(
    "/jobs/{job_id}/cancel",
    summary="Cancel Running Video Processing Job",
)
async def cancel_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    cancelled = await MediaAttendanceService.cancel_job(db, job_id)
    if not cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job could not be cancelled or was not active.")
    return {"status": "cancelled", "job_id": job_id}


@router.delete(
    "/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Media Job and Storage File",
)
async def delete_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    deleted = await MediaAttendanceService.delete_job(db, job_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media job not found.")
