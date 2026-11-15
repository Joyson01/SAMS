# AttedDEL

AttedDEL is an attendance management workspace for faculty and administrators. It brings together class schedules, student records, attendance sessions, reports, and camera diagnostics in a responsive React interface backed by FastAPI.

The repository is named **SAMS**. Use the **`joyson` branch** for the current application and UI updates. The separate legacy `attendance_app` remains for compatibility and regression coverage.

## Workspace overview

- **Dashboard:** attendance summaries, daily classes, recent activity and system health.
- **Attendance sessions:** scheduling, session records, roster review and manual attendance.
- **Students and academics:** student directory, classes, subjects, batches and timetable management.
- **Reports:** attendance analytics and CSV exports.
- **Anonymous detection:** upload a photo to locate visible faces without matching identities or recording attendance.
- **Interface:** light and dark themes, compact desktop navigation, responsive tables, keyboard focus states and mobile navigation.

The app also contains enrollment, recognition and photo-review workflows. Detection counts and similarity scores should not be treated as proof of identity or classroom-wide accuracy.

## Technology

| Layer | Stack |
| --- | --- |
| Interface | React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, Inter |
| API | Python, FastAPI, SQLAlchemy |
| Storage | SQLite for local development; PostgreSQL support |
| Vision | InsightFace buffalo_l, ONNX Runtime, OpenCV, Pillow |

## Run on your laptop

Install Python 3.11–3.13 (3.11 tested), or Python plus uv; install Node.js 20+ and npm. Clone the current application branch:

```bash
git clone --branch joyson https://github.com/Joyson01/SAMS.git
cd SAMS
```

From the repository root, start the app:

```bash
./start.sh
```

On Windows run `start.bat`. The launcher creates `.venv-attedel`, installs backend/frontend dependencies, creates `.env` if absent, initializes the database through startup and starts both services. Open **http://localhost:5173**. API docs: **http://localhost:8000/api/v1/docs**. Ctrl+C stops both services. Existing `.env` is preserved. Busy ports produce an error rather than killing another process.

The standard launcher enables authentication even if a previous local session used login bypass. Initial dependency installation and model loading can take longer than later starts.

An empty development database gets **admin / Admin@12345**. Change that password in Users immediately; resetting a password revokes sessions. Alternative first-admin methods: `/setup` or, inside the app virtual environment, `python -m scripts.create_admin`. Setup works only while no ADMIN exists; outside development it also requires BOOTSTRAP_TOKEN. No development account is seeded in production, and the default development administrator password is rejected there.

Create a class/subject in Courses & Rooms, add students, then select Enroll on your student. Complete the guided poses and open Recognition Test. Live Attendance lets you create/select a session and use the built-in webcam without registering a separate camera. Finish marks unrecorded roster members absent. Reports exports CSV. Student accounts use My Attendance after an administrator links their roll number and student code.

## Anonymous photo detection

Sign in as an administrator or faculty member, then choose **Cameras & AI → Anonymous Detection**, or open `/anonymous-detection`.

1. Upload an original still JPEG, PNG or WebP photo.
2. Review the face boxes and count. Dashed boxes mark small faces that need visual review.
3. Upload another image to repeat the check. The page shows progress and clears old results when a new upload fails.

Uploads are limited to **15 MB**, **24 megapixels**, and **8000 pixels per side**. Animated images are rejected. Image orientation is corrected before detection. This mode returns locations and detection scores; it does not read the student gallery, generate recognition embeddings, or save attendance.

The count represents detected visible faces, not everyone in the room. Small, covered or turned-away faces can be missed. A back-row example returned six boxes including the previously missed face; that is a single-image check, not an accuracy benchmark.

## Functionality and validation notes

- Public student registration, login, refresh rotation, logout invalidation, bootstrap restrictions, staff account management and student record linking.
- Academic CRUD, batch management, class-subject mapping, timetable editing and an idempotent academic-only demo seeder.
- Server-validated face quality/pose checks, duplicate identity rejection at 0.80, pose retakes, SQL embedding persistence and automatic runtime gallery updates.
- Read-only Recognition Test with live/uploaded images, mirrored boxes, similarity and top candidates, gallery/latency stats and development controls.
- Real-image temporal attendance confirmation, session isolation/cleanup, one record per student/session, closure rejection and absent population.
- Photo preview/review/confirmation, margin buckets, one-to-one selection, idempotency and protection of MANUAL_PRESENT/EXCUSED.
- Linux startup from a clean source snapshot, frontend TypeScript/build, HTTP smoke and Chromium fake-camera flow.

The automated camera tests configured **FRONT only** on disposable servers. Physical webcam permissions, all seven guided poses, Windows/macOS startup, real phones/RTSP, PostgreSQL and CUDA still require validation. No physical webcam was used. See [manual QA](docs/MANUAL_QA.md), [troubleshooting](docs/TROUBLESHOOTING.md), [audit](docs/AUDIT.md) and [final verification report](docs/FINAL_REPORT.md).

