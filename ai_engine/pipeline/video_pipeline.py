import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

from ai_engine.alignment.face_aligner import FaceAligner
from ai_engine.base import BoundingBox, DecisionState, DetectedFace, MatchCandidate, PoseEstimate, QualityMetrics
from ai_engine.detection.scrfd import SCRFDFaceDetector
from ai_engine.liveness.liveness_detector import LivenessDetector
from ai_engine.quality.pose_estimator import HeadPoseEstimator
from ai_engine.quality.quality_analyzer import FaceQualityAnalyzer
from ai_engine.recognition.arcface import ArcFaceEmbeddingModel
from ai_engine.recognition.vector_matcher import EnrolledTemplate, VectorMatcher
from ai_engine.tracking.byte_tracker import ByteFaceTracker, TrackedFace
from ai_engine.tracking.identity_cache import TrackIdentityCache
from ai_engine.verification.temporal_verifier import TemporalVerificationResult, TemporalVerifier


@dataclass
class TrackedRecognitionResult:
    track_id: int
    bbox: BoundingBox
    state: str  # 'TENTATIVE', 'CONFIRMED', 'OCCLUDED'
    decision: DecisionState
    is_confirmed: bool
    confirmed_student_id: Optional[str]
    confirmed_code: Optional[str]
    confirmed_roll: Optional[str]
    confirmed_name: Optional[str]
    average_similarity: float
    current_similarity: float
    is_live: bool
    liveness_score: float
    votes_count: int
    total_valid_frames: int
    is_occluded: bool
    provisional_student_id: Optional[str] = None
    provisional_code: Optional[str] = None
    provisional_roll: Optional[str] = None
    provisional_name: Optional[str] = None
    frames_needed: int = 0
    confidence_history: List[float] = field(default_factory=list)
    quality: Optional[QualityMetrics] = None
    pose: Optional[PoseEstimate] = None
    decision_reason: str = ""


