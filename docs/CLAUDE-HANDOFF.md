# AttedDEL project handoff for Claude

AttedDEL is a college attendance management system. Its GitHub repository is **SAMS**, and current work is published on **`joyson`**. Students use the portal to view personal attendance, request corrections, and enroll or test a face. Staff manage academic records, run and review attendance sessions, and export reports.

## Start here

- Read the [README](../README.md) for the current workflows, technical architecture, model behavior, and limitations.
- Run `./start.sh` from the repository root on Linux or macOS. Windows users can run `start.bat`. The usual development ports are 5173 for the frontend and 8000 for the API. Use `FRONTEND_PORT` and `BACKEND_PORT` to override them. FastAPI serves its OpenAPI UI at `/api/v1/docs`.
- Check [installation](INSTALLATION.md), [manual QA](MANUAL_QA.md), and [troubleshooting](TROUBLESHOOTING.md) for local setup. The app initializes the schema at backend startup.
- A clean clone starts with its own database. Local rosters, credentials, biometric templates, model weights, and private configuration are supplied separately. Keep them out of commits.

## Where the implementation lives

| Area | Entry point |
| --- | --- |
| Frontend routes and role-dependent views | [App.tsx](../frontend/src/App.tsx) |
| Shared sign-in | [AuthPage.tsx](../frontend/src/components/auth/AuthPage.tsx) and [auth.py](../backend/app/api/v1/auth.py) |
| Student profile, filters, and target calculator | [UsersPage.tsx](../frontend/src/features/users/UsersPage.tsx) |
| Student face capture and correction forms | [StudentRequests.tsx](../frontend/src/features/users/StudentRequests.tsx) and [student_portal.py](../backend/app/api/v1/student_portal.py) |
| Staff enrollment and removal | [FaceEnrollmentPage.tsx](../frontend/src/features/enrollment/FaceEnrollmentPage.tsx), [students.py](../backend/app/api/v1/students.py), and [enrollment_service.py](../backend/app/services/enrollment_service.py) |
| Attendance records and session transitions | [attendance_service.py](../backend/app/services/attendance_service.py) |
| DB schema and startup | [entities.py](../backend/app/models/entities.py) and [session.py](../backend/app/database/session.py) |
| Detection, alignment, embeddings, and matching | [ai_engine](../ai_engine/) and [recognition_service.py](../backend/app/services/recognition_service.py) |

## Workflows and constraints

- **Authentication.** The shared form signs in staff and students. APIs distinguish account roles using revocable sessions. The student portal resolves the linked student from the authenticated account. Student-controlled requests must never select a different student's ID.
- **Attendance.** Classes and timetables organize schedules. An attendance session captures a real event. Each student has at most one attendance record in a session. Reports summarize records and export CSV. Staff can run live attendance, pair a phone as a camera, upload classroom media for review, or mark attendance manually.
- **Corrections.** A student requests a new status on a record they own. An administrator approves or rejects it in Users. Approval uses the audited manual override path.
- **Face enrollment.** Student auto-capture waits for a stable valid pose, saves it, and advances. The server owns pose checks, quality checks, and embedding extraction. The first scan relies on account authentication. Later scans must match an existing template. Staff can enroll students and administrators can clear biometric profiles. Runtime gallery state is refreshed after a change.
- **Face matching.** The student check compares a front-facing photo only against their own templates. The staff recognition test and anonymous detection are separate diagnostics. Anonymous detection returns face boxes and counts. It has no student identity or attendance write path.
- **Biometric security.** A successful match is a similarity decision, not proof of liveness. Predictable demo passwords are unsuitable for a network-accessible portal with first-time self-enrollment. Avoid adding raw photos, embedding arrays, rosters, credentials, or tokens to fixtures, logs, or commits.

## Verify changes

Run these commands with the backend development environment active:

```bash
python -m pytest -q tests/integration/test_student_portal_requests.py
python -m pytest -q
python -m scripts.check_models
python -m scripts.smoke_test
cd frontend && npm run build
```

Use a disposable database or fictional records for destructive tests. A passing simulated-camera or mocked-embedding test covers application behavior. Physical capture quality and recognition accuracy require testing with the intended camera and classroom conditions.
