# Implementation decisions

- 2026-11-15: Preserve the existing FastAPI/async SQLAlchemy and React architecture, existing dirty working tree, and attendance uniqueness constraint. Work in the existing `codex/photo-review` checkout so prior uncommitted fixes remain included. No commits or deployment implied.
- Execute the supplied phases autonomously, with test/build gates; the user explicitly opted out of design questions and approval pauses.
- Use Python 3.11 for verification: the system Python is 3.14, outside the repository's declared <3.14 support. Fresh environment: `.venv-verify`.
- SQLite is the development default; PostgreSQL remains configurable. Tests and HTTP smoke runs use separate databases and never seed or reset the user's database.
- Public registration never grants privileged roles. Account/student association requires administrator verification, preventing anyone claiming a known roll number from reading another person's records.
- Similarity is a cosine score, not a calibrated probability. Webcam checks cannot be claimed from build success.
- Phase 0: model verification succeeded on real InsightFace t1; baseline 173 tests passed after manifest repair. Frontend baseline passed.
- Phase 1: account/student linking is administrator-controlled. Bcrypt input is capped at 72 UTF-8 bytes with a validation error instead of a server failure. Auth bypass is honored only in development. Full gate: 179 passed, frontend build passed; two additional auth edge tests passed and were included in the following full gate.
- Phase 2: reuse existing academic screens; add batch CRUD and class-subject mapping panel. Demo data is explicitly opt-in and academic-only. Full gate: 183 passed; frontend build passed.
- Enrollment uses one validated sample per configured pose; retaking replaces that pose. Embeddings persist in SQL face_profiles, which is the source of truth. Pose estimates from five landmarks are approximate, not calibrated head tracking.

- Review: publish the normalized recognition matrix and metadata as one immutable snapshot so concurrent enrollment cannot relabel a match. Tag enrollment captures by student/pose, discard stale responses and clear captures on context changes.
- Automated browser and HTTP runs use real images with FRONT-only enrollment on disposable servers. Default seven-pose behavior is unchanged and needs physical-webcam acceptance.
- CPU timing is measured separately from competing inference jobs; a concurrent run exceeded the three-second smoke target and is disclosed in the final report.
