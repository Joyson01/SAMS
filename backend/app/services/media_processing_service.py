"""
Media Processing Service for JOJIPA-SAMS.
Orchestrates Image Attendance and Video Attendance workflows using FaceRecognitionService.
Implements OpenCV frame-by-frame streaming, multi-frame accumulation voting,
duplicate attendance protection, and annotated visualization generation.
"""

import os
import time
import uuid
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

import cv2
import numpy as np

from backend.app.database import sqlite_adapter
from backend.app.services.face_recognition_service import (
    face_recognition_service,
    UNKNOWN_THRESHOLD,
    MEDIUM_CONFIDENCE,
    HIGH_CONFIDENCE,
)

logger = logging.getLogger("jojipa_sams.media_processing")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
UPLOADS_IMAGES_DIR = PROJECT_ROOT / "data" / "uploads" / "media"
UPLOADS_VIDEOS_DIR = PROJECT_ROOT / "data" / "uploads" / "videos"
PROCESSED_IMAGES_DIR = PROJECT_ROOT / "data" / "uploads" / "media"
PROCESSED_VIDEOS_DIR = PROJECT_ROOT / "data" / "uploads" / "media"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

for d in [UPLOADS_IMAGES_DIR, UPLOADS_VIDEOS_DIR, PROCESSED_IMAGES_DIR, PROCESSED_VIDEOS_DIR, OUTPUTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


class MediaProcessingService:
    """Service handling static image attendance and multi-frame video attendance."""

    @classmethod
    def process_image_attendance(
        cls,
        image_input: Any,
        session_id: Optional[str] = None,
        filename: str = "uploaded_image.jpg",
        threshold: float = UNKNOWN_THRESHOLD,
    ) -> Dict[str, Any]:
        """
        Executes Image Attendance pipeline:
        1. Validates & decodes image.
        2. Runs InsightFace face detection and normalized cosine similarity embedding matching.
        3. Applies confidence threshold & in-frame duplicate detection.
        4. Queries DB to check if student was already marked in this session.
        5. Marks attendance for recognized students.
        6. Generates annotated image with OpenCV bounding boxes.
        7. Returns complete structured results.
        """
        t0 = time.perf_counter()

        # 1. Decode / Load image
        if isinstance(image_input, (str, Path)):
            resolved_path = Path(image_input).expanduser().resolve()
            if not resolved_path.is_file():
                raise FileNotFoundError(f"Image file does not exist: {resolved_path}")
            image = cv2.imread(str(resolved_path))
            if image is None:
                raise ValueError(f"Could not load or decode image from path: {resolved_path}")
            stem = resolved_path.stem
        elif isinstance(image_input, (bytes, bytearray)):
            nparr = np.frombuffer(image_input, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError("Could not decode image from provided byte buffer.")
            stem = Path(filename).stem
            # Save uploaded copy
            file_id = uuid.uuid4().hex[:8]
            save_path = UPLOADS_IMAGES_DIR / f"{file_id}_{Path(filename).name}"
            cv2.imwrite(str(save_path), image)
        elif isinstance(image_input, np.ndarray):
            image = image_input.copy()
            stem = Path(filename).stem
        else:
            raise TypeError(f"Unsupported image input type: {type(image_input)}")

        h, w = image.shape[:2]
        resolution_str = f"{w}x{h}"

        # 2. Get student lookup dictionary
        student_names = sqlite_adapter.get_all_students()

        # 3. Detect & Recognize faces
        detections = face_recognition_service.recognize_frame(image, threshold=threshold)

        results_list: List[Dict[str, Any]] = []
        recognized_students: List[Dict[str, Any]] = []
        unknown_faces: List[Dict[str, Any]] = []
        attendance_candidates: List[Dict[str, Any]] = []
        all_faces_info: List[Dict[str, Any]] = []
        seen_student_ids_in_frame: Set[str] = set()

        students_recognized_count = 0
        attendance_marked_count = 0
        duplicates_skipped_count = 0
        unknown_faces_count = 0

        for d in detections:
            idx = d["face_idx"]
            bbox = d["bbox"]
            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
            box_w = max(0, x2 - x1)
            box_h = max(0, y2 - y1)
            st_id = d["student_id"]
            sim = float(d["similarity"])
            is_rec = bool(d["is_recognized"] and st_id)

            # In-frame deduplication
            if is_rec and st_id:
                if st_id in seen_student_ids_in_frame:
                    is_rec = False
                    d["status"] = "DUPLICATE_IN_FRAME"
                else:
                    seen_student_ids_in_frame.add(st_id)

            if is_rec and st_id:
                students_recognized_count += 1
                st_details = sqlite_adapter.get_student_details(st_id)
                st_name = st_details["name"] if st_details else student_names.get(st_id, st_id)
                st_code = st_details["student_code"] if st_details else None
                st_roll = st_details["roll_number"] if st_details else None

                already_marked = False
                attendance_marked = False

                if session_id:
                    already_marked = sqlite_adapter.is_marked_present(st_id, session_id)
                    if already_marked:
                        duplicates_skipped_count += 1
                    else:
                        mark_res = sqlite_adapter.mark_attendance(
                            student_id=st_id,
                            session_id=session_id,
                            status="PRESENT",
                            confidence=sim,
                            source="MEDIA_IMAGE",
                            remarks=f"Photo: {filename} ({sim*100:.1f}%)",
                        )
                        if mark_res.get("success") and mark_res.get("attendanceMarked"):
                            attendance_marked = True
                            attendance_marked_count += 1
                        elif mark_res.get("alreadyPresent"):
                            already_marked = True
                            duplicates_skipped_count += 1

                status_label = "already_marked" if already_marked else "recognized"

                res_item = {
                    "student_id": str(st_id),
                    "student_name": str(st_name),
                    "student_code": str(st_code) if st_code else "",
                    "roll_number": str(st_roll) if st_roll else "",
                    "similarity": round(sim, 4),
                    "confidence": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": status_label,
                    "already_present": bool(already_marked),
                    "attendance_marked": bool(attendance_marked),
                }
                results_list.append(res_item)

                rec_item = {
                    "student_id": str(st_id),
                    "student_name": str(st_name),
                    "student_code": str(st_code) if st_code else "",
                    "roll_number": str(st_roll) if st_roll else "",
                    "confidence": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "attendance_status": "PRESENT",
                    "status": "VERIFIED",
                    "decision": "KNOWN",
                    "observation_count": 1,
                    "already_present": bool(already_marked),
                    "attendance_marked": bool(attendance_marked),
                }
                recognized_students.append(rec_item)

                cand_item = {
                    "faceId": int(idx),
                    "face_id": f"face_{idx}",
                    "studentId": str(st_id),
                    "student_id": str(st_id),
                    "studentName": str(st_name),
                    "student_name": str(st_name),
                    "studentCode": str(st_code) if st_code else "",
                    "rollNumber": str(st_roll) if st_roll else "",
                    "confidence": round(sim, 4),
                    "confidencePct": round(sim * 100.0, 1),
                    "confidence_pct": round(sim * 100.0, 1),
                    "recognized": True,
                    "status": "VERIFIED",
                    "alreadyPresent": bool(already_marked),
                    "attendanceMarked": bool(attendance_marked),
                    "boundingBox": {
                        "x": x1,
                        "y": y1,
                        "width": box_w,
                        "height": box_h,
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                    },
                }
                attendance_candidates.append(cand_item)

                all_faces_info.append({
                    "face_id": f"face_{idx}",
                    "faceId": int(idx),
                    "bounding_box": {"x": x1, "y": y1, "width": box_w, "height": box_h},
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "detection_confidence": d["detection_score"],
                    "quality_score": 100.0,
                    "identity": str(st_name),
                    "student_id": str(st_id),
                    "student_code": str(st_code) if st_code else "",
                    "roll_number": str(st_roll) if st_roll else "",
                    "recognition_confidence": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": "VERIFIED",
                    "rejection_reason": None,
                })
            else:
                unknown_faces_count += 1
                res_item = {
                    "student_id": None,
                    "student_name": "Unknown",
                    "similarity": round(sim, 4),
                    "confidence": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": "unknown",
                    "already_present": False,
                    "attendance_marked": False,
                }
                results_list.append(res_item)

                u_item = {
                    "faceId": int(idx),
                    "face_id": f"face_{idx}",
                    "confidence": round(sim, 4),
                    "confidencePct": round(sim * 100.0, 1),
                    "confidence_pct": round(sim * 100.0, 1),
                    "recognized": False,
                    "status": "UNKNOWN",
                    "decision": "UNKNOWN",
                    "quality_score": 100.0,
                    "rejectionReason": "Unenrolled face or below recognition threshold",
                    "rejection_reason": "Unenrolled face or below recognition threshold",
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "boundingBox": {
                        "x": x1,
                        "y": y1,
                        "width": box_w,
                        "height": box_h,
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                    },
                }
                unknown_faces.append(u_item)

                all_faces_info.append({
                    "face_id": f"face_{idx}",
                    "faceId": int(idx),
                    "bounding_box": {"x": x1, "y": y1, "width": box_w, "height": box_h},
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "detection_confidence": d["detection_score"],
                    "quality_score": 100.0,
                    "identity": "Unknown",
                    "student_id": None,
                    "student_code": "",
                    "roll_number": "",
                    "recognition_confidence": round(sim, 4),
                    "confidence_pct": round(sim * 100.0, 1),
                    "status": "UNKNOWN",
                    "rejection_reason": "Unenrolled face or below recognition threshold",
                })

        # 4. Generate annotated output image
        annotated_image = face_recognition_service.annotate_frame(
            frame=image,
            detections=all_faces_info,
            student_names_lookup=student_names,
        )

        out_filename = f"{stem}_detected.jpg"
        output_save_path = OUTPUTS_DIR / out_filename
        cv2.imwrite(str(output_save_path), annotated_image)

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        total_faces = len(detections)

        return {
            "success": True,
            "media_type": "IMAGE",
            "filename": filename,
            "resolution": resolution_str,
            "faces_detected": int(total_faces),
            "facesDetected": int(total_faces),
            "students_recognized": int(students_recognized_count),
            "studentsRecognized": int(students_recognized_count),
            "recognized_count": int(students_recognized_count),
            "attendance_marked": int(attendance_marked_count),
            "attendanceMarked": int(attendance_marked_count),
            "attendance_marked_count": int(attendance_marked_count),
            "duplicates_skipped": int(duplicates_skipped_count),
            "duplicates_prevented": int(duplicates_skipped_count),
            "unknown_faces": int(unknown_faces_count),
            "unknownFaces": unknown_faces,
            "unknown_count": int(unknown_faces_count),
            "attendanceCandidates": attendance_candidates,
            "recognized_students": recognized_students,
            "unresolved_faces": unknown_faces,
            "faces": all_faces_info,
            "results": results_list,
            "annotated_image_url": f"/outputs/{out_filename}",
            "annotatedImagePath": f"/outputs/{out_filename}",
            "processing_time_ms": float(elapsed_ms),
            "status": "COMPLETED",
        }

    @classmethod
    def process_video_attendance(
        cls,
        video_input: Any,
        session_id: Optional[str] = None,
        sample_rate: float = 2.0,
        filename: str = "classroom_video.mp4",
        minimum_confirmations: int = 2,
        high_confidence_similarity: float = HIGH_CONFIDENCE,
        threshold: float = UNKNOWN_THRESHOLD,
    ) -> Dict[str, Any]:
        """
        Processes recorded video file:
        1. Reads video stream and samples frames at `sample_rate` FPS.
        2. Detects and tracks faces across frames.
        3. Accumulates identification votes per student with timestamp intervals.
        4. Applies multi-frame consensus rules.
        5. Marks attendance once per student.
        6. Returns detailed summary and representative frame.
        """
        t0 = time.perf_counter()

        # 1. Resolve video source
        if isinstance(video_input, (str, Path)):
            temp_path = Path(video_input).expanduser().resolve()
            if not temp_path.is_file():
                raise FileNotFoundError(f"Video file does not exist: {temp_path}")
            stem = temp_path.stem
        elif isinstance(video_input, (bytes, bytearray)):
            file_id = uuid.uuid4().hex[:8]
            stem = f"{file_id}_{Path(filename).stem}"
            temp_path = UPLOADS_VIDEOS_DIR / f"{stem}.mp4"
            temp_path.write_bytes(video_input)
        else:
            raise TypeError(f"Unsupported video input type: {type(video_input)}")

        cap = cv2.VideoCapture(str(temp_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open or decode video from: {temp_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = round(total_frames / video_fps, 2) if video_fps > 0 else 0.0

        sample_interval = max(1, int(round(video_fps / sample_rate))) if sample_rate > 0 else 1

        student_names = sqlite_adapter.get_all_students()

        # Data structures for tracking & voting
        student_votes: Dict[str, Dict[str, Any]] = {}
        unresolved_faces: List[Dict[str, Any]] = []
        frames_processed = 0
        total_faces_detected = 0
        last_annotated_frame = None

        frame_index = 0
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_index % sample_interval == 0:
                    frames_processed += 1
                    sec_offset = round(frame_index / video_fps, 2)

                    detections = face_recognition_service.recognize_frame(frame, threshold=threshold)
                    total_faces_detected += len(detections)

                    if len(detections) > 0:
                        last_annotated_frame = face_recognition_service.annotate_frame(
                            frame=frame,
                            detections=detections,
                            student_names_lookup=student_names,
                        )

                    for d in detections:
                        st_id = d["student_id"]
                        sim = float(d["similarity"])
                        is_rec = bool(d["is_recognized"] and st_id)

                        if is_rec and st_id:
                            if st_id not in student_votes:
                                student_votes[st_id] = {
                                    "detections": 1,
                                    "best_similarity": sim,
                                    "similarities": [sim],
                                    "first_seen_sec": sec_offset,
                                    "last_seen_sec": sec_offset,
                                }
                            else:
                                v = student_votes[st_id]
                                v["detections"] += 1
                                v["similarities"].append(sim)
                                v["last_seen_sec"] = sec_offset
                                if sim > v["best_similarity"]:
                                    v["best_similarity"] = sim
                        else:
                            if len(unresolved_faces) < 50:
                                unresolved_faces.append({
                                    "face_id": f"v_{frame_index}_{d['face_idx']}",
                                    "frame_number": frame_index,
                                    "timestamp_sec": sec_offset,
                                    "similarity": sim,
                                    "confidence": sim,
                                    "confidence_pct": round(sim * 100.0, 1),
                                    "bbox": d["bbox"],
                                    "status": "unknown",
                                })

                frame_index += 1
        finally:
            cap.release()

        # 3. Multi-frame verification & duplicate protection
        results_list: List[Dict[str, Any]] = []
        recognized_students: List[Dict[str, Any]] = []

        students_recognized_count = 0
        attendance_marked_count = 0
        duplicates_skipped_count = 0

        for st_id, votes in student_votes.items():
            det_count = votes["detections"]
            best_sim = float(votes["best_similarity"])

            # Verification rule: multi-frame confirmation or high-confidence match
            is_verified = bool(det_count >= minimum_confirmations or best_sim >= high_confidence_similarity)

            if is_verified:
                students_recognized_count += 1
                st_details = sqlite_adapter.get_student_details(st_id)
                st_name = st_details["name"] if st_details else student_names.get(st_id, st_id)
                st_code = st_details["student_code"] if st_details else ""
                st_roll = st_details["roll_number"] if st_details else ""

                m_start, s_start = divmod(int(votes["first_seen_sec"]), 60)
                m_end, s_end = divmod(int(votes["last_seen_sec"]), 60)
                time_range = f"{m_start:02d}:{s_start:02d} - {m_end:02d}:{s_end:02d}"

                already_marked = False
                attendance_marked = False

                if session_id:
                    already_marked = sqlite_adapter.is_marked_present(st_id, session_id)
                    if already_marked:
                        duplicates_skipped_count += 1
                    else:
                        mark_res = sqlite_adapter.mark_attendance(
                            student_id=st_id,
                            session_id=session_id,
                            status="PRESENT",
                            confidence=best_sim,
                            source="MEDIA_VIDEO",
                            remarks=f"Video: {time_range} ({det_count} detections, {best_sim*100:.1f}%)",
                        )
                        if mark_res.get("success") and mark_res.get("attendanceMarked"):
                            attendance_marked = True
                            attendance_marked_count += 1
                        elif mark_res.get("alreadyPresent"):
                            already_marked = True
                            duplicates_skipped_count += 1

                status_str = "already_marked" if already_marked else "recognized"

                results_list.append({
                    "student_id": str(st_id),
                    "student_name": str(st_name),
                    "student_code": str(st_code),
                    "roll_number": str(st_roll),
                    "similarity": round(best_sim, 4),
                    "confidence": round(best_sim, 4),
                    "confidence_pct": round(best_sim * 100.0, 1),
                    "status": status_str,
                    "detections": int(det_count),
                    "time_range": time_range,
                    "already_present": bool(already_marked),
                    "attendance_marked": bool(attendance_marked),
                })

                recognized_students.append({
                    "student_id": str(st_id),
                    "student_name": str(st_name),
                    "student_code": str(st_code),
                    "roll_number": str(st_roll),
                    "confidence": round(best_sim, 4),
                    "confidence_pct": round(best_sim * 100.0, 1),
                    "attendance_status": "PRESENT",
                    "decision": "KNOWN",
                    "status": "VERIFIED",
                    "first_seen": f"{m_start:02d}:{s_start:02d}",
                    "last_seen": f"{m_end:02d}:{s_end:02d}",
                    "observation_count": int(det_count),
                    "already_present": bool(already_marked),
                    "attendance_marked": bool(attendance_marked),
                    "remarks": f"Observed {det_count} times ({time_range})",
                })

        # Save representative annotated frame if available
        annotated_url = None
        if last_annotated_frame is not None:
            out_filename = f"{stem}_video_frame_detected.jpg"
            cv2.imwrite(str(OUTPUTS_DIR / out_filename), last_annotated_frame)
            annotated_url = f"/outputs/{out_filename}"

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        return {
            "success": True,
            "media_type": "VIDEO",
            "filename": filename,
            "duration_sec": float(duration_sec),
            "resolution": f"{width}x{height}",
            "frames_total": int(total_frames),
            "frames_processed": int(frames_processed),
            "faces_detected": int(total_faces_detected),
            "facesDetected": int(total_faces_detected),
            "students_recognized": int(students_recognized_count),
            "studentsRecognized": int(students_recognized_count),
            "recognized_count": int(students_recognized_count),
            "attendance_marked": int(attendance_marked_count),
            "attendanceMarked": int(attendance_marked_count),
            "attendance_marked_count": int(attendance_marked_count),
            "duplicates_skipped": int(duplicates_skipped_count),
            "duplicates_prevented": int(duplicates_skipped_count),
            "unknown_faces": int(len(unresolved_faces)),
            "unknown_count": int(len(unresolved_faces)),
            "results": results_list,
            "recognized_students": recognized_students,
            "unresolved_faces": unresolved_faces,
            "annotated_image_url": annotated_url,
            "annotatedImagePath": annotated_url,
            "processing_time_ms": float(elapsed_ms),
            "status": "COMPLETED",
        }


media_processing_service = MediaProcessingService()

__all__ = [
    "MediaProcessingService",
    "media_processing_service",
    "UNKNOWN_THRESHOLD",
    "MEDIUM_CONFIDENCE",
    "HIGH_CONFIDENCE",
]
