# AttedDEL execution ledger

Spec: docs/REQUEST.md. Plan: docs/superpowers/plans/2026-11-15-attedel.md.

- Phase 0 complete: fresh Python 3.11 dependency install, missing legacy dependencies fixed, 173 baseline tests passed; npm install/build passed; real buffalo_l/t1 model check passed on CPU. Audit saved.
- Phase 1 complete: auth/setup/user management/student linking/UI/session expiry; 179 full tests passed and two further edge tests passed (included in next full run). Build passed.
- Phase 2 complete: batch CRUD/mapping, idempotent academic-only seeder; 183 tests/build passed.
- Phase 3 complete: server pose/quality checks, identity conflict, pose replacement, automatic SQL persistence/gallery sync, shared camera widget and guided page; 184 tests/build passed. Real image enrollment passed.
- Phase 4 complete: analyze-frame read-only and recognition UI; 186 tests/build passed.
- Phase 5 complete: laptop attendance, close rejection/cleanup, authenticated advanced previews; initial failure was old test's nonexistent session, corrected to a real active session. 187 tests/build passed.
- Phase 6 complete: existing photo review retained and verified with real image preview/confirm/idempotency; 188 tests/build passed.
- Phase 7 complete: real user identity/logout/health, no fake settings, search/pagination and timetable editor, mapping re-save fix; 189 tests/build passed.
- Phase 8 complete: cross-platform standard-library launcher; Linux clean source snapshot (no .env, venv, node_modules) passed --check with cached InsightFace models; ports released. 191 tests/build passed, plus production default credential regression (3 startup tests passed).
- Phase 9 complete: real-image HTTP and Chromium fake-camera flows implemented and exercised. Final browser check includes switching-student stale-frame regression. Final full suite: 193 passed, 5 warnings; frontend build passed. A concurrent smoke latency check exceeded 3 seconds; isolated rerun result is recorded in FINAL_REPORT.md.
- Phase 10 complete: README, API inventory, manual QA, troubleshooting and full file/command report written.
- Independent review: reproduced/fixed gallery snapshot identity race and stale enrollment capture; follow-up review found no remaining actionable issue in those two fixes.
- Physical seven-pose webcam, Windows/macOS, phone/RTSP, PostgreSQL and CUDA checks remain explicitly manual.

All test data is isolated. One launcher verification ran once against the configured local database and performed normal additive schema initialization; no demo/test records were inserted there. Other launcher checks and smoke runs used disposable databases. Never reset the user's DB.
Logs are /tmp/attedel-*.log; copy command results into durable final docs.
