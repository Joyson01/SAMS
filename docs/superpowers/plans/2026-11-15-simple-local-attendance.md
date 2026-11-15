# Simple Local Photo Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing platform with a small laptop-hosted application that enrolls students from three face photos, recognizes a classroom photo, lets a teacher review results, and stores attendance locally.

**Architecture:** A single FastAPI application serves Jinja templates and JSON/form endpoints, with SQLite persistence through SQLAlchemy. A focused recognition adapter wraps InsightFace/ONNX Runtime so tests can use deterministic fakes; the production model runs locally on CPU. Phone capture uses the native HTML file input camera picker over the LAN.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Jinja2, SQLAlchemy 2, Alembic, SQLite, InsightFace, ONNX Runtime CPU, OpenCV, Pillow, pytest, HTTPX.

**Spec:** `docs/superpowers/specs/2026-11-15-simple-local-attendance-design.md`

## Global Constraints

- Normal attendance must work offline after dependency and model installation.
- All student, biometric, and attendance data remains on the laptop.
- Enrollment requires exactly three accepted single-face images per student.
- Recognition results remain proposals until a teacher confirms them.
- Low-confidence or duplicate matches remain unknown; they are never silently assigned.
- Source enrollment photos and classroom photos are deleted after successful processing by default.
- `.git` history is preserved and the current commit receives a safety tag before replacement.
- Initial supported environment is Ubuntu/Linux with modern desktop and Android Chrome browsers.
- Phone access uses a native camera file input (`accept="image/*" capture="environment"`) and a teacher PIN; it does not require LAN HTTPS.
- Deleting a student deactivates their roster entry and deletes biometric embeddings while retaining historical attendance rows.
- Pretrained InsightFace model weights are used only under the user's academic/local-demonstration assumption.

## Review Focus

- A classroom photo containing unknown or low-confidence faces must never mark those people as enrolled students (Task 4).
- Duplicate detections proposing the same student must keep only the strongest match (Task 4).
- A failed enrollment or recognition request must leave no source image behind (Tasks 3 and 4).
- Two confirmations of the same draft must not create duplicate attendance records (Task 5).
- LAN routes must reject missing or incorrect teacher PIN sessions without exposing rosters or attendance (Task 2).

---

### Task 1: Safe Repository Reset and Minimal Application Boot

**Files:**
- Preserve: `.git/`
- Preserve: `docs/superpowers/specs/2026-11-15-simple-local-attendance-design.md`
- Preserve: `docs/superpowers/plans/2026-11-15-simple-local-attendance.md`
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `attendance_app/__init__.py`
- Create: `attendance_app/main.py`
- Create: `tests/test_health.py`
- Create: `README.md`

**Interfaces:**
- Consumes: the approved spec and this plan.
- Produces: `attendance_app.main.create_app() -> FastAPI` and `GET /health -> {"status": "ok"}`.

- [ ] **Step 1: Inspect and protect the current repository**

Run `git status --short --branch`, `git diff --stat`, and `git ls-files --others --exclude-standard`; record any uncommitted work before deletion. Create an annotated safety tag at `HEAD` named `before-simple-rebuild-2026-11-15` unless it already exists.

- [ ] **Step 2: Remove the obsolete project safely**

Delete all tracked and untracked project content except `.git/` and the two approved design/plan documents. Do not delete or recreate `.git/`. Verify the remaining filesystem before scaffolding.

- [ ] **Step 3: Write the failing health test**

Create `test_health_returns_ok()` using `fastapi.testclient.TestClient(create_app())`; assert status 200 and exact JSON `{"status": "ok"}`.

- [ ] **Step 4: Run the health test and verify failure**

Run: `pytest tests/test_health.py -v`
Expected: FAIL because `attendance_app.main` or `create_app` does not exist.

- [ ] **Step 5: Add the minimal package and application factory**

