# Photo Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Teachers review 1–3 classroom photos and safely confirm attendance in the existing college management system.

**Architecture:** Use backend/ and frontend/, selected under the user's delegated choice. Separate photo recognition from persistence; signed face references link stateless preview to atomic SQLAlchemy confirmation. Preserve compatibility APIs and video behavior.

**Tech Stack:** FastAPI, async SQLAlchemy, InsightFace, NumPy/OpenCV, React/TypeScript/Tailwind.

**Spec:** docs/superpowers/specs/2026-11-15-photo-attendance-design.md

## Global constraints

- Preserve UNIQUE(session_id, student_id) and existing endpoint response contracts.
- No heavy new dependencies; use requirements.txt in a separate backend virtual environment, preserving .venv for attendance_app.
- PHOTO_DET_SIZE=1280, PHOTO_TILE_SIZE=640, PHOTO_TILE_OVERLAP=0.20; 35-pixel minimum faces.
- Verified similarity >=0.58 and margin >=0.05; review >=0.40; unknown below 0.40 never marks.
- Preview writes no database rows. Confirmation requires ACTIVE and returns 400 otherwise.
- Source PHOTO; protect manual/excused records; audit actor/session/counts.
- New TypeScript code uses no any.

## Decisions delegated to implementation

- Implement inline in the current chat. Keep work in the current checkout on a dedicated codex branch; preserve the lightweight app and its data.
- Extend all desktop photo entry points to review before saving. Legacy API clients retain immediate-write contracts with verified-only safety checks.
- Add nullable student batch membership. Snapshot the resolved batch ID/label on the session at creation/start so later timetable deletion cannot expand its roster. Batch deletion or inconsistent membership fails closed. Reuse the same eligibility resolver for preview, confirm, roster, counts and closing absences.
- Assess lateness at confirmation time, using the current session scheduling convention and its grace period (including zero). Document that reviewing after the grace period yields LATE.
- Signed references expire after 15 minutes, bound to actor/session and distinct token purpose. Review choices can select eligible enrolled students; unknown references cannot be overridden into attendance.

## Review focus

- EXIF rotation: boxes and landmarks must align to the displayed image.
- Empty or changed eligible roster: never fall back to global enrollment.
- Concurrent session closure: confirmation cannot write after closure.
- Duplicate identity across photos: one record, best score, clear UI selection.
- Existing bootstrap database versus Alembic database: migrate without losing records or widening batch eligibility.

### Task 1: Environment and baseline

Files: requirements.txt (reuse), scripts/start-full.sh (new), README.md (later documentation).
- [ ] Create a separate backend environment using existing requirements; install frontend lockfile dependencies.
- [ ] Run backend unit/integration baseline and frontend build; record existing failures separately.
- [ ] Provide an explicit full-stack launch command without replacing or deleting attendance_app data.

### Task 2: Photo detector

Files: ai_engine/detection/photo.py (new), backend/app/core/config.py, tests/unit/test_photo_detection.py (new).
Interface: PhotoDetector.detect(image: np.ndarray) -> list[DetectedFace].
- [ ] Write failing tests for full-image/tile merging, edge coverage, landmark offsets, 35px filtering and unchanged live defaults.
- [ ] Run pytest tests/unit/test_photo_detection.py and verify expected failures.
- [ ] Implement a dedicated lazily initialized photo SCRFD detector, configurable dimensions/overlap, coordinate translation and existing NMS. Serialize its inference; bound decoded image dimensions and tile count.
- [ ] Run targeted tests and format/lint changed Python.

### Task 3: Matching

Files: ai_engine/recognition/photo_matcher.py (new), tests/unit/test_photo_matcher.py (new).
Interface: classify_scores(scores: list[tuple[str, float]], threshold: float, lower: float, margin: float) -> str; assign_faces(faces: list[dict]) -> list[dict].
- [ ] Write boundary assertions: .39 UNKNOWN, .40/.57 NEEDS_REVIEW, .58 VERIFIED with adequate margin; failed margin demotes; duplicate claims retain the highest score.
- [ ] Verify RED, implement unrounded identity-level scores and deterministic assignment, verify GREEN.
- [ ] Test multiple templates for one identity, no eligible candidates and best-score merging across images.

### Task 4: Eligibility and safe marking

