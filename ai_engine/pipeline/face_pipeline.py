import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from ai_engine.alignment.face_aligner import FaceAligner
from ai_engine.base import (
    BoundingBox,
    DecisionState,
    DetectedFace,
    MatchCandidate,
    PoseEstimate,
    QualityMetrics,
    RecognitionResult,
)
from ai_engine.detection.scrfd import SCRFDFaceDetector
from ai_engine.liveness.liveness_detector import LivenessDetector
from ai_engine.quality.pose_estimator import HeadPoseEstimator
from ai_engine.quality.quality_analyzer import FaceQualityAnalyzer
from ai_engine.recognition.arcface import ArcFaceEmbeddingModel
from ai_engine.recognition.vector_matcher import EnrolledTemplate, VectorMatcher
from ai_engine.tracking.byte_tracker import TrackedFace


class FaceRecognitionPipeline:
    """Unified Face Recognition Pipeline coordinating Detection -> Quality -> Liveness -> Alignment -> Embedding -> Matching."""

    def __init__(
        self,
        detector: Optional[SCRFDFaceDetector] = None,
        embedder: Optional[ArcFaceEmbeddingModel] = None,
        matcher: Optional[VectorMatcher] = None,
        liveness_detector: Optional[LivenessDetector] = None,
        quality_analyzer: Optional[FaceQualityAnalyzer] = None,
        pose_estimator: Optional[HeadPoseEstimator] = None,
        aligner: Optional[FaceAligner] = None,
    ):
        self.detector = detector or SCRFDFaceDetector(det_size=(640, 640), det_thresh=0.50)
        self.embedder = embedder or ArcFaceEmbeddingModel()
        self.matcher = matcher or VectorMatcher()
        self.liveness_detector = liveness_detector or LivenessDetector()
        self.quality_analyzer = quality_analyzer or FaceQualityAnalyzer()
        self.pose_estimator = pose_estimator or HeadPoseEstimator()
        self.aligner = aligner or FaceAligner(crop_size=112)

    def load_gallery(self, templates: List[EnrolledTemplate]) -> None:
        """Loads and indexes enrolled student templates into the vector search matrix."""
        self.matcher.build_index(templates)

    def process_frame(
        self,
        image: np.ndarray,
        run_quality_check: bool = True,
        run_liveness_check: bool = False,  # Optional flag for passive liveness
        top_k: int = 3,
    ) -> Tuple[List[RecognitionResult], Dict[str, float]]:
        """Executes full face recognition pipeline on a video frame or image.

        Returns:
            Tuple[List[RecognitionResult], Dict[str, float]]: (results, latency_breakdown_ms)
        """
        latencies: Dict[str, float] = {}
        t0 = time.perf_counter()

        # 1. Face Detection
        detected_faces = self.detector.detect(image)
        t1 = time.perf_counter()
        latencies["detection_ms"] = round((t1 - t0) * 1000.0, 2)

        results: List[Optional[RecognitionResult]] = [None] * len(detected_faces)
        embedding_time = 0.0
        matching_time = 0.0
        liveness_time = 0.0

        valid_faces_info: List[Tuple[int, DetectedFace, QualityMetrics, PoseEstimate, Any, np.ndarray]] = []

        for idx, face in enumerate(detected_faces):
            # 2. Quality & Pose Analysis
            quality = self.quality_analyzer.analyze(image, face.bbox)
            pose = self.pose_estimator.estimate(face.landmarks)

            # If quality check is active and face is unusable, classify as UNCERTAIN
            if run_quality_check and not quality.is_valid:
                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=face.bbox,
                    landmarks=face.landmarks,
                    decision=DecisionState.UNCERTAIN,
                    best_match=None,
                    top_candidates=[],
                    quality=quality,
                    pose=pose,
                    embedding=None,
                    is_live=False,
                    liveness_score=0.0,
                    decision_reason=f"Quality rejected: {quality.rejection_reason}",
                )
                continue

            # 3. Liveness / Anti-Spoofing Check
            t_liv_start = time.perf_counter()
            liveness_res = self.liveness_detector.predict(image, face.bbox, face.landmarks)
            liveness_time += (time.perf_counter() - t_liv_start) * 1000.0

            if run_liveness_check and not liveness_res.is_live:
                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=face.bbox,
                    landmarks=face.landmarks,
                    decision=DecisionState.UNCERTAIN,
                    best_match=None,
                    top_candidates=[],
                    quality=quality,
                    pose=pose,
                    embedding=None,
                    is_live=False,
                    liveness_score=liveness_res.liveness_score,
                    decision_reason=f"Liveness rejected: {liveness_res.rejection_reason}",
                )
                continue

            # 4. Face Alignment for valid face
            aligned_crop = self.aligner.align(image, face.landmarks)
            valid_faces_info.append((idx, face, quality, pose, liveness_res, aligned_crop))

        # 4b. Batch ArcFace Embedding Generation for all valid faces
        if valid_faces_info:
            aligned_crops = [info[5] for info in valid_faces_info]
            t_emb_start = time.perf_counter()
            embeddings = self.embedder.extract_batch(aligned_crops)
            embedding_time = (time.perf_counter() - t_emb_start) * 1000.0

            # 5. Vector Similarity Matching for each extracted embedding
            for i, (idx, face, quality, pose, liveness_res, _) in enumerate(valid_faces_info):
                embedding = embeddings[i]
                t_match_start = time.perf_counter()
                decision, best_match, candidates, reason = self.matcher.match(
                    query_embedding=embedding,
                    top_k=top_k,
                )
                matching_time += (time.perf_counter() - t_match_start) * 1000.0

                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=face.bbox,
                    landmarks=face.landmarks,
                    decision=decision,
                    best_match=best_match,
                    top_candidates=candidates,
                    quality=quality,
                    pose=pose,
                    embedding=embedding,
                    is_live=liveness_res.is_live,
                    liveness_score=liveness_res.liveness_score,
                    decision_reason=reason,
                )

        latencies["liveness_ms"] = round(liveness_time, 2)
        latencies["embedding_ms"] = round(embedding_time, 2)
        latencies["matching_ms"] = round(matching_time, 2)
        latencies["total_pipeline_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)

        return results, latencies

    def process_tracked_frame(
        self,
        image: np.ndarray,
        stream_state: Any,
        run_quality_check: bool = True,
        run_liveness_check: bool = False,
        top_k: int = 3,
    ) -> Tuple[List[RecognitionResult], Dict[str, float]]:
        """Processes a frame using ByteTrack multi-target tracking, TrackIdentityCache gating, and TemporalVerifier."""
        latencies: Dict[str, float] = {}
        t0 = time.perf_counter()

        stream_state.frame_counter += 1
        frame_idx = stream_state.frame_counter

        # 1. Face Detection
        detected_faces = self.detector.detect(image)
        t1 = time.perf_counter()
        latencies["detection_ms"] = round((t1 - t0) * 1000.0, 2)

        # 2. Multi-Face Tracking (ByteTrack)
        t_track_start = time.perf_counter()
        tracked_faces: List[TrackedFace] = stream_state.tracker.update(detected_faces)
        latencies["tracking_ms"] = round((time.perf_counter() - t_track_start) * 1000.0, 2)

        # Prune dead tracks from identity cache
        active_track_ids = [t.track_id for t in tracked_faces]
        stream_state.identity_cache.prune_stale(active_track_ids)

        results: List[Optional[RecognitionResult]] = [None] * len(tracked_faces)
        embedding_time = 0.0
        matching_time = 0.0
        liveness_time = 0.0
        arcface_calls = 0
        cached_reuses = 0

        # Collect tracks requiring ArcFace inference
        unverified_tracks: List[Tuple[int, TrackedFace, QualityMetrics, PoseEstimate, Any, np.ndarray]] = []

        for idx, trk in enumerate(tracked_faces):
            # Check if track is occluded or missing landmarks
            if trk.is_occluded or trk.landmarks is None:
                v_res = stream_state.verifier.add_observation(
                    track_id=trk.track_id,
                    match=None,
                    is_valid_quality=False,
                    is_occluded=True,
                    liveness_score=1.0,
                )
                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=trk.bbox,
                    landmarks=trk.landmarks if trk.landmarks is not None else np.empty((0, 2), dtype=np.float32),
                    decision=v_res.decision,
                    best_match=None,
                    top_candidates=[],
                    quality=None,
                    pose=None,
                    embedding=None,
                    is_live=True,
                    liveness_score=1.0,
                    decision_reason=f"Track occluded/interpolated; {v_res.reason}",
                    track_id=trk.track_id,
                    status="VERIFYING" if v_res.provisional_name else "UNKNOWN",
                    provisional_name=v_res.provisional_name,
                    frames_needed=v_res.frames_needed,
                    confidence_history=v_res.confidence_history,
                )
                continue

            # Quality & Pose Analysis
            quality = self.quality_analyzer.analyze(image, trk.bbox)
            pose = self.pose_estimator.estimate(trk.landmarks)

            if run_quality_check and not quality.is_valid:
                v_res = stream_state.verifier.add_observation(
                    track_id=trk.track_id,
                    match=None,
                    is_valid_quality=False,
                    is_occluded=False,
                    liveness_score=1.0,
                )
                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=trk.bbox,
                    landmarks=trk.landmarks,
                    decision=DecisionState.UNCERTAIN,
                    best_match=None,
                    top_candidates=[],
                    quality=quality,
                    pose=pose,
                    embedding=None,
                    is_live=False,
                    liveness_score=0.0,
                    decision_reason=f"Quality rejected: {quality.rejection_reason}",
                    track_id=trk.track_id,
                    status="QUALITY_REJECTED",
                    provisional_name=v_res.provisional_name,
                    frames_needed=v_res.frames_needed,
                    confidence_history=v_res.confidence_history,
                )
                continue

            # Liveness / Anti-Spoofing Check
            if run_liveness_check:
                t_liv_start = time.perf_counter()
                liv_res = self.liveness_detector.predict(image, trk.bbox, trk.landmarks)
                liveness_time += (time.perf_counter() - t_liv_start) * 1000.0

                if not liv_res.is_live:
                    v_res = stream_state.verifier.add_observation(
                        track_id=trk.track_id,
                        match=None,
                        is_valid_quality=True,
                        is_occluded=False,
                        liveness_score=liv_res.liveness_score,
                    )
                    results[idx] = RecognitionResult(
                        face_idx=idx,
                        bbox=trk.bbox,
                        landmarks=trk.landmarks,
                        decision=DecisionState.UNCERTAIN,
                        best_match=None,
                        top_candidates=[],
                        quality=quality,
                        pose=pose,
                        embedding=None,
                        is_live=False,
                        liveness_score=liv_res.liveness_score,
                        decision_reason=f"Liveness rejected: {liv_res.rejection_reason}",
                        track_id=trk.track_id,
                        status="UNKNOWN",
                        provisional_name=v_res.provisional_name,
                        frames_needed=v_res.frames_needed,
                        confidence_history=v_res.confidence_history,
                    )
                    continue
            else:
                from ai_engine.liveness.base import AttackType, LivenessResult
                liv_res = LivenessResult(is_live=True, liveness_score=1.0, attack_type=AttackType.GENUINE, confidence_pct=100.0)

            # Recognition Gating: Check Identity Cache!
            should_run = stream_state.identity_cache.should_run_recognition(
                track_id=trk.track_id,
                frame_idx=frame_idx,
                is_occluded=trk.is_occluded,
                time_since_update=trk.time_since_update,
            )

            if not should_run:
                # CASE B: CONFIRMED CACHED TRACK -> REUSE IDENTITY, SKIP ARCFACE!
                cached = stream_state.identity_cache.get(trk.track_id)
                assert cached is not None
                stream_state.identity_cache.touch(trk.track_id, frame_idx)
                cached_reuses += 1

                cached_cand = MatchCandidate(
                    student_id=cached.student_id,
                    student_code=cached.student_code,
                    roll_number=cached.roll_number,
                    name=cached.name,
                    similarity=cached.confidence,
                    confidence_pct=round(float(np.clip((cached.confidence - 0.35) / 0.65 * 100.0, 0.0, 100.0)), 1),
                )
                v_res = stream_state.verifier.add_observation(
                    track_id=trk.track_id,
                    match=cached_cand,
                    is_valid_quality=True,
                    is_occluded=False,
                    liveness_score=cached.liveness_score,
                )

                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=trk.bbox,
                    landmarks=trk.landmarks,
                    decision=DecisionState.KNOWN,
                    best_match=cached_cand,
                    top_candidates=[cached_cand],
                    quality=quality,
                    pose=pose,
                    embedding=None,
                    is_live=liv_res.is_live,
                    liveness_score=liv_res.liveness_score,
                    decision_reason=f"Identity reused from track cache (ArcFace skipped, track #{trk.track_id})",
                    track_id=trk.track_id,
                    status="VERIFIED",
                    provisional_name=cached.name,
                    frames_needed=0,
                    confidence_history=v_res.confidence_history,
                )
            else:
                # CASE A / C / D: Needs fresh ArcFace recognition
                aligned_crop = self.aligner.align(image, trk.landmarks)
                unverified_tracks.append((idx, trk, quality, pose, liv_res, aligned_crop))

        # Batch ArcFace Extraction for unverified tracks
        if unverified_tracks:
            aligned_crops = [u[5] for u in unverified_tracks]
            t_emb_start = time.perf_counter()
            embeddings = self.embedder.extract_batch(aligned_crops)
            embedding_time = (time.perf_counter() - t_emb_start) * 1000.0
            arcface_calls = len(unverified_tracks)

            for i, (idx, trk, quality, pose, liv_res, _) in enumerate(unverified_tracks):
                embedding = embeddings[i]
                t_match_start = time.perf_counter()
                decision, best_match, candidates, reason = self.matcher.match(
                    query_embedding=embedding,
                    top_k=top_k,
                )
                matching_time += (time.perf_counter() - t_match_start) * 1000.0

                # Temporal Multi-Frame Verification
                v_res = stream_state.verifier.add_observation(
                    track_id=trk.track_id,
                    match=best_match,
                    is_valid_quality=True,
                    is_occluded=False,
                    liveness_score=liv_res.liveness_score,
                )

                # Determine final status
                if v_res.is_confirmed and v_res.decision == DecisionState.KNOWN and v_res.confirmed_student_id:
                    status_str = "VERIFIED"
                    final_decision = DecisionState.KNOWN
                    stream_state.identity_cache.update_identity(
                        track_id=trk.track_id,
                        student_id=v_res.confirmed_student_id,
                        student_code=v_res.confirmed_code or (best_match.student_code if best_match else ""),
                        roll_number=v_res.confirmed_roll or (best_match.roll_number if best_match else ""),
                        name=v_res.confirmed_name or (best_match.name if best_match else ""),
                        confidence=v_res.average_similarity,
                        is_confirmed=True,
                        liveness_score=liv_res.liveness_score,
                        frame_idx=frame_idx,
                    )
                elif decision == DecisionState.KNOWN or decision == DecisionState.UNCERTAIN or v_res.provisional_name:
                    status_str = "VERIFYING"
                    final_decision = DecisionState.UNCERTAIN
                else:
                    status_str = "UNKNOWN"
                    final_decision = DecisionState.UNKNOWN

                results[idx] = RecognitionResult(
                    face_idx=idx,
                    bbox=trk.bbox,
                    landmarks=trk.landmarks,
                    decision=final_decision,
                    best_match=best_match,
                    top_candidates=candidates,
                    quality=quality,
                    pose=pose,
                    embedding=embedding,
                    is_live=liv_res.is_live,
                    liveness_score=liv_res.liveness_score,
                    decision_reason=reason if not v_res.is_confirmed else v_res.reason,
                    track_id=trk.track_id,
                    status=status_str,
                    provisional_name=v_res.provisional_name or (best_match.name if best_match else None),
                    frames_needed=v_res.frames_needed,
                    confidence_history=v_res.confidence_history,
                )

        latencies["liveness_ms"] = round(liveness_time, 2)
        latencies["embedding_ms"] = round(embedding_time, 2)
        latencies["matching_ms"] = round(matching_time, 2)
        latencies["arcface_calls"] = float(arcface_calls)
        latencies["cached_reuses"] = float(cached_reuses)
        latencies["total_pipeline_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)

        return results, latencies

    def process_enrollment_image(
        self,
        image: np.ndarray,
    ) -> Tuple[bool, Optional[np.ndarray], Optional[QualityMetrics], Optional[PoseEstimate], str]:
        """Evaluates a candidate enrollment photo and extracts the normalized template if acceptable.

        Returns:
            Tuple[is_accepted, embedding, quality, pose, guidance_message]
        """
        detected_faces = self.detector.detect(image)

        if len(detected_faces) == 0:
            return False, None, None, None, "No face detected. Position your face clearly in frame."

        if len(detected_faces) > 1:
            return False, None, None, None, f"Multiple faces ({len(detected_faces)}) detected. Ensure only one person is in view."

        face = detected_faces[0]
        quality = self.quality_analyzer.analyze(image, face.bbox)
        if not quality.is_valid:
            return False, None, quality, None, quality.rejection_reason or "Image quality insufficient."

        pose = self.pose_estimator.estimate(face.landmarks)
        if not pose.is_frontal:
            return False, None, quality, pose, f"Face angle is too steep (Yaw {pose.yaw}°, Pitch {pose.pitch}°). Face closer to center."

        # Verify liveness during enrollment
        liv = self.liveness_detector.predict(image, face.bbox, face.landmarks)
        if not liv.is_live:
            return False, None, quality, pose, f"Enrollment liveness check failed: {liv.rejection_reason}"

        aligned_crop = self.aligner.align(image, face.landmarks)
        embedding = self.embedder.extract_from_crop(aligned_crop)

        return True, embedding, quality, pose, "Valid sample accepted."
