import asyncio
import logging
import os
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

import cv2
import numpy as np
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import settings
from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    FaceProfile,
    MediaProcessingJob,
    Student,
)
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.schemas.media_attendance import (
    DetectedMediaFaceItem,
    MediaAnalysisResponse,
    MediaAttendanceItem,
    MediaJobResponse,
    SessionBiometricValidationResponse,
    UnresolvedFaceItem,
)
from backend.app.services.attendance_service import AttendanceService, SessionNotFoundError
from backend.app.services.face_recognition_service import (
    face_recognition_service,
    UNKNOWN_THRESHOLD,
    HIGH_CONFIDENCE,
)
from backend.app.services.media_processing_service import media_processing_service

logger = logging.getLogger('jojipa_sams.media_attendance')

_active_cancellation_events: Dict[str, asyncio.Event] = {}

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = PROJECT_ROOT / "data" / "uploads" / "media"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MediaAttendanceService:
    @classmethod
    async def validate_session_biometrics(
        cls,
        db: AsyncSession,
        session_id: str,
    ) -> SessionBiometricValidationResponse:
        """Validates that session exists and evaluates biometric enrollment readiness of students."""
        session_res = await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == session_id)
        )
        session_obj = session_res.scalars().first()
        if not session_obj:
            raise SessionNotFoundError(f"Attendance session '{session_id}' not found.")

        # Query all active students
        st_res = await db.execute(
            select(Student).where(Student.status == "ACTIVE")
        )
        all_students = st_res.scalars().all()
        total_students = len(all_students)

        # Query students with active face profiles
        fp_res = await db.execute(
            select(FaceProfile.student_id).distinct()
        )
        enrolled_student_ids = set(fp_res.scalars().all())
        students_with_face_data = len(enrolled_student_ids)
        students_missing_face_data = max(0, total_students - students_with_face_data)

        can_process = students_with_face_data > 0
        warning = None
        if not can_process:
            warning = "No enrolled student biometric data available. Please register student faces before processing attendance."
        elif students_missing_face_data > 0:
            warning = f"{students_missing_face_data} student(s) lack registered face profiles and cannot be recognized."

        return SessionBiometricValidationResponse(
            session_id=session_id,
            subject=session_obj.subject,
            class_name=session_obj.class_name,
            status=session_obj.status,
            total_enrolled_students=total_students,
            students_with_face_data=students_with_face_data,
            students_missing_face_data=students_missing_face_data,
            can_process=can_process,
            warning_message=warning,
        )

    @classmethod
    async def analyze_image(
        cls,
        db: AsyncSession,
        session_id: str,
        image_bytes: bytes,
        filename: str = "uploaded_image.jpg",
        created_by: Optional[str] = None,
        threshold: float = UNKNOWN_THRESHOLD,
    ) -> MediaAnalysisResponse:
        """Processes static image for classroom attendance using InsightFace buffalo_l recognition engine."""
        t0 = time.perf_counter()

        # 1. Verify session exists
        session_res = await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == session_id)
        )
        session_obj = session_res.scalars().first()
        if not session_obj:
            raise SessionNotFoundError(f"Attendance session '{session_id}' not found.")

        # 2. Run core media processing service
        result_dict = await asyncio.to_thread(
            media_processing_service.process_image_attendance,
            image_input=image_bytes,
            session_id=session_id,
            filename=filename,
            threshold=threshold,
        )

        # 3. Create MediaProcessingJob record for historical logging
        job = MediaProcessingJob(
            session_id=session_id,
            media_type="IMAGE",
            filename=filename,
            file_path="",
            file_size_bytes=len(image_bytes),
            duration_sec=0.0,
            resolution=result_dict.get("resolution", "1920x1080"),
            status="COMPLETED",
            progress_pct=100.0,
            frames_total=1,
            frames_processed=1,
            faces_detected_total=result_dict["faces_detected"],
            recognized_count=result_dict["students_recognized"],
            unknown_count=result_dict["unknown_faces"],
            uncertain_count=0,
            attendance_marked_count=result_dict["attendance_marked"],
            summary_json={
                "results": result_dict["results"],
                "recognized": result_dict["recognized_students"],
                "unresolved": result_dict["unresolved_faces"],
                "duplicates_prevented": result_dict["duplicates_skipped"],
            },
            created_by=created_by,
            started_at=_utc_now(),
            completed_at=_utc_now(),
        )
        db.add(job)

        # 4. Audit Log
        db.add(
            AuditLog(
                action="MEDIA_IMAGE_ATTENDANCE",
                entity_type="attendance_sessions",
                entity_id=session_id,
                new_values={
                    "filename": filename,
                    "faces_detected": result_dict["faces_detected"],
                    "recognized": result_dict["students_recognized"],
                    "attendance_marked": result_dict["attendance_marked"],
                    "duplicates_prevented": result_dict["duplicates_skipped"],
                },
            )
        )
        await db.commit()
        await db.refresh(job)

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        return MediaAnalysisResponse(
            success=True,
            job_id=job.id,
            session_id=session_id,
            session_subject=session_obj.subject,
            session_class=session_obj.class_name,
            media_type="IMAGE",
            filename=filename,
            duration_sec=0.0,
            resolution=result_dict.get("resolution", "1920x1080"),
            faces_detected=result_dict["faces_detected"],
            facesDetected=result_dict["faces_detected"],
            recognized_count=result_dict["students_recognized"],
            studentsRecognized=result_dict["students_recognized"],
            unknown_count=result_dict["unknown_faces"],
            unknownFaces=result_dict["unknownFaces"],
            uncertain_count=0,
            low_quality_count=0,
            attendance_marked_count=result_dict["attendance_marked"],
            attendanceMarked=result_dict["attendance_marked"],
            duplicates_prevented=result_dict["duplicates_skipped"],
            recognized_students=[MediaAttendanceItem(**r) for r in result_dict["recognized_students"]],
            attendanceCandidates=result_dict["attendanceCandidates"],
            unresolved_faces=[UnresolvedFaceItem(**u) for u in result_dict["unresolved_faces"]],
            faces=[DetectedMediaFaceItem(**f) for f in result_dict["faces"]],
            results=result_dict["results"],
            annotatedImagePath=result_dict["annotated_image_url"],
            annotated_image_url=result_dict["annotated_image_url"],
            processing_time_ms=elapsed_ms,
            status="COMPLETED",
        )

    @classmethod
    async def create_video_job(
        cls,
        db: AsyncSession,
        session_id: str,
        video_bytes: bytes,
        filename: str,
        created_by: Optional[str] = None,
    ) -> MediaProcessingJob:
        """Uploads a video and initializes a background MediaProcessingJob."""
        session_res = await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == session_id)
        )
        session_obj = session_res.scalars().first()
        if not session_obj:
            raise SessionNotFoundError(f"Attendance session '{session_id}' not found.")

        file_id = os.urandom(8).hex()
        safe_name = Path(filename).name.replace(" ", "_")
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        stored_path.write_bytes(video_bytes)

        cap = cv2.VideoCapture(str(stored_path))
        if not cap.isOpened():
            stored_path.unlink(missing_ok=True)
            raise ValueError("Uploaded file is not a decodable video format. Supported: MP4, AVI, MKV, WebM, MOV.")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            stored_path.unlink(missing_ok=True)
            raise ValueError("Uploaded video contains 0 readable frames.")

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = round(total_frames / video_fps, 2) if video_fps > 0 else 0.0
        cap.release()

        job = MediaProcessingJob(
            session_id=session_id,
            media_type="VIDEO",
            filename=filename,
            file_path=str(stored_path),
            file_size_bytes=len(video_bytes),
            duration_sec=duration_sec,
            resolution=f"{width}x{height}",
            status="QUEUED",
            progress_pct=0.0,
            frames_total=total_frames,
            frames_processed=0,
            faces_detected_total=0,
            recognized_count=0,
            unknown_count=0,
            uncertain_count=0,
            attendance_marked_count=0,
            created_by=created_by,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        return job

    @classmethod
    async def process_video_background(
        cls,
        job_id: str,
        sample_fps: float = 2.0,
        session_factory: Optional[Any] = None,
    ) -> None:
        """Background worker task processing video frame-by-frame using InsightFace."""
        from backend.app.database.session import AsyncSessionLocal

        def _get_db():
            if session_factory is not None:
                return session_factory()
            return AsyncSessionLocal()

        cancel_event = asyncio.Event()
        _active_cancellation_events[job_id] = cancel_event

        try:
            async with _get_db() as db:
                job = await db.get(MediaProcessingJob, job_id)
                if not job:
                    logger.error(f"Job {job_id} not found.")
                    return

                job.status = "PROCESSING"
                job.started_at = _utc_now()
                await db.commit()

                file_path = job.file_path
                session_id = job.session_id
                filename = job.filename

            # Run video processing through media_processing_service
            video_result = await asyncio.to_thread(
                media_processing_service.process_video_attendance,
                video_input=file_path,
                session_id=session_id,
                sample_rate=sample_fps,
                filename=filename,
            )

            # Update job state
            async with _get_db() as db:
                j = await db.get(MediaProcessingJob, job_id)
                if j:
                    j.status = "COMPLETED"
                    j.progress_pct = 100.0
                    j.frames_processed = video_result["frames_processed"]
                    j.faces_detected_total = video_result["faces_detected"]
                    j.recognized_count = video_result["students_recognized"]
                    j.unknown_count = video_result["unknown_faces"]
                    j.attendance_marked_count = video_result["attendance_marked"]
                    j.summary_json = {
                        "results": video_result["results"],
                        "recognized": video_result["recognized_students"],
                        "unresolved": video_result["unresolved_faces"],
                        "duplicates_prevented": video_result["duplicates_skipped"],
                        "annotated_image_url": video_result.get("annotated_image_url"),
                    }
                    j.completed_at = _utc_now()

                    db.add(
                        AuditLog(
                            action="MEDIA_VIDEO_ATTENDANCE_COMPLETED",
                            entity_type="media_processing_jobs",
                            entity_id=job_id,
                            new_values={
                                "session_id": session_id,
                                "frames_processed": video_result["frames_processed"],
                                "faces_detected": video_result["faces_detected"],
                                "recognized": video_result["students_recognized"],
                                "attendance_marked": video_result["attendance_marked"],
                                "duplicates_prevented": video_result["duplicates_skipped"],
                            },
                        )
                    )
                    await db.commit()

            logger.info(f"Video job {job_id} completed successfully. Marked {video_result['attendance_marked']} students.")

        except Exception as proc_err:
            logger.error(f"Error during video processing job {job_id}: {proc_err}", exc_info=True)
            traceback.print_exc()
            async with _get_db() as db:
                j = await db.get(MediaProcessingJob, job_id)
                if j:
                    j.status = "FAILED"
                    j.error_message = str(proc_err)
                    j.completed_at = _utc_now()
                    await db.commit()
        finally:
            _active_cancellation_events.pop(job_id, None)

    @classmethod
    async def cancel_job(cls, db: AsyncSession, job_id: str) -> bool:
        """Signals cancellation to a running background video job."""
        if job_id in _active_cancellation_events:
            _active_cancellation_events[job_id].set()

        job = await db.get(MediaProcessingJob, job_id)
        if not job:
            return False

        if job.status in ["QUEUED", "PROCESSING"]:
            job.status = "CANCELLED"
            job.completed_at = _utc_now()
            await db.commit()
            return True
        return False

    @classmethod
    async def delete_job(cls, db: AsyncSession, job_id: str) -> bool:
        """Deletes a media processing job and removes any stored media file."""
        job = await db.get(MediaProcessingJob, job_id)
        if not job:
            return False

        if job.file_path:
            p = Path(job.file_path)
            p.unlink(missing_ok=True)

        await db.delete(job)
        await db.commit()
        return True

    @classmethod
    async def get_job_by_id(cls, db: AsyncSession, job_id: str) -> Optional[MediaJobResponse]:
        """Fetches a media processing job with joined session metadata."""
        query = (
            select(MediaProcessingJob)
            .where(MediaProcessingJob.id == job_id)
            .options(selectinload(MediaProcessingJob.session))
        )
        res = await db.execute(query)
        job = res.scalars().first()
        if not job:
            return None

        return MediaJobResponse(
            id=job.id,
            session_id=job.session_id,
            session_subject=job.session.subject if job.session else None,
            session_class=job.session.class_name if job.session else None,
            media_type=job.media_type,
            filename=job.filename,
            file_size_bytes=job.file_size_bytes,
            duration_sec=job.duration_sec,
            resolution=job.resolution,
            status=job.status,
            progress_pct=job.progress_pct,
            frames_total=job.frames_total,
            frames_processed=job.frames_processed,
            faces_detected_total=job.faces_detected_total,
            recognized_count=job.recognized_count,
            unknown_count=job.unknown_count,
            uncertain_count=job.uncertain_count,
            attendance_marked_count=job.attendance_marked_count,
            summary_json=job.summary_json,
            error_message=job.error_message,
            created_by=job.created_by,
            started_at=job.started_at,
            completed_at=job.completed_at,
            created_at=job.created_at,
        )

    @classmethod
    async def list_jobs(
        cls,
        db: AsyncSession,
        session_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[MediaJobResponse]:
        """Lists historical media processing jobs ordered by creation date."""
        query = (
            select(MediaProcessingJob)
            .options(selectinload(MediaProcessingJob.session))
            .order_by(desc(MediaProcessingJob.created_at))
            .limit(limit)
        )
        if session_id:
            query = query.where(MediaProcessingJob.session_id == session_id)

        res = await db.execute(query)
        jobs = res.scalars().all()

        return [
            MediaJobResponse(
                id=j.id,
                session_id=j.session_id,
                session_subject=j.session.subject if j.session else None,
                session_class=j.session.class_name if j.session else None,
                media_type=j.media_type,
                filename=j.filename,
                file_size_bytes=j.file_size_bytes,
                duration_sec=j.duration_sec,
                resolution=j.resolution,
                status=j.status,
                progress_pct=j.progress_pct,
                frames_total=j.frames_total,
                frames_processed=j.frames_processed,
                faces_detected_total=j.faces_detected_total,
                recognized_count=j.recognized_count,
                unknown_count=j.unknown_count,
                uncertain_count=j.uncertain_count,
                attendance_marked_count=j.attendance_marked_count,
                summary_json=j.summary_json,
                error_message=j.error_message,
                created_by=j.created_by,
                started_at=j.started_at,
                completed_at=j.completed_at,
                created_at=j.created_at,
            )
            for j in jobs
        ]
