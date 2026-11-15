# Baseline audit — 2026-11-15

Existing checkout has uncommitted user changes; preserved. System Python 3.14 is outside pyproject support; fresh Python 3.11 environment created with uv.

- `uv pip install --python .venv-verify/bin/python -r requirements.txt`: passed.
- `.venv-verify/bin/python -m pytest -q`: collection failed in tests/test_app_flow.py, tests/test_auth.py and tests/test_health.py because `itsdangerous` was missing. Legacy template app also requires Jinja2.
- `cd frontend && npm install && npm run build`: passed (1757 modules); no lint command configured.
- POST /api/v1/auth/register exists. No registration page and no authApi.register export. Public elevated roles returned 403; requested behavior is STUDENT regardless of supplied role.
- Single-flight Axios refresh exists, but terminal expiry does not return the UI to login.
- No bootstrap-admin, users management, enroll/check or analyze-frame route at baseline.
- Enrollment accepts client pose labels without validation; enroll status is ENROLLED after a single profile.
- Startup model failure is unhandled. Health only reports database/system, not models.
- Photo preview/confirm already exists, as do academic CRUD APIs, attendance, reports and stream isolation; these remain subject to testing.
- README test counts are historical and cannot establish current test coverage; replace with actual final run results.
