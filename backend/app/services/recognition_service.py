import asyncio
from dataclasses import dataclass, field
import time
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_engine.base import DecisionState, RecognitionResult
from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
from ai_engine.recognition.vector_matcher import EnrolledTemplate
from ai_engine.tracking.byte_tracker import ByteFaceTracker
from ai_engine.tracking.identity_cache import TrackIdentityCache
from ai_engine.verification.temporal_verifier import TemporalVerifier
from backend.app.core.logging import logger
from backend.app.models.entities import FaceProfile, Student
from backend.app.schemas.recognition import (
    AIRecognitionConfig,
    CandidateDTO,
    DetectedFaceResultDTO,
    RecognitionResponse,
    ThresholdsConfig,
)

_pipeline_instance: Optional[FaceRecognitionPipeline] = None
_pipeline_lock = asyncio.Lock()
_active_ai_config = AIRecognitionConfig()


@dataclass
class RecognitionStreamState:
    """Encapsulates tracking, temporal verification, and identity caching state for a stream."""
    session_id: Optional[str]
    camera_id: Optional[str]
    tracker: ByteFaceTracker
    verifier: TemporalVerifier
    identity_cache: TrackIdentityCache
    frame_counter: int = 0
    last_accessed: float = field(default_factory=time.time)


_stream_states: Dict[Tuple[str, str], RecognitionStreamState] = {}


def _get_or_create_stream_state(session_id: Optional[str], camera_id: Optional[str]) -> RecognitionStreamState:
    """Retrieves or creates an isolated RecognitionStreamState for the given (session_id, camera_id)."""
    now = time.time()

    # Periodic cleanup of idle stream states (> 10 minutes inactive)
    idle_keys = [
        k for k, state in _stream_states.items()
        if (now - state.last_accessed) > 600.0
    ]
    for k in idle_keys:
        logger.info(f"Evicting idle recognition stream state for key {k}")
        _stream_states.pop(k, None)

    key = (session_id or "default", camera_id or "default")
    if key not in _stream_states:
        config = RecognitionService.get_config()
        tracker = ByteFaceTracker(
            min_hits=1,
            max_lost_frames=15,
            iou_threshold=0.30,
            high_score_thresh=config.detection_confidence_threshold,
            low_score_thresh=0.20,
        )
        verifier = TemporalVerifier(
            window_size=config.window_size,
            min_required_frames=config.min_required_frames,
            min_consistency_ratio=0.75,
            min_average_confidence=config.known_threshold,
            min_liveness_threshold=0.70,
        )
        identity_cache = TrackIdentityCache(
            revalidation_interval_frames=30,
            max_lost_frames_for_cache=3,
            cache_ttl_seconds=30.0,
        )
        _stream_states[key] = RecognitionStreamState(
            session_id=session_id,
            camera_id=camera_id,
            tracker=tracker,
            verifier=verifier,
            identity_cache=identity_cache,
        )
        logger.info(f"Created new RecognitionStreamState for stream key {key}")

    state = _stream_states[key]
    state.last_accessed = now
    return state


def get_pipeline() -> FaceRecognitionPipeline:
    """Singleton getter for the FaceRecognitionPipeline."""
    global _pipeline_instance
    if _pipeline_instance is None:
        logger.info("Initializing FaceRecognitionPipeline instance...")
        _pipeline_instance = FaceRecognitionPipeline()
    return _pipeline_instance


