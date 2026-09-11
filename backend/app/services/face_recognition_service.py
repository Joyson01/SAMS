"""
Unified Face Recognition Service for JOJIPA-SAMS.
Initializes InsightFace FaceAnalysis (buffalo_l) once at startup on CPUExecutionProvider,
loads and normalizes enrolled student embeddings, and provides recognition, matching,
and annotation functions for static images, video frames, webcam, and IP camera feeds.
"""

import io
import os
import json
import time
import sqlite3
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
from PIL import Image, ImageOps
from insightface.app import FaceAnalysis

logger = logging.getLogger("jojipa_sams.face_recognition_service")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
EMBEDDINGS_PATHS = [
    PROJECT_ROOT / "embeddings" / "student_embeddings.npy",
]
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
PROCESSED_DIR = PROJECT_ROOT / "data" / "uploads" / "media"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Configurable recognition thresholds
UNKNOWN_THRESHOLD: float = 0.40
MEDIUM_CONFIDENCE: float = 0.50
HIGH_CONFIDENCE: float = 0.65


def _get_insightface_root() -> str:
    home_root = os.path.expanduser("~/.insightface")
    try:
        os.makedirs(home_root, exist_ok=True)
        test_file = Path(home_root) / ".write_test"
        test_file.touch()
        test_file.unlink()
        return home_root
    except (OSError, PermissionError):
        local_root = str(PROJECT_ROOT / ".insightface")
        os.makedirs(local_root, exist_ok=True)
        return local_root


def load_and_orient_image(image_input: Any) -> Optional[np.ndarray]:
    """
    Decodes image input (bytes, file path, file object, or np.ndarray) and automatically
    corrects EXIF orientation for mobile cameras before face recognition.
    """
    if isinstance(image_input, np.ndarray):
        return image_input

    image_bytes = None
    if isinstance(image_input, (bytes, bytearray)):
        image_bytes = bytes(image_input)
    elif isinstance(image_input, (str, Path)):
        p = Path(image_input)
        if p.is_file():
            image_bytes = p.read_bytes()
    elif hasattr(image_input, "read"):
        image_bytes = image_input.read()

    if not image_bytes or len(image_bytes) == 0:
        return None

    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        pil_img = ImageOps.exif_transpose(pil_img)
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        rgb_arr = np.array(pil_img)
        bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
        return bgr_arr
    except Exception as e:
        logger.warning(f"PIL EXIF transpose notice: {e}. Falling back to OpenCV decode.")
        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


