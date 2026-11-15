"""Identity-level decisions for reviewed classroom photographs."""

import math


def classify_scores(scores, threshold=0.58, lower=0.40, margin=0.05):
    if not scores or not math.isfinite(scores[0][1]) or scores[0][1] < lower:
        return "UNKNOWN"
    top = scores[0][1]
    gap = top - scores[1][1] if len(scores) > 1 else 1.0
    if top >= threshold and (gap >= margin or math.isclose(gap, margin, abs_tol=1e-12)):
        return "VERIFIED"
    return "NEEDS_REVIEW"


def assign_faces(faces):
    winners = {}
    for face in sorted(faces, key=lambda f: f["similarity"], reverse=True):
        student = face.get("student_id")
        if not student or face["bucket"] == "UNKNOWN":
            continue
        if student in winners:
            face["bucket"] = "NEEDS_REVIEW"
            face["quality_flags"].append("duplicate_identity")
        else:
            winners[student] = face
    return faces
