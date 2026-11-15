from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import numpy as np

from ai_engine.base import DecisionState, MatchCandidate


@dataclass
class EnrolledTemplate:
    profile_id: str
    student_id: str
    student_code: str
    roll_number: str
    name: str
    embedding: np.ndarray
    quality_score: float
    pose_type: str


class VectorMatcher:
    """In-memory vectorized cosine similarity matcher with multi-template support and 3-state decision logic."""

    def __init__(
        self,
        known_threshold: float = 0.50,
        uncertain_threshold: float = 0.35,
        margin_threshold: float = 0.05,
    ):
        self.known_threshold = known_threshold
        self.uncertain_threshold = uncertain_threshold
        self.margin_threshold = margin_threshold

        # In-memory storage
        self.templates: List[EnrolledTemplate] = []
        self._gallery_matrix: Optional[np.ndarray] = None  # (N, 512) float32
        self._student_metadata: List[Tuple[str, str, str, str]] = []  # (student_id, student_code, roll_number, name)

    @property
    def total_templates(self) -> int:
        return len(self.templates)

    @property
    def total_students(self) -> int:
        return len(set(t.student_id for t in self.templates))

    def set_thresholds(
        self,
        known_threshold: Optional[float] = None,
        uncertain_threshold: Optional[float] = None,
        margin_threshold: Optional[float] = None,
    ) -> None:
        """Dynamically update classification thresholds."""
        if known_threshold is not None:
            self.known_threshold = known_threshold
        if uncertain_threshold is not None:
            self.uncertain_threshold = uncertain_threshold
        if margin_threshold is not None:
            self.margin_threshold = margin_threshold

    def build_index(self, templates: List[EnrolledTemplate]) -> None:
        """Rebuilds the continuous memory matrix for BLAS vectorized similarity search."""
        self.templates = templates
        if not templates:
            self._gallery_matrix = None
            self._student_metadata = []
            return

        embeddings = []
        metadata = []
        for t in templates:
            emb = np.asarray(t.embedding, dtype=np.float32).reshape(-1)
            norm = np.linalg.norm(emb)
            if norm > 0:
                embeddings.append(emb / norm)
                metadata.append((t.student_id, t.student_code, t.roll_number, t.name))

        if embeddings:
            self._gallery_matrix = np.stack(embeddings, axis=0).astype(np.float32)
            self._student_metadata = metadata
        else:
            self._gallery_matrix = None
            self._student_metadata = []

    def match(
        self,
        query_embedding: np.ndarray,
        top_k: int = 3,
    ) -> Tuple[DecisionState, Optional[MatchCandidate], List[MatchCandidate], str]:
        """Matches query embedding against gallery index and returns 3-state classification.

        Returns:
            Tuple[DecisionState, best_match, top_candidates, decision_reason]
        """
        if self._gallery_matrix is None or len(self._student_metadata) == 0:
            return (
                DecisionState.UNKNOWN,
                None,
                [],
                "No enrolled students in gallery index.",
            )

        q = np.asarray(query_embedding, dtype=np.float32).reshape(1, -1)
        q_norm = np.linalg.norm(q)
        if q_norm == 0:
            return (
                DecisionState.UNKNOWN,
                None,
                [],
                "Invalid zero-length query embedding vector.",
            )
        q = q / q_norm

        # Single BLAS matrix multiplication: (1, 512) @ (512, N) -> (1, N)
        similarities = np.matmul(q, self._gallery_matrix.T)[0]

        # Aggregate multiple templates per student by taking MAX similarity
        student_scores: Dict[str, Tuple[float, str, str, str]] = {}
        for idx, sim in enumerate(similarities):
            s_id, s_code, s_roll, s_name = self._student_metadata[idx]
            sim_val = float(sim)
            if s_id not in student_scores or sim_val > student_scores[s_id][0]:
                student_scores[s_id] = (sim_val, s_code, s_roll, s_name)

        # Sort candidates descending by similarity
        sorted_students = sorted(
            student_scores.items(),
            key=lambda item: item[1][0],
            reverse=True,
        )

        candidates: List[MatchCandidate] = []
        for s_id, (sim, s_code, s_roll, s_name) in sorted_students[:top_k]:
            conf_pct = float(np.clip((sim - self.uncertain_threshold) / (1.0 - self.uncertain_threshold) * 100.0, 0.0, 100.0))
            candidates.append(
                MatchCandidate(
                    student_id=s_id,
                    student_code=s_code,
                    roll_number=s_roll,
                    name=s_name,
                    similarity=round(sim, 4),
                    confidence_pct=round(conf_pct, 1),
                )
            )

        if not candidates:
            return (
                DecisionState.UNKNOWN,
                None,
                [],
                "No match candidates generated.",
            )

        best_cand = candidates[0]
        top_sim = best_cand.similarity

        # Evaluate Decision State
        if top_sim >= self.known_threshold:
            # Check for ambiguous tie with candidate #2
            if len(candidates) > 1:
                second_sim = candidates[1].similarity
                margin = top_sim - second_sim
                if margin < self.margin_threshold:
                    return (
                        DecisionState.UNCERTAIN,
                        best_cand,
                        candidates,
                        f"Ambiguous match: top similarity {top_sim:.3f} is too close to 2nd match {second_sim:.3f} (margin {margin:.3f} < {self.margin_threshold:.3f}).",
                    )

            return (
                DecisionState.KNOWN,
                best_cand,
                candidates,
                f"High confidence match ({top_sim:.3f} >= {self.known_threshold:.3f}).",
            )

        elif top_sim >= self.uncertain_threshold:
            return (
                DecisionState.UNCERTAIN,
                best_cand,
                candidates,
                f"Uncertain match ({top_sim:.3f} between [{self.uncertain_threshold:.3f}, {self.known_threshold:.3f})).",
            )
        else:
            return (
                DecisionState.UNKNOWN,
                None,
                candidates,
                f"Unknown identity: highest similarity {top_sim:.3f} < threshold {self.uncertain_threshold:.3f}.",
            )