class FaceRecognitionService:
    """Singleton service managing the InsightFace engine and enrolled embeddings."""

    _instance: Optional["FaceRecognitionService"] = None
    _app: Optional[FaceAnalysis] = None
    _embeddings: Dict[str, np.ndarray] = {}
    _student_names: Dict[str, str] = {}
    _last_embeddings_load_time: float = 0.0
    _gallery_matrix_cache: Optional[np.ndarray] = None
    _gallery_ids_cache: Optional[List[str]] = None

    def __new__(cls) -> "FaceRecognitionService":
        if cls._instance is None:
            cls._instance = super(FaceRecognitionService, cls).__new__(cls)
            cls._instance._initialize_engine()
        return cls._instance

    def _initialize_engine(self) -> None:
        """Initializes FaceRecognitionService by reusing the canonical FaceRecognitionPipeline (eliminates duplicate model loading)."""
        logger.info("[FaceRecognitionService] Initializing as compatibility wrapper over FaceRecognitionPipeline...")
        from backend.app.services.recognition_service import get_pipeline
        pipeline = get_pipeline()
        self._app = pipeline.detector._app
        self.load_embeddings(force_reload=True)

    @property
    def app(self) -> FaceAnalysis:
        if self._app is None:
            self._initialize_engine()
        return self._app

    def load_embeddings(self, force_reload: bool = False) -> Dict[str, np.ndarray]:
        """
        Loads and normalizes student embeddings from .npy files or SQLite database.
        Returns: Dict mapping student_id / student_code -> (512,) float32 normalized vector.
        """
        if not force_reload and self._embeddings and (time.time() - self._last_embeddings_load_time < 10):
            return self._embeddings

        loaded: Dict[str, np.ndarray] = {}

        # 1. Check .npy files
        for emb_path in EMBEDDINGS_PATHS:
            if emb_path.is_file():
                try:
                    raw_dict = np.load(str(emb_path), allow_pickle=True).item()
                    if isinstance(raw_dict, dict):
                        for key, vec in raw_dict.items():
                            arr = np.asarray(vec, dtype=np.float32)
                            norm = float(np.linalg.norm(arr))
                            if norm > 0:
                                arr = arr / norm
                            loaded[str(key)] = arr
                        if len(loaded) > 0:
                            logger.info(f"[FaceRecognitionService] Loaded {len(loaded)} embeddings from {emb_path}")
                            break
                except Exception as e:
                    logger.warning(f"[FaceRecognitionService] Reading {emb_path}: {e}")

        # 2. Fallback / Synchronize from SQLite face_profiles table
        db_path = PROJECT_ROOT / "data" / "sams_dev.db"
        if db_path.is_file():
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT fp.student_id, s.student_code, fp.embedding_data 
                    FROM face_profiles fp
                    JOIN students s ON s.id = fp.student_id
                    """
                )
                for row in cur.fetchall():
                    s_id = str(row["student_id"])
                    s_code = str(row["student_code"]) if row["student_code"] else ""
                    raw_emb = row["embedding_data"]
                    if isinstance(raw_emb, str):
                        emb_list = json.loads(raw_emb)
                    else:
                        emb_list = raw_emb
                    arr = np.asarray(emb_list, dtype=np.float32)
                    norm = float(np.linalg.norm(arr))
                    if norm > 0:
                        arr = arr / norm
                    loaded[s_id] = arr
                    if s_code:
                        loaded[s_code] = arr
                conn.close()

                # Sync to .npy for fast loading
                if len(loaded) > 0:
                    for target_p in EMBEDDINGS_PATHS:
                        target_p.parent.mkdir(parents=True, exist_ok=True)
                        np.save(str(target_p), loaded)
            except Exception as db_err:
                logger.warning(f"[FaceRecognitionService] Syncing embeddings from DB: {db_err}")

        self._embeddings = loaded
        self._last_embeddings_load_time = time.time()
        self._gallery_matrix_cache = None
        self._gallery_ids_cache = None
        return self._embeddings

    def compare_embedding(
        self,
        query_embedding: np.ndarray,
        stored_embeddings: Optional[Dict[str, np.ndarray]] = None,
        threshold: float = UNKNOWN_THRESHOLD,
    ) -> Tuple[Optional[str], float]:
        """
        Computes cosine similarity against all enrolled student embeddings.
        Returns: (best_student_id, best_similarity).
        If best_similarity < threshold, best_student_id will be None.
        """
        if stored_embeddings is None:
            stored_embeddings = self.load_embeddings()

        if not stored_embeddings or query_embedding is None:
            return None, 0.0

        q_norm = float(np.linalg.norm(query_embedding))
        if q_norm > 0:
            query_emb_normalized = (query_embedding / q_norm).astype(np.float32)
        else:
            return None, 0.0

        best_id: Optional[str] = None
        best_sim: float = 0.0

        use_cache = (stored_embeddings is self._embeddings)
        
        if use_cache:
            if self._gallery_matrix_cache is None or self._gallery_ids_cache is None:
                self._gallery_ids_cache = list(self._embeddings.keys())
                self._gallery_matrix_cache = np.vstack(list(self._embeddings.values()))
            
            gallery_ids = self._gallery_ids_cache
            gallery_matrix = self._gallery_matrix_cache
        else:
            gallery_ids = list(stored_embeddings.keys())
            gallery_matrix = np.vstack(list(stored_embeddings.values()))

        similarities = np.dot(gallery_matrix, query_emb_normalized)
        best_idx = int(np.argmax(similarities))
        best_sim = float(similarities[best_idx])
        best_id = gallery_ids[best_idx]

        if best_sim >= threshold and best_id is not None:
            return best_id, round(best_sim, 4)

        return None, round(best_sim, 4)

    def recognize_frame(
        self,
        frame: np.ndarray,
        threshold: float = UNKNOWN_THRESHOLD,
        min_face_size: int = 60,
        min_detection_confidence: float = 0.50,
        eligible_student_ids: Optional[List[str]] = None,
        return_embedding: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Detects faces in a single OpenCV BGR frame using canonical pipeline and matches against enrolled students.
        Returns list of detected face dictionaries without heavy raw embedding vectors by default.
        """
        if frame is None or frame.size == 0:
            return []

        global_embeddings = self.load_embeddings()
        
        roster_embeddings = global_embeddings
        if eligible_student_ids is not None:
            roster_embeddings = {
                s_id: emb for s_id, emb in global_embeddings.items()
                if s_id in eligible_student_ids
            }

        from backend.app.services.recognition_service import get_pipeline
        pipeline = get_pipeline()
        detected_faces = pipeline.detector.detect(frame)

        results: List[Dict[str, Any]] = []

        for idx, face in enumerate(detected_faces):
            x1, y1, x2, y2 = face.bbox.to_int_xyxy()
            w = max(0, x2 - x1)
            h = max(0, y2 - y1)

            det_score = float(round(float(face.det_score), 4))

            # Quality validation
            is_quality_valid = True
            quality_reason = None
            if w < min_face_size or h < min_face_size:
                is_quality_valid = False
                quality_reason = f"Face too small ({w}x{h}px < {min_face_size}px)"
            elif det_score < min_detection_confidence:
                is_quality_valid = False
                quality_reason = f"Low detection confidence ({det_score:.2f} < {min_detection_confidence:.2f})"

            best_student_id = None
            similarity = 0.0
            is_walk_in = False
            face_emb = None

            if is_quality_valid and face.landmarks is not None:
                aligned_crop = pipeline.aligner.align(frame, face.landmarks)
                face_emb = pipeline.embedder.extract_from_crop(aligned_crop)

                # Two-stage matching: first try roster, then fallback to global
                best_student_id, similarity = self.compare_embedding(
                    query_embedding=face_emb,
                    stored_embeddings=roster_embeddings,
                    threshold=threshold,
                )
                
                if best_student_id is None and eligible_student_ids is not None:
                    # Fallback to global
                    best_student_id, similarity = self.compare_embedding(
                        query_embedding=face_emb,
                        stored_embeddings=global_embeddings,
                        threshold=threshold,
                    )
                    if best_student_id is not None:
                        is_walk_in = True

            if not is_quality_valid:
                status_str = "LOW_QUALITY"
            elif best_student_id is not None:
                status_str = "VERIFIED_WALK_IN" if is_walk_in else "VERIFIED"
            else:
                status_str = "UNKNOWN"

            face_dict = {
                "face_idx": idx + 1,
                "face_id": f"face_{idx + 1}",
                "student_id": best_student_id,
                "similarity": similarity,
                "confidence": similarity,
                "confidence_pct": round(similarity * 100.0, 1),
                "is_recognized": bool(best_student_id is not None and is_quality_valid),
                "is_walk_in": is_walk_in,
                "status": status_str,
                "is_quality_valid": is_quality_valid,
                "quality_reason": quality_reason,
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "bounding_box": {"x": x1, "y": y1, "width": w, "height": h, "x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "detection_score": det_score,
            }
            if return_embedding and face_emb is not None:
                face_dict["embedding"] = face_emb

            results.append(face_dict)

        return results

    def annotate_frame(
        self,
        frame: np.ndarray,
        detections: List[Dict[str, Any]],
        student_names_lookup: Optional[Dict[str, str]] = None,
    ) -> np.ndarray:
        """Draws visual bounding boxes, labels, and similarity badges on an image frame."""
        if frame is None or len(detections) == 0:
            return frame

        annotated = frame.copy()
        if student_names_lookup is None:
            student_names_lookup = {}

        for d in detections:
            bbox = d.get("bbox", [0, 0, 0, 0])
            if isinstance(bbox, dict):
                x1 = bbox.get("x1", bbox.get("x", 0))
                y1 = bbox.get("y1", bbox.get("y", 0))
                x2 = bbox.get("x2", x1 + bbox.get("width", 0))
                y2 = bbox.get("y2", y1 + bbox.get("height", 0))
            else:
                x1, y1, x2, y2 = bbox[:4]

            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            st_id = d.get("student_id")
            sim = float(d.get("similarity", d.get("confidence", 0.0)))
            status = d.get("status", "unknown").lower()
            is_already_marked = d.get("already_present", False) or status == "already_marked"
            is_rec = (d.get("is_recognized", False) or (st_id is not None)) and status not in ["low_quality", "unknown"]

            name = d.get("student_name") or d.get("name")
            if not name and st_id:
                name = student_names_lookup.get(st_id, st_id)
            if not name:
                name = "Unknown"

            sim_pct = round(sim * 100.0, 1)

            if is_rec and not is_already_marked:
                box_color = (0, 200, 0)       # Green (Marked Present)
                label = f"{name} ({sim_pct}%) [PRESENT]"
                text_color = (0, 0, 0)
            elif is_already_marked or status == "already_marked":
                box_color = (255, 140, 0)     # Blue / Cyan (Already Present)
                label = f"{name} ({sim_pct}%) [ALREADY PRESENT]"
                text_color = (255, 255, 255)
            elif status == "low_quality":
                box_color = (0, 165, 255)     # Orange (Low Quality)
                label = f"Low Quality ({sim_pct}%)"
                text_color = (255, 255, 255)
            else:
                box_color = (80, 80, 80)      # Slate/Gray (Unknown)
                label = f"Unknown ({sim_pct}%)"
                text_color = (255, 255, 255)

            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)

            # Draw label box
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            thickness = 1
            (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)
            ty = y1 - 8 if y1 - th - 8 > 0 else y1 + th + 8

            cv2.rectangle(annotated, (x1, ty - th - 4), (x1 + tw + 8, ty + 4), box_color, -1)
            cv2.putText(annotated, label, (x1 + 4, ty), font, font_scale, text_color, thickness, cv2.LINE_AA)

        return annotated


