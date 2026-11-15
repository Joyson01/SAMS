# Local Photo Attendance

A small, laptop-hosted attendance app. Enroll each student with three face photos, take one classroom photo, review recognized students, and save attendance locally.

## Development start

```bash
uv sync --extra dev
uv run uvicorn attendance_app.main:app --reload
```

Open <http://127.0.0.1:8000>.
