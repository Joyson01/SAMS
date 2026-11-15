from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

from ai_engine.base import BoundingBox, DetectedFace
from ai_engine.tracking.kalman_filter import KalmanBoxTracker


def calculate_iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Calculates IoU matrix between N boxes_a and M boxes_b (both shape (K, 4))."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return np.empty((len(boxes_a), len(boxes_b)), dtype=np.float32)

    boxes_a = np.asarray(boxes_a, dtype=np.float32)
    boxes_b = np.asarray(boxes_b, dtype=np.float32)

    # Coordinates
    x1_a, y1_a, x2_a, y2_a = boxes_a[:, 0], boxes_a[:, 1], boxes_a[:, 2], boxes_a[:, 3]
    x1_b, y1_b, x2_b, y2_b = boxes_b[:, 0], boxes_b[:, 1], boxes_b[:, 2], boxes_b[:, 3]

    area_a = np.maximum(0.0, x2_a - x1_a) * np.maximum(0.0, y2_a - y1_a)
    area_b = np.maximum(0.0, x2_b - x1_b) * np.maximum(0.0, y2_b - y1_b)

    # Pairwise intersection
    inter_x1 = np.maximum(x1_a[:, None], x1_b[None, :])
    inter_y1 = np.maximum(y1_a[:, None], y1_b[None, :])
    inter_x2 = np.minimum(x2_a[:, None], x2_b[None, :])
    inter_y2 = np.minimum(y2_a[:, None], y2_b[None, :])

    inter_w = np.maximum(0.0, inter_x2 - inter_x1)
    inter_h = np.maximum(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    union_area = area_a[:, None] + area_b[None, :] - inter_area
    union_area = np.maximum(1e-6, union_area)

    return inter_area / union_area


@dataclass
class TrackedFace:
    track_id: int
    bbox: BoundingBox
    landmarks: Optional[np.ndarray]
    det_score: float
    state: str  # 'TENTATIVE', 'CONFIRMED', 'OCCLUDED'
    age_frames: int
    hits: int
    time_since_update: int
    is_occluded: bool = False


class ByteFaceTracker:
    """Multi-face tracker implementing ByteTrack Kalman association for tracking consistency and occlusion resilience."""

    def __init__(
        self,
        min_hits: int = 2,
        max_lost_frames: int = 15,
        iou_threshold: float = 0.30,
        high_score_thresh: float = 0.50,
        low_score_thresh: float = 0.20,
    ):
        self.min_hits = min_hits
        self.max_lost_frames = max_lost_frames
        self.iou_threshold = iou_threshold
        self.high_score_thresh = high_score_thresh
        self.low_score_thresh = low_score_thresh

        self.trackers: List[KalmanBoxTracker] = []
        self._last_landmarks: dict[int, np.ndarray] = {}
        self.frame_count = 0

    def update(self, detected_faces: List[DetectedFace]) -> List[TrackedFace]:
        """Updates tracks with newly detected faces from current frame.

        Args:
            detected_faces: List of DetectedFace objects from detector

        Returns:
            List[TrackedFace]: Active tracked faces (both updated and Kalman-predicted)
        """
        self.frame_count += 1

        # 1. Kalman Predict positions for all existing trackers
        predicted_boxes = []
        to_delete = []
        for i, trk in enumerate(self.trackers):
            pos = trk.predict()
            if np.any(np.isnan(pos)):
                to_delete.append(i)
            else:
                predicted_boxes.append(pos)

        for i in reversed(to_delete):
            self.trackers.pop(i)

        # 2. Separate high-score and low-score detections
        high_dets: List[DetectedFace] = []
        low_dets: List[DetectedFace] = []
        for face in detected_faces:
            if face.det_score >= self.high_score_thresh:
                high_dets.append(face)
            elif face.det_score >= self.low_score_thresh:
                low_dets.append(face)

        # 3. Match 1: High-score detections against all active trackers
        high_boxes = np.array([f.bbox.to_list()[:4] for f in high_dets], dtype=np.float32) if high_dets else np.empty((0, 4))
        pred_boxes_arr = np.array(predicted_boxes, dtype=np.float32) if predicted_boxes else np.empty((0, 4))

        matched_trks, unmatched_dets_1, unmatched_trks_1 = self._associate_detections_to_trackers(
            high_boxes, pred_boxes_arr, self.iou_threshold
        )

        # Update matched trackers with high-score detections
        for det_idx, trk_idx in matched_trks:
            self.trackers[trk_idx].update(high_boxes[det_idx])
            self._last_landmarks[self.trackers[trk_idx].id] = high_dets[det_idx].landmarks

        # 4. Match 2: Remaining unmatched trackers against low-score detections (handles partial occlusion!)
        if len(unmatched_trks_1) > 0 and len(low_dets) > 0:
            low_boxes = np.array([f.bbox.to_list()[:4] for f in low_dets], dtype=np.float32)
            rem_pred_boxes = pred_boxes_arr[unmatched_trks_1]

            matched_low, _, unmatched_trks_2_idx = self._associate_detections_to_trackers(
                low_boxes, rem_pred_boxes, 0.20
            )

            for det_idx, sub_trk_idx in matched_low:
                actual_trk_idx = unmatched_trks_1[sub_trk_idx]
                self.trackers[actual_trk_idx].update(low_boxes[det_idx])
                self._last_landmarks[self.trackers[actual_trk_idx].id] = low_dets[det_idx].landmarks
                unmatched_trks_1.remove(actual_trk_idx)

        # 5. Create new trackers for unmatched high-score detections, provided they do not overlap an existing tracker
        for det_idx in unmatched_dets_1:
            det_box = high_boxes[det_idx]
            has_overlap = False
            for trk in self.trackers:
                tb = trk.get_state()[:4]
                iou_val = calculate_iou_matrix(det_box[None, :], tb[None, :])[0, 0]
                if iou_val >= 0.30:
                    has_overlap = True
                    # If this tracker was unmatched and overlaps, update it instead of spawning a duplicate
                    if trk.time_since_update > 0:
                        trk.update(det_box)
                        self._last_landmarks[trk.id] = high_dets[det_idx].landmarks
                    break

            if not has_overlap:
                trk = KalmanBoxTracker(det_box)
                self.trackers.append(trk)
                self._last_landmarks[trk.id] = high_dets[det_idx].landmarks

        # 5b. Inter-tracker duplicate suppression (suppress redundant tracks tracking the same face)
        self._suppress_duplicate_trackers(iou_thresh=0.35)

        # 6. Build and filter output TrackedFace list
        tracked_faces: List[TrackedFace] = []
        surviving_trackers = []

        for trk in self.trackers:
            # Check state and age
            state_box = trk.get_state()
            x1, y1, x2, y2 = state_box[:4]

            is_occluded = trk.time_since_update > 0
            if trk.hits >= self.min_hits:
                state_str = "OCCLUDED" if is_occluded else "CONFIRMED"
            else:
                state_str = "TENTATIVE"

            # Check if tracker should be preserved in memory for re-association
            if trk.time_since_update <= self.max_lost_frames:
                surviving_trackers.append(trk)

                # Return active tracks ONLY if actively detected in the current frame (time_since_update == 0)
                # Lost/occluded tracks are held internally in surviving_trackers but not emitted to avoid ghost boxes
                if not is_occluded and (trk.hits >= self.min_hits or self.frame_count <= self.min_hits):
                    bbox = BoundingBox(
                        x1=float(x1),
                        y1=float(y1),
                        x2=float(x2),
                        y2=float(y2),
                        score=float(1.0 if not is_occluded else 0.40),
                    )
                    tracked_faces.append(
                        TrackedFace(
                            track_id=trk.id,
                            bbox=bbox,
                            landmarks=self._last_landmarks.get(trk.id, None),
                            det_score=float(bbox.score),
                            state=state_str,
                            age_frames=trk.age,
                            hits=trk.hits,
                            time_since_update=trk.time_since_update,
                            is_occluded=is_occluded,
                        )
                    )
            else:
                # Clean up landmark memory
                self._last_landmarks.pop(trk.id, None)

        self.trackers = surviving_trackers
        return tracked_faces

    def _suppress_duplicate_trackers(self, iou_thresh: float = 0.35) -> None:
        """Suppresses redundant overlapping trackers in self.trackers that track the same physical face."""
        if len(self.trackers) <= 1:
            return

        boxes = np.array([t.get_state()[:4] for t in self.trackers], dtype=np.float32)
        iou_mat = calculate_iou_matrix(boxes, boxes)

        # Priority order: actively updated first (time_since_update == 0), then highest hits, then lower ID
        order = sorted(
            range(len(self.trackers)),
            key=lambda i: (self.trackers[i].time_since_update, -self.trackers[i].hits, self.trackers[i].id),
        )

        keep_indices = set(range(len(self.trackers)))
        for i in order:
            if i not in keep_indices:
                continue
            for j in list(keep_indices):
                if i != j and iou_mat[i, j] >= iou_thresh:
                    keep_indices.discard(j)
                    self._last_landmarks.pop(self.trackers[j].id, None)

        self.trackers = [self.trackers[idx] for idx in range(len(self.trackers)) if idx in keep_indices]


    def _associate_detections_to_trackers(
        self,
        detections: np.ndarray,
        trackers: np.ndarray,
        iou_thresh: float,
    ) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        """Assigns detections to tracked objects using the Hungarian algorithm."""
        if len(trackers) == 0:
            return [], list(range(len(detections))), []
        if len(detections) == 0:
            return [], [], list(range(len(trackers)))

        iou_matrix = calculate_iou_matrix(detections, trackers)

        # Hungarian algorithm minimizes cost, so we use negative IoU
        cost_matrix = -iou_matrix
        det_indices, trk_indices = linear_sum_assignment(cost_matrix)

        matched_indices = []
        unmatched_detections = set(range(len(detections)))
        unmatched_trackers = set(range(len(trackers)))

        for d_idx, t_idx in zip(det_indices, trk_indices):
            if iou_matrix[d_idx, t_idx] >= iou_thresh:
                matched_indices.append((int(d_idx), int(t_idx)))
                unmatched_detections.discard(d_idx)
                unmatched_trackers.discard(t_idx)

        return matched_indices, list(unmatched_detections), list(unmatched_trackers)