For the November 16, 2026 updates, the anonymous detection and photo-detector checks passed (14 tests). The frontend production build passed after UI polishing. Browser checks covered navigation, directory search, dialog controls, desktop and phone layouts, dark mode and keyboard focus. These are scoped results, not a new full-suite certification. See the [UI polish report](docs/UNSLOP_DIRECTION.md) and [anonymous detection design](docs/anonymous-detection-design.md).

## Verification commands

```bash
# After activating .venv-attedel (or the verification environment)
python -m pytest -q
python -m scripts.check_models
python -m scripts.smoke_test
cd frontend && npm run build
```

`smoke_test` starts its own disposable SQLite/server environment, uses two different faces from InsightFace t1, checks enrollment/matching/UNKNOWN, temporal attendance, closure, final statuses and CSV, then stops the server. The recorded run reached PRESENT in **1.39 seconds**. This does not establish accuracy or latency on your webcam.

Optional browser verification (requires ffmpeg and Playwright test tooling):

```bash
python -m pip install playwright
python -m playwright install chromium
python -m scripts.browser_smoke
```

It uses Chromium's fake-camera flags and a real fixture image; it never opens hardware. Results: [HTTP](docs/SMOKE_RESULT.json), [browser](docs/BROWSER_RESULT.json). No lint command is configured. Current full-suite results and warnings are recorded in the final report rather than historical README test counts.

## Configuration and operations

See [.env.example](.env.example). SQLite uses `data/sams_dev.db`; PostgreSQL accepts a SQLAlchemy asyncpg URL. Configure a unique SECRET_KEY and BOOTSTRAP_TOKEN before non-development setup. Enrollment poses are configured by ENROLLMENT_REQUIRED_POSES. Default: FRONT, LEFT_15, RIGHT_15, TILT_UP, TILT_DOWN, ROLL_RIGHT, BACKUP_FRONT. The pose estimator is approximate.

InsightFace model files live in `~/.insightface/models/buffalo_l`. `python -m scripts.check_models` prints real face counts, 512-value embedding shapes and runtime providers, or manual-install instructions. `/health` reports database and AI availability without requiring login. Use **one backend worker**; the recognition gallery and stream state are in memory.

`python -m scripts.seed_demo_data` optionally adds fictional academic records, idempotently, without embeddings or attendance. It is not required for the real workflow. `./start.sh --check` starts both services, verifies HTTP readiness, then stops them. Export BACKEND_PORT/FRONTEND_PORT for alternate ports. Optional `npm run dev:https` supports HTTPS development; actual phone trust/setup remains manual.

Cosine similarity is not probability. Basic liveness does not establish robust spoof resistance. Use the reviewed/manual attendance flow when identity is uncertain.

## API

Canonical prefix: `/api/v1`; `/api` is a compatibility alias. Auth uses bearer tokens with revocable refresh sessions. Staff APIs reject student accounts. Recognition Test is ADMIN/FACULTY; Users is ADMIN.

- Auth: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/setup-status`, `/auth/bootstrap-admin`, `/auth/users`, `/auth/users/{id}/student`, `/auth/my-attendance`.
- Students: `/students`, `/students/{id}`, `/students/{id}/enroll`, `/students/{id}/enroll/check`, `/students/{id}/enroll/status`.
- Academics: `/classes`, `/subjects`, `/classes/{id}/batches`, `/classes/{id}/subjects`, `/classes/{id}/timetable`, `/classes/timetable/entries`.
- Recognition: `/recognition/analyze-frame` (no writes), `/recognition/process` (active-session attendance), `/recognition/config`, `/recognition/thresholds`.
- Anonymous detection: `POST /detection/photo`, multipart field `file`; ADMIN/FACULTY only. Returns frame dimensions, face boxes, detection scores, small-face flags, count and latency.
- Attendance: `/attendance/sessions`, session `/start`, `/close`, `/records`, `/roster`, plus `/attendance/manual`.
- Photo review: `/media-attendance/image/preview`, `/media-attendance/image/confirm`.
- Reports/health: `/reports/analytics`, `/reports/export/csv`, `/health`.

See the generated [API inventory](docs/API_ROUTES.md) or live OpenAPI docs for exact methods and remaining camera/phone routes.

## Repository guide

| Path | Purpose |
| --- | --- |
| `frontend/src/` | Application pages, shared controls, styling and API clients |
| `backend/app/` | FastAPI routes, services, data models and configuration |
| `ai_engine/` | Vision components |
| `scripts/` | Startup, setup and diagnostic utilities |
| `tests/` | Unit and integration checks |
| `docs/` | Setup guides, design decisions and validation reports |

Keep local `.env` files, database backups, student images and runtime logs out of commits. The application data in a local checkout is not supplied by cloning this repository.