Files: backend/app/models/entities.py, backend/app/services/attendance_service.py, backend/app/services/photo_attendance_service.py (new), backend/app/schemas/student.py, backend/app/services/student_service.py, backend/alembic/versions/ (new migration).
Interfaces: eligible_photo_students(db, session) -> list[Student]; AttendanceService.confirm_photo_attendance(db, session_id, selections, actor_id) -> confirmation result.
- [ ] Write failing tests for class/batch eligibility, protected records, absence recovery, lateness including zero grace, duplicate confirms, concurrent close and atomic invalid selection rejection.
- [ ] Add batch membership/session snapshot migration; support existing bootstrap schema and migration schema, testing both on temporary databases.
- [ ] Implement shared eligibility for recognition/roster/closure; lock session, recheck ACTIVE, apply all changes and audit in one transaction.
- [ ] Verify all targeted service tests and existing attendance workflow tests.

### Task 5: Preview and confirm APIs

Files: backend/app/api/v1/media_attendance.py, backend/app/schemas/media_attendance.py, backend/app/services/photo_attendance_service.py, tests/integration/test_photo_preview_confirm.py (new).
- [ ] Write failing authenticated API tests for 1–3 files, size/format/EXIF limits, zero preview writes, closed-session 400, invalid/expired/cross-user evidence and UNKNOWN rejection.
- [ ] Implement typed preview/confirm responses; return annotated base64 image and signed per-face evidence with 15-minute expiry. Use DB FaceProfile enrollment only.
- [ ] Reject invalid selection lists before any writes; refresh eligibility at confirm; test replay idempotency.
- [ ] Adapt old image routes through safe verified-only marking while retaining aliases/response keys; run compatibility integration tests.

### Task 6: Teacher UI

Files: frontend/src/components/PhotoAttendancePanel.tsx (new), frontend/src/types/mediaAttendance.ts, frontend/src/services/mediaAttendanceApi.ts, frontend/src/features/live/LiveDashboardPage.tsx, frontend/src/features/attendance/AttendancePage.tsx, frontend/src/features/media/MediaAttendancePage.tsx, student management types/API/UI.
- [ ] Add explicit response/request types and preview/confirm API functions.
- [ ] Build camera/file inputs, three-photo limit, annotated images, verified checkboxes, review dropdowns/rejection and nonselectable unknowns.
- [ ] Prevent repeated face/student selections; discard stale async results when session/files change; render useful loading/error/empty/expired states.
- [ ] Integrate into existing photo surfaces and refresh roster after confirmation. Expose optional student batch assignment with class-scoped choices.
- [ ] Run npm run build and inspect mobile/desktop flows with mocked recognition, then an available real test image without claiming measured classroom accuracy.

### Task 7: Full verification and handoff

Files: README.md, scripts/start-full.sh, all changed implementation files.
- [ ] Run pytest tests/unit/ tests/integration/, appropriate black/flake8 checks, and frontend npm run build; investigate regressions and report baseline failures.
- [ ] Obtain one independent whole-change review and fix important findings with regression tests.
- [ ] Document full-stack setup, enrollment/batches, capture/review/confirm and teacher tips (front, face height, lighting, 2–3 photos).
- [ ] Deliver changed files, verified commands, manual steps and limitations. Do not push/deploy or run migrations on the user's live database.

## Baseline observed

2026-11-15: `.venv/bin/python -m pytest tests/unit/ --collect-only -q` exits 4 because pytest_asyncio is missing. Existing .venv belongs to the separate lightweight app; this is not a product test failure.


## Execution record — 2026-11-15

Implemented inline on codex/photo-review. See docs/implementation/photo-attendance-handoff.md for final verification, files and limitations. Native branch retained locally; no push/deployment.

Ruling: keep legacy API contracts but require ACTIVE sessions and DB enrollment; one existing API fixture was updated to establish those valid preconditions and asserts rejection before activation.
Ruling: preserve UTC/confirmation-time lateness; changing campus timezone semantics is outside this photo feature.
Ruling: verify photo migration/backfill separately and document historical Alembic failure rather than silently repairing the unrelated legacy migration chain.
Ruling: legacy file formatting is limited to changed regions; new modules pass Black and flake8. Full legacy lint cleanup is outside scope.
Final review: independent reviewer findings addressed for batch edits, scope snapshots/backfill, bounded authenticated multipart parsing, batch counts/closure, usable enrollment checks, stale drawer session binding and verified-only legacy API marking.
Verification: 173 repository tests passed; backend unit/integration 165 passed; final targeted API regression 21 passed; frontend build passed. Browser walkthrough and PostgreSQL deployment remain unverified.