# Global singleton instance
face_recognition_service = FaceRecognitionService()


# Module-level convenience functions
def get_face_app() -> FaceAnalysis:
    return face_recognition_service.app


def load_student_embeddings(force_reload: bool = False) -> Dict[str, np.ndarray]:
    return face_recognition_service.load_embeddings(force_reload=force_reload)


def compare_embedding(
    query_embedding: np.ndarray,
    stored_embeddings: Optional[Dict[str, np.ndarray]] = None,
    threshold: float = UNKNOWN_THRESHOLD,
) -> Tuple[Optional[str], float]:
    return face_recognition_service.compare_embedding(
        query_embedding=query_embedding,
        stored_embeddings=stored_embeddings,
        threshold=threshold,
    )


def recognize_frame(
    frame: np.ndarray,
    threshold: float = UNKNOWN_THRESHOLD,
    min_face_size: int = 60,
    min_detection_confidence: float = 0.50,
    eligible_student_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    return face_recognition_service.recognize_frame(
        frame=frame,
        threshold=threshold,
        min_face_size=min_face_size,
        min_detection_confidence=min_detection_confidence,
        eligible_student_ids=eligible_student_ids,
    )


def annotate_frame(
    frame: np.ndarray,
    detections: List[Dict[str, Any]],
    student_names_lookup: Optional[Dict[str, str]] = None,
) -> np.ndarray:
    return face_recognition_service.annotate_frame(
        frame=frame,
        detections=detections,
        student_names_lookup=student_names_lookup,
    )


__all__ = [
    "FaceRecognitionService",
    "face_recognition_service",
    "get_face_app",
    "load_student_embeddings",
    "compare_embedding",
    "recognize_frame",
    "annotate_frame",
    "load_and_orient_image",
    "UNKNOWN_THRESHOLD",
    "MEDIUM_CONFIDENCE",
    "HIGH_CONFIDENCE",
]