class RecognitionService:
    """Service orchestrating face recognition and gallery synchronization with PostgreSQL."""

    @classmethod
    def get_config(cls) -> AIRecognitionConfig:
        return _active_ai_config

    @classmethod
    def set_config(cls, config: AIRecognitionConfig) -> AIRecognitionConfig:
        global _active_ai_config
        _active_ai_config = config
        pipeline = get_pipeline()

        # Update Matcher
        pipeline.matcher.set_thresholds(
            known_threshold=config.known_threshold,
            uncertain_threshold=config.uncertain_threshold,
            margin_threshold=config.margin_threshold,
        )

        # Update Quality Analyzer
        pipeline.quality_analyzer.set_thresholds(
            min_face_size=config.min_face_size,
            min_sharpness=config.min_sharpness,
            min_brightness=config.min_brightness,
            max_brightness=config.max_brightness,
        )

        # Update Pose Estimator
        pipeline.pose_estimator.set_thresholds(
            max_yaw=config.max_yaw,
            max_pitch=config.max_pitch,
        )

        # Update Liveness Detector
        pipeline.liveness_detector.set_thresholds(
            liveness_threshold=config.liveness_threshold,
            mode=config.liveness_mode,
        )

        # Update Face Detector
        pipeline.detector.set_thresholds(
            det_thresh=config.detection_confidence_threshold,
        )

        for state in _stream_states.values():
            state.verifier.window_size = config.window_size
            state.verifier.min_required_frames = config.min_required_frames
            state.verifier.min_average_confidence = config.known_threshold
            state.tracker.high_score_thresh = config.detection_confidence_threshold

        logger.info(f"Updated AI Recognition configuration: known_thresh={config.known_threshold}, liveness_mode={config.liveness_mode}")
        return _active_ai_config

    @classmethod
    def reset_stream_state(cls, session_id: Optional[str] = None, camera_id: Optional[str] = None) -> bool:
        """Explicitly resets/clears stream tracking and identity cache state for a session or camera."""
        key = (session_id or "default", camera_id or "default")
        if key in _stream_states:
            del _stream_states[key]
            logger.info(f"Reset recognition stream state for key {key}")
            return True
        return False

    @classmethod
    def clear_all_stream_states(cls) -> int:
        """Clears all active stream states."""
        count = len(_stream_states)
        _stream_states.clear()
        logger.info(f"Cleared {count} recognition stream states")
        return count

    @classmethod
    async def sync_gallery_from_db(cls, db: AsyncSession) -> int:
        """Loads all active face profiles from the database into the in-memory vector index."""
        pipeline = get_pipeline()

        query = (
            select(FaceProfile)
            .join(Student, FaceProfile.student_id == Student.id)
            .where(Student.status == "ACTIVE")
            .options(selectinload(FaceProfile.student))
        )
        result = await db.execute(query)
        profiles = result.scalars().all()

        templates: List[EnrolledTemplate] = []
        for p in profiles:
            student = p.student
            if not student:
                continue

            emb_data = p.embedding_data
            if isinstance(emb_data, list) and len(emb_data) == 512:
                template = EnrolledTemplate(
                    profile_id=p.id,
                    student_id=student.id,
                    student_code=student.student_code,
                    roll_number=student.roll_number,
                    name=f"{student.first_name} {student.last_name}",
                    embedding=np.array(emb_data, dtype=np.float32),
                    quality_score=p.quality_score,
                    pose_type=p.pose_type,
                )
                templates.append(template)

        async with _pipeline_lock:
            pipeline.load_gallery(templates)

        logger.info(f"Synchronized gallery index: {len(templates)} templates across {pipeline.matcher.total_students} students.")
        return len(templates)

    @classmethod
    async def process_image_bytes(
        cls,
        db: AsyncSession,
        image_bytes: bytes,
        top_k: int = 3,
        run_quality_check: bool = True,
        session_id: Optional[str] = None,
        camera_id: Optional[str] = None,
    ) -> RecognitionResponse:
        """Runs face recognition on an uploaded image."""
        pipeline = get_pipeline()

        # If gallery is empty, sync from database
        if pipeline.matcher.total_templates == 0:
            await cls.sync_gallery_from_db(db)

        # Decode image
        np_arr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image. Please provide a valid JPEG or PNG file.")

        is_stream = (session_id is not None) or (camera_id is not None)

        async with _pipeline_lock:
            if is_stream:
                stream_state = _get_or_create_stream_state(session_id, camera_id)
                results, latencies = await asyncio.to_thread(
                    pipeline.process_tracked_frame,
                    image=image,
                    stream_state=stream_state,
                    run_quality_check=run_quality_check,
                    run_liveness_check=(_active_ai_config.liveness_mode != "OFF"),
                    top_k=top_k,
                )
            else:
                results, latencies = await asyncio.to_thread(
                    pipeline.process_frame,
                    image=image,
                    run_quality_check=run_quality_check,
                    top_k=top_k,
                )

        face_dtos: List[DetectedFaceResultDTO] = []
        for r in results:
            best_cand_dto = None
            if r.best_match:
                best_cand_dto = CandidateDTO(
                    student_id=r.best_match.student_id,
                    student_code=r.best_match.student_code,
                    roll_number=r.best_match.roll_number,
                    name=r.best_match.name,
                    similarity=r.best_match.similarity,
                    confidence_pct=r.best_match.confidence_pct,
                )

            top_dtos = [
                CandidateDTO(
                    student_id=c.student_id,
                    student_code=c.student_code,
                    roll_number=c.roll_number,
                    name=c.name,
                    similarity=c.similarity,
                    confidence_pct=c.confidence_pct,
                )
                for c in r.top_candidates
            ]

            # Determine explicit visual status
            if r.quality and not r.quality.is_valid:
                status_str = "QUALITY_REJECTED"
            elif r.decision == DecisionState.KNOWN:
                status_str = "VERIFIED"
            elif r.decision == DecisionState.UNCERTAIN:
                status_str = "VERIFYING" if (r.provisional_name or r.best_match) else "UNKNOWN"
            else:
                status_str = "UNKNOWN"

            final_status = r.status if r.status is not None else status_str
            final_prov_name = r.provisional_name if r.provisional_name is not None else (r.best_match.name if r.best_match else None)
            final_frames_needed = r.frames_needed if r.frames_needed is not None else (0 if final_status == "VERIFIED" else 1)
            final_conf_history = r.confidence_history if r.confidence_history else ([round(r.best_match.similarity, 3)] if r.best_match else [])

            face_dtos.append(
                DetectedFaceResultDTO(
                    face_idx=r.face_idx,
                    bbox=r.bbox.to_list(),
                    landmarks=r.landmarks.tolist() if r.landmarks is not None else [],
                    decision=r.decision.value,
                    best_match=best_cand_dto,
                    top_candidates=top_dtos,
                    sharpness=r.quality.sharpness if r.quality else 0.0,
                    brightness=r.quality.brightness if r.quality else 0.0,
                    is_quality_valid=r.quality.is_valid if r.quality else False,
                    pose_type=r.pose.pose_type if r.pose else "UNKNOWN",
                    yaw=r.pose.yaw if r.pose else 0.0,
                    pitch=r.pose.pitch if r.pose else 0.0,
                    roll=r.pose.roll if r.pose else 0.0,
                    decision_reason=r.decision_reason,
                    track_id=r.track_id,
                    status=final_status,
                    provisional_name=final_prov_name,
                    frames_needed=final_frames_needed,
                    confidence_history=final_conf_history,
                    liveness_score=r.liveness_score,
                    is_live=r.is_live,
                )
            )

        thresholds = {
            "known_threshold": pipeline.matcher.known_threshold,
            "uncertain_threshold": pipeline.matcher.uncertain_threshold,
            "margin_threshold": pipeline.matcher.margin_threshold,
            "liveness_mode": _active_ai_config.liveness_mode,
        }

        return RecognitionResponse(
            total_faces_detected=len(results),
            faces=face_dtos,
            latency_breakdown_ms=latencies,
            thresholds_applied=thresholds,
            index_student_count=pipeline.matcher.total_students,
        )

    @classmethod
    def get_thresholds(cls) -> ThresholdsConfig:
        pipeline = get_pipeline()
        return ThresholdsConfig(
            known_threshold=pipeline.matcher.known_threshold,
            uncertain_threshold=pipeline.matcher.uncertain_threshold,
            margin_threshold=pipeline.matcher.margin_threshold,
        )

    @classmethod
    def set_thresholds(cls, config: ThresholdsConfig) -> ThresholdsConfig:
        pipeline = get_pipeline()
        pipeline.matcher.set_thresholds(
            known_threshold=config.known_threshold,
            uncertain_threshold=config.uncertain_threshold,
            margin_threshold=config.margin_threshold,
        )
        logger.info(f"Updated recognition thresholds: known={config.known_threshold}, uncertain={config.uncertain_threshold}, margin={config.margin_threshold}")
        return cls.get_thresholds()