class VideoRecognitionPipeline:
    """End-to-End Video Stream Recognition Pipeline combining Detection, Tracking, Liveness, and Temporal Verification."""

    def __init__(
        self,
        detector: Optional[SCRFDFaceDetector] = None,
        tracker: Optional[ByteFaceTracker] = None,
        embedder: Optional[ArcFaceEmbeddingModel] = None,
        matcher: Optional[VectorMatcher] = None,
        liveness_detector: Optional[LivenessDetector] = None,
        temporal_verifier: Optional[TemporalVerifier] = None,
        quality_analyzer: Optional[FaceQualityAnalyzer] = None,
        pose_estimator: Optional[HeadPoseEstimator] = None,
        aligner: Optional[FaceAligner] = None,
        identity_cache: Optional[TrackIdentityCache] = None,
        detection_interval: int = 2,
    ):
        self.detector = detector or SCRFDFaceDetector(det_size=(320, 320), det_thresh=0.50)
        self.tracker = tracker or ByteFaceTracker(min_hits=2, max_lost_frames=15, iou_threshold=0.30)
        self.embedder = embedder or ArcFaceEmbeddingModel()
        self.matcher = matcher or VectorMatcher()
        self.liveness_detector = liveness_detector or LivenessDetector()
        self.verifier = temporal_verifier or TemporalVerifier(window_size=7, min_required_frames=4)
        self.quality_analyzer = quality_analyzer or FaceQualityAnalyzer()
        self.pose_estimator = pose_estimator or HeadPoseEstimator()
        self.aligner = aligner or FaceAligner(crop_size=112)
        self.identity_cache = identity_cache or TrackIdentityCache()
        self.detection_interval = detection_interval

        self.frame_index = 0
        self._last_detections: List[DetectedFace] = []

    def load_gallery(self, templates: List[EnrolledTemplate]) -> None:
        """Loads and indexes enrolled student templates into the vector search matrix."""
        self.matcher.build_index(templates)

    def reset_tracking(self) -> None:
        """Resets active tracker state and temporal buffers."""
        self.tracker = ByteFaceTracker(min_hits=2, max_lost_frames=15, iou_threshold=0.30)
        self.verifier.clear()
        self.identity_cache.clear()
        self.frame_index = 0
        self._last_detections = []

    def process_frame(
        self,
        image: np.ndarray,
        force_detection: bool = False,
    ) -> Tuple[List[TrackedRecognitionResult], Dict[str, float]]:
        """Processes a single incoming video frame through tracking, liveness, occlusion check, and temporal verification."""
        t0 = time.perf_counter()
        latencies: Dict[str, float] = {}
        self.frame_index += 1

        # 1. Detection (run periodically or when forced)
        should_detect = force_detection or (self.frame_index % self.detection_interval == 1) or (self.detection_interval <= 1)

        t_det_start = time.perf_counter()
        if should_detect:
            self._last_detections = self.detector.detect(image)
        t_det_end = time.perf_counter()
        latencies["detection_ms"] = round((t_det_end - t_det_start) * 1000.0, 2)

        # 2. Multi-Face Tracking
        t_track_start = time.perf_counter()
        tracked_faces: List[TrackedFace] = self.tracker.update(self._last_detections)
        t_track_end = time.perf_counter()
        latencies["tracking_ms"] = round((t_track_end - t_track_start) * 1000.0, 2)
        
        active_track_ids = [t.track_id for t in tracked_faces]
        self.identity_cache.prune_stale(active_track_ids)

        results: List[Optional[TrackedRecognitionResult]] = [None] * len(tracked_faces)
        embedding_time = 0.0
        matching_time = 0.0
        liveness_time = 0.0

        valid_tracks_info: List[Tuple[int, TrackedFace, QualityMetrics, PoseEstimate, Any, np.ndarray]] = []

        for idx, trk in enumerate(tracked_faces):
            # Check if track is occluded or missing landmarks
            if trk.is_occluded or trk.landmarks is None:
                # Face is occluded / predicted by Kalman filter
                v_res = self.verifier.add_observation(
                    track_id=trk.track_id,
                    match=None,
                    is_valid_quality=False,
                    is_occluded=True,
                    liveness_score=1.0,
                )
                results[idx] = TrackedRecognitionResult(
                    track_id=trk.track_id,
                    bbox=trk.bbox,
                    state="OCCLUDED",
                    decision=v_res.decision,
                    is_confirmed=v_res.is_confirmed,
                    confirmed_student_id=v_res.confirmed_student_id,
                    confirmed_code=v_res.confirmed_code,
                    confirmed_roll=v_res.confirmed_roll,
                    confirmed_name=v_res.confirmed_name,
                    average_similarity=v_res.average_similarity,
                    current_similarity=0.0,
                    is_live=True,
                    liveness_score=1.0,
                    votes_count=v_res.votes_count,
                    total_valid_frames=v_res.total_valid_frames,
                    is_occluded=True,
                    quality=None,
                    pose=None,
                    decision_reason=f"Track occluded/interpolated; {v_res.reason}",
                )
                continue

            # 3. Quality & Pose Analysis
            quality = self.quality_analyzer.analyze(image, trk.bbox)
            pose = self.pose_estimator.estimate(trk.landmarks)

            if not quality.is_valid:
                v_res = self.verifier.add_observation(
                    track_id=trk.track_id,
                    match=None,
                    is_valid_quality=False,
                    is_occluded=False,
                    liveness_score=1.0,
                )
                results[idx] = TrackedRecognitionResult(
                    track_id=trk.track_id,
                    bbox=trk.bbox,
                    state=trk.state,
                    decision=v_res.decision,
                    is_confirmed=v_res.is_confirmed,
                    confirmed_student_id=v_res.confirmed_student_id,
                    confirmed_code=v_res.confirmed_code,
                    confirmed_roll=v_res.confirmed_roll,
                    confirmed_name=v_res.confirmed_name,
                    average_similarity=v_res.average_similarity,
                    current_similarity=0.0,
                    is_live=False,
                    liveness_score=0.0,
                    votes_count=v_res.votes_count,
                    total_valid_frames=v_res.total_valid_frames,
                    is_occluded=False,
                    quality=quality,
                    pose=pose,
                    decision_reason=f"Quality rejected: {quality.rejection_reason}",
                )
                continue

            # 4. Liveness / Anti-Spoofing
            t_liv_start = time.perf_counter()
            liv_res = self.liveness_detector.predict(image, trk.bbox, trk.landmarks)
            liveness_time += (time.perf_counter() - t_liv_start) * 1000.0

            # Recognition Gating: Check Identity Cache!
            should_run = self.identity_cache.should_run_recognition(
                track_id=trk.track_id,
                frame_idx=self.frame_index,
                is_occluded=trk.is_occluded,
                time_since_update=trk.time_since_update,
            )

            if not should_run:
                cached = self.identity_cache.get(trk.track_id)
                assert cached is not None
                self.identity_cache.touch(trk.track_id, self.frame_index)

                cached_cand = MatchCandidate(
                    student_id=cached.student_id,
                    student_code=cached.student_code,
                    roll_number=cached.roll_number,
                    name=cached.name,
                    similarity=cached.confidence,
                    confidence_pct=round(float(np.clip((cached.confidence - 0.35) / 0.65 * 100.0, 0.0, 100.0)), 1),
                )
                v_res = self.verifier.add_observation(
                    track_id=trk.track_id,
                    match=cached_cand,
                    is_valid_quality=True,
                    is_occluded=False,
                    liveness_score=cached.liveness_score,
                )

                results[idx] = TrackedRecognitionResult(
                    track_id=trk.track_id,
                    bbox=trk.bbox,
                    state=trk.state,
                    decision=DecisionState.KNOWN,
                    is_confirmed=v_res.is_confirmed,
                    confirmed_student_id=v_res.confirmed_student_id,
                    confirmed_code=v_res.confirmed_code,
                    confirmed_roll=v_res.confirmed_roll,
                    confirmed_name=v_res.confirmed_name,
                    average_similarity=v_res.average_similarity,
                    current_similarity=cached.confidence,
                    is_live=liv_res.is_live,
                    liveness_score=liv_res.liveness_score,
                    votes_count=v_res.votes_count,
                    total_valid_frames=v_res.total_valid_frames,
                    is_occluded=False,
                    provisional_student_id=v_res.provisional_student_id,
                    provisional_code=v_res.provisional_code,
                    provisional_roll=v_res.provisional_roll,
                    provisional_name=v_res.provisional_name,
                    frames_needed=0,
                    confidence_history=v_res.confidence_history,
                    quality=quality,
                    pose=pose,
                    decision_reason=f"Identity reused from track cache (ArcFace skipped, track #{trk.track_id})",
                )
                continue

            # 5. Face Alignment
            aligned_crop = self.aligner.align(image, trk.landmarks)
            valid_tracks_info.append((idx, trk, quality, pose, liv_res, aligned_crop))

        # Batch ArcFace Embedding for all valid tracked faces
        if valid_tracks_info:
            aligned_crops = [info[5] for info in valid_tracks_info]
            t_emb_start = time.perf_counter()
            embeddings = self.embedder.extract_batch(aligned_crops)
            embedding_time = (time.perf_counter() - t_emb_start) * 1000.0

            for i, (idx, trk, quality, pose, liv_res, _) in enumerate(valid_tracks_info):
                embedding = embeddings[i]
                # 6. Vector Similarity Search
                t_match_start = time.perf_counter()
                _, best_match, _, _ = self.matcher.match(embedding, top_k=2)
                matching_time += (time.perf_counter() - t_match_start) * 1000.0

                # 7. Temporal Multi-Frame Verification
                v_res = self.verifier.add_observation(
                    track_id=trk.track_id,
                    match=best_match,
                    is_valid_quality=True,
                    is_occluded=False,
                    liveness_score=liv_res.liveness_score,
                )

                if v_res.is_confirmed and v_res.decision == DecisionState.KNOWN and v_res.confirmed_student_id:
                    self.identity_cache.update_identity(
                        track_id=trk.track_id,
                        student_id=v_res.confirmed_student_id,
                        student_code=v_res.confirmed_code or (best_match.student_code if best_match else ""),
                        roll_number=v_res.confirmed_roll or (best_match.roll_number if best_match else ""),
                        name=v_res.confirmed_name or (best_match.name if best_match else ""),
                        confidence=v_res.average_similarity,
                        is_confirmed=True,
                        liveness_score=liv_res.liveness_score,
                        frame_idx=self.frame_index,
                    )

                current_sim = best_match.similarity if best_match else 0.0

                results[idx] = TrackedRecognitionResult(
                    track_id=trk.track_id,
                    bbox=trk.bbox,
                    state=trk.state,
                    decision=v_res.decision,
                    is_confirmed=v_res.is_confirmed,
                    confirmed_student_id=v_res.confirmed_student_id,
                    confirmed_code=v_res.confirmed_code,
                    confirmed_roll=v_res.confirmed_roll,
                    confirmed_name=v_res.confirmed_name,
                    average_similarity=v_res.average_similarity,
                    current_similarity=current_sim,
                    is_live=liv_res.is_live,
                    liveness_score=liv_res.liveness_score,
                    votes_count=v_res.votes_count,
                    total_valid_frames=v_res.total_valid_frames,
                    is_occluded=False,
                    provisional_student_id=v_res.provisional_student_id,
                    provisional_code=v_res.provisional_code,
                    provisional_roll=v_res.provisional_roll,
                    provisional_name=v_res.provisional_name,
                    frames_needed=v_res.frames_needed,
                    confidence_history=v_res.confidence_history,
                    quality=quality,
                    pose=pose,
                    decision_reason=v_res.reason,
                )

        latencies["liveness_ms"] = round(liveness_time, 2)
        latencies["embedding_ms"] = round(embedding_time, 2)
        latencies["matching_ms"] = round(matching_time, 2)
        latencies["total_pipeline_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)

        return results, latencies
