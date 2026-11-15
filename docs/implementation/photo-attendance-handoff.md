# Photo Attendance implementation handoff

Implemented on `codex/photo-review` in the FastAPI/React college system.

## Use

Run `./scripts/start-full.sh` from the repository root. Open the HTTPS frontend address printed by Vite; a phone must be on the same trusted network. Sign in as staff, enroll students, assign lab batches if applicable, start a session, and open Photo Attendance. Choose 1–3 photos, preview, review amber identities, uncheck unwanted green matches, then confirm. Red/unknown faces cannot be marked. See README for installation and limits.

## Verification

- Complete repository suite: `.venv-backend/bin/python -m pytest -q` — 173 passed, 3 existing warnings.
- Backend unit/integration suite: `.venv-backend/bin/python -m pytest tests/unit/ tests/integration/ -q` — 165 passed, 3 existing warnings.
- Frontend: `cd frontend && npm run build` — passed, zero TypeScript errors.
- New Python modules/tests: Black check and flake8 (`--max-line-length=88 --extend-ignore=E203`) passed. Legacy files were formatted in changed regions, not globally reformatted/linted.
- `git diff --check`, Python compilation and shell syntax check passed.
- Independent implementation review performed; fixes cover scope preservation, class/batch validation, batch-aware counts and closure, upload stream limits and safe legacy photo API writes.

The existing legacy API fixture now starts its session and persists its face profile in the configured database; in-memory global enrollment no longer authorizes photo marking. Concurrency, unknown/protected records, absence recovery, invalid evidence, batch scope and migration backfills have regression tests.

## Decisions and limitations

- Selected full FastAPI/React stack under the user's delegated choice; lightweight app remains separate.
- Snapshot session batch at creation/start and backfill existing sessions; unresolved batch metadata fails closed.
- Lateness uses confirmation time and the existing UTC scheduling convention. A long review can produce LATE.
- Legacy photo APIs still write immediately, but only verified eligible matches; the teacher UI requires review/confirmation. Video/phone scanner behavior remains separate.
- Session-list counts now use per-session eligibility lookups; this favors correct batch accounting but may need query optimization at large scale.
- Existing historical Alembic revision 39ffa3306d5f fails on fresh SQLite before the new revision. The new photo migration and idempotent backfill were tested separately; PostgreSQL deployment and the full historical upgrade chain are not verified. Development bootstrap adds required columns and snapshots.
- No real classroom accuracy measurement, smartphone/browser walkthrough or production deployment was performed. Frontend validation is the TypeScript/Vite build. Test recognition uses mock embeddings where practical and existing sample fixtures.
- Existing InsightFace pretrained model licensing restrictions still apply (see original README).
- No push or deployment performed. Keep the local branch for review.

## Changed files

- `.gitignore`
- `README.md`
- `ai_engine/detection/photo.py`
- `ai_engine/recognition/photo_matcher.py`
- `backend/alembic/versions/20261115_photo_scope.py`
- `backend/app/api/v1/attendance.py`
- `backend/app/api/v1/media_attendance.py`
- `backend/app/api/v1/photo_attendance.py`
- `backend/app/api/v1/router.py`
- `backend/app/core/config.py`
- `backend/app/database/photo_scope.py`
- `backend/app/database/session.py`
- `backend/app/models/entities.py`
- `backend/app/schemas/media_attendance.py`
- `backend/app/schemas/student.py`
- `backend/app/services/attendance_service.py`
- `backend/app/services/photo_attendance_service.py`
- `backend/app/services/student_service.py`
- `docs/superpowers/plans/2026-11-15-photo-attendance.md`
- `docs/superpowers/specs/2026-11-15-photo-attendance-design.md`
- `frontend/package-lock.json`
- `frontend/src/components/PhotoAttendancePanel.tsx`
- `frontend/src/components/StudentBatchSelect.tsx`
- `frontend/src/features/attendance/AttendancePage.tsx`
- `frontend/src/features/live/LiveDashboardPage.tsx`
- `frontend/src/features/media/MediaAttendancePage.tsx`
- `frontend/src/features/students/StudentListPage.tsx`
- `frontend/src/types/student.ts`
- `scripts/start-full.sh`
- `tests/integration/test_media_attendance_api.py`
- `tests/integration/test_photo_preview_confirm.py`
- `tests/unit/test_photo_detection.py`
- `tests/unit/test_photo_matcher.py`
- `tests/unit/test_photo_scope_migration.py`