Define `create_app() -> FastAPI` in `attendance_app/main.py`, register `/health`, and define pinned runtime/test dependency groups in `pyproject.toml`. Document virtual-environment setup and localhost start commands in `README.md`.

- [ ] **Step 6: Run the health test**

Run: `pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: reset project to minimal attendance app"
```

### Task 2: Local Database and Teacher PIN Boundary

**Files:**
- Create: `attendance_app/config.py`
- Create: `attendance_app/db.py`
- Create: `attendance_app/models.py`
- Create: `attendance_app/auth.py`
- Create: `attendance_app/routes/auth.py`
- Create: `attendance_app/templates/login.html`
- Create: `attendance_app/static/app.css`
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/0001_initial.py`
- Create: `tests/test_database.py`
- Create: `tests/test_auth.py`

**Interfaces:**
- Consumes: `create_app()` from Task 1.
- Produces: `Settings`, `get_session()`, SQLAlchemy models `Classroom`, `Student`, `FaceEmbedding`, `Subject`, `AttendanceSession`, `AttendanceRecord`; `require_teacher(request: Request) -> None`; `/login` and `/logout`.

- [ ] **Step 1: Write failing schema tests**

Test that duplicate class names and duplicate `(classroom_id, roll_number)` values raise `IntegrityError`, and that deactivating a student can coexist with retained `AttendanceRecord` rows.

- [ ] **Step 2: Write failing PIN boundary tests**

Test that `/` redirects an unauthenticated client to `/login`, a wrong PIN returns 401 without a session cookie, a correct `TEACHER_PIN` establishes a signed session, and `/logout` removes it.

- [ ] **Step 3: Run database and auth tests to verify failure**

Run: `pytest tests/test_database.py tests/test_auth.py -v`
Expected: FAIL because the database and auth modules do not exist.

- [ ] **Step 4: Implement settings, models, migration, and session factory**

Use `APP_DATA_DIR`, `DATABASE_URL`, `TEACHER_PIN`, and `SESSION_SECRET` settings. Store embeddings as float32 bytes plus dimension and quality score. Enforce database uniqueness for class names, class roll numbers, and `(attendance_session_id, student_id)`.

- [ ] **Step 5: Implement signed-session PIN login**

Add session middleware in `create_app()`, constant-time PIN comparison, route dependency enforcement, login/logout routes, and a minimal responsive login template. Never log the PIN.

- [ ] **Step 6: Run database and auth tests**

Run: `pytest tests/test_database.py tests/test_auth.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add attendance_app alembic.ini alembic tests
git commit -m "feat: add local data model and teacher access"
```

### Task 3: Classes, Students, and Three-Photo Enrollment

**Files:**
- Create: `attendance_app/recognition/types.py`
- Create: `attendance_app/recognition/engine.py`
- Create: `attendance_app/services/students.py`
- Create: `attendance_app/routes/students.py`
- Create: `attendance_app/templates/base.html`
- Create: `attendance_app/templates/home.html`
- Create: `attendance_app/templates/students.html`
- Create: `attendance_app/templates/enroll.html`
- Create: `attendance_app/static/capture.js`
- Create: `tests/fakes.py`
- Create: `tests/test_students.py`
- Create: `tests/test_enrollment.py`

**Interfaces:**
- Consumes: database session and `require_teacher()` from Task 2.
- Produces: `DetectedFace(box, embedding, quality)`, protocol `RecognitionEngine.analyze(image_bytes: bytes) -> list[DetectedFace]`, `enroll_student(session, engine, classroom_id, name, roll_number, images: list[bytes]) -> Student`, and protected class/student routes.

- [ ] **Step 1: Write failing class and student tests**

Test class creation, name/roll validation, roster listing, and student deactivation that deletes embeddings but retains the student row.

- [ ] **Step 2: Write failing enrollment tests**

Test rejection of fewer or more than three images, zero/multiple faces in any image, low-quality faces, mismatched identities across the three photos, and a duplicate identity warning. Test successful enrollment stores three embeddings and stores no raw photo. Include a failure-path assertion that the upload/temp directory is empty.

- [ ] **Step 3: Run student and enrollment tests to verify failure**

Run: `pytest tests/test_students.py tests/test_enrollment.py -v`
Expected: FAIL because the service and routes do not exist.

- [ ] **Step 4: Implement recognition types and lazy InsightFace adapter**

Define the protocol and an `InsightFaceEngine` that loads the configured model lazily on first analysis, uses CPU execution, validates decodable images, and returns normalized embeddings without persisting input images.

- [ ] **Step 5: Implement enrollment service and routes**

Validate exactly three images, one quality-approved face per image, cross-photo identity consistency, and duplicate-gallery similarity. Use a transaction so a failed enrollment stores neither student nor embeddings. Provide native camera inputs with `capture="user"`.

- [ ] **Step 6: Run student and enrollment tests**

Run: `pytest tests/test_students.py tests/test_enrollment.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add attendance_app tests
git commit -m "feat: add student face enrollment"
```

### Task 4: Classroom Photo Recognition and Review Draft

**Files:**
- Create: `attendance_app/services/recognition.py`
- Create: `attendance_app/routes/attendance.py`
- Create: `attendance_app/templates/take_attendance.html`
- Create: `attendance_app/templates/review_attendance.html`
- Create: `tests/test_recognition.py`
- Create: `tests/test_attendance_draft.py`

**Interfaces:**
- Consumes: `RecognitionEngine`, enrolled embeddings, class roster, and teacher auth.
- Produces: `MatchProposal(student_id: int | None, confidence: float, box: tuple[int,int,int,int])`, `match_faces(detected, gallery, threshold, duplicate_margin) -> list[MatchProposal]`, and a short-lived server-side attendance draft referenced by an opaque ID.

- [ ] **Step 1: Write failing matcher tests**

Test known matches above threshold, low-confidence faces remaining unknown, faces from another class being excluded, and two detections matching one student retaining only the highest-confidence proposal.

- [ ] **Step 2: Write failing capture and draft tests**

Test invalid/oversized image rejection, creation of present/absent/unknown review groups, opaque ownership-bound draft IDs, and cleanup of source bytes on both success and recognition failure.

- [ ] **Step 3: Run recognition tests to verify failure**

Run: `pytest tests/test_recognition.py tests/test_attendance_draft.py -v`
Expected: FAIL because matching and draft services do not exist.

- [ ] **Step 4: Implement vector matching and duplicate resolution**

Normalize float32 embeddings, compute cosine similarity against only the selected class gallery, apply configured threshold/margin, and resolve duplicate student proposals by confidence.

- [ ] **Step 5: Implement capture and review routes**

Accept one native camera/upload image with configured size and MIME limits, run analysis, create an expiring server-side draft without retaining source pixels, and render review checkboxes plus boxes/names/unknown markers over a transient in-memory preview.

- [ ] **Step 6: Run recognition tests**

Run: `pytest tests/test_recognition.py tests/test_attendance_draft.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add attendance_app tests
git commit -m "feat: propose attendance from a classroom photo"
```

### Task 5: Confirm Attendance, History, and CSV Export

**Files:**
- Create: `attendance_app/services/attendance.py`
- Create: `attendance_app/routes/history.py`
- Create: `attendance_app/templates/history.html`
- Create: `attendance_app/templates/session_detail.html`
- Create: `tests/test_attendance_confirmation.py`
- Create: `tests/test_history.py`

**Interfaces:**
- Consumes: an unexpired attendance draft from Task 4 and the Task 2 data model.
- Produces: `confirm_draft(session, draft, present_student_ids: set[int]) -> AttendanceSession`, protected history/detail routes, and `GET /attendance/{id}.csv`.

- [ ] **Step 1: Write failing confirmation tests**

Test that confirmation creates exactly one present/absent record for every active roster student, rejects students outside the class, records manual adjustments, consumes the draft, and makes a repeated confirmation idempotent without duplicate records.

- [ ] **Step 2: Write failing history and CSV tests**

Test newest-first history filtering by class/date, session detail status display, correct UTF-8 CSV headers/rows, preserved historical names after student deactivation, and teacher-PIN protection for every endpoint.

- [ ] **Step 3: Run confirmation/history tests to verify failure**

Run: `pytest tests/test_attendance_confirmation.py tests/test_history.py -v`
Expected: FAIL because confirmation and history modules do not exist.

- [ ] **Step 4: Implement atomic confirmation**

Validate the draft, lock through the transaction boundary available in SQLite, create the session and one unique record per active student, set `manually_adjusted` when the submitted checkbox differs from the proposal, and consume the draft only after commit.

- [ ] **Step 5: Implement history, detail, and streaming CSV routes**

Render basic filters and summary counts. Generate CSV with session metadata and one row per attendance record using stored historical display values or an equivalent snapshot mechanism.

- [ ] **Step 6: Run confirmation/history tests**

Run: `pytest tests/test_attendance_confirmation.py tests/test_history.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add attendance_app tests
git commit -m "feat: confirm and export attendance records"
```

### Task 6: Installation, LAN Start, and End-to-End Verification

**Files:**
- Create: `attendance_app/cli.py`
- Create: `scripts/install.sh`
- Create: `scripts/start-local.sh`
- Create: `scripts/start-phone.sh`
- Create: `tests/test_app_flow.py`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the complete application from Tasks 1–5.
- Produces: `attendance-app init`, localhost and LAN launch scripts, verified setup documentation, and an end-to-end automated flow.

- [ ] **Step 1: Write the failing end-to-end test**

Using the fake recognition engine, test PIN login, class creation, three-photo enrollment, classroom-photo analysis with known and unknown faces, manual review adjustment, confirmation, history display, CSV export, and student deactivation.

- [ ] **Step 2: Run the flow test to verify failure**

Run: `pytest tests/test_app_flow.py -v`
Expected: FAIL until missing CLI/startup wiring and route integration are complete.

- [ ] **Step 3: Implement initialization and start scripts**

`attendance-app init` creates the data directory, applies migrations, validates the PIN/secret, and prepares the model cache. `start-local.sh` binds to `127.0.0.1`; `start-phone.sh` binds to `0.0.0.0`, prints detected private LAN URLs, and warns that the PIN protects access on shared Wi-Fi.

- [ ] **Step 4: Complete concise setup and operating documentation**

Document prerequisites, model-license limitation, installation, local and phone startup, enrollment, attendance, backups, model/cache location, deletion behavior, troubleshooting, and how to stop the server.

- [ ] **Step 5: Run automated verification**

Run: `pytest -q`
Expected: all tests pass.

Run: `python -m compileall attendance_app`
Expected: success with no syntax errors.

- [ ] **Step 6: Run manual smoke verification**

Start in localhost mode, verify login and core pages, then start phone mode and verify the native camera picker from Android Chrome on the same Wi-Fi. Record any recognition calibration limitations instead of weakening unknown-face safeguards.

- [ ] **Step 7: Commit**

```bash
git add attendance_app scripts tests README.md .env.example pyproject.toml
git commit -m "docs: finish local attendance setup and verification"
```

## Self-review Result

- Spec coverage: all goals, exclusions, privacy rules, repository reset, enrollment, recognition review, confirmation, history, export, deletion, and verification map to Tasks 1–6.
- Step scan: each implementation step has a specific interface or observable outcome; setup is folded into the task that needs it.
- Type consistency: recognition and attendance interfaces are introduced once and consumed by later tasks under the same names.
- Review focus: each listed failure mode has an explicit owning test.
- Proportion: details are limited to decisions and interfaces that an implementer could not safely infer from the design alone.
