# Local Photo Attendance

A small, laptop-hosted attendance app. Enroll each student with three face photos, take one classroom photo, review recognized students, and save attendance locally.

## Install

Install `uv`, then run:

```bash
./scripts/install.sh
cp .env.example .env
```

Change the teacher PIN and session secret in `.env`, then export them or load them in your shell. The bundled InsightFace pretrained model is intended for non-commercial research/demo use; obtain properly licensed model weights before production use.

## Start on the laptop

```bash
./scripts/start-local.sh
```

Open <http://127.0.0.1:8000>.

## Use a phone camera

Connect the phone and laptop to the same trusted Wi-Fi, run `./scripts/start-phone.sh`, and open the printed address on the phone. The photo inputs open the phone's native camera. Stop the server with `Ctrl+C`.

Data is stored in `./data/attendance.db`. Back up that file while the app is stopped. Enrollment and classroom source images are processed in memory and are not retained.

## AttedDEL college system (FastAPI + React)

This repository also contains the full college system in `backend/` and
`frontend/`. The commands above launch the separate lightweight app; use these
commands for the college system and reviewed multi-photo attendance:

```bash
uv venv .venv-backend --python 3.11
uv pip install --python .venv-backend/bin/python -r requirements.txt
(cd frontend && npm ci)
./scripts/start-full.sh
```

The script defaults to `data/sams_dev.db`, preserving the lightweight app's
`data/attendance.db`. Back up an existing college database before first launch:
its development bootstrap adds the photo scope columns. PostgreSQL deployments
should review the Alembic revision `20261115_photo_scope`; the older migration
chain is legacy code and must be validated against your deployment before use.
The first AI startup may download model files. Configure a unique `SECRET_KEY`
in `.env`. Use the frontend's HTTPS address printed by Vite, including the LAN
address on a phone connected to the same network. The development certificate
may require browser acceptance. Keep this development server on a trusted LAN.

### Photo Attendance

1. Sign in as staff, create a class/session and enroll students with clear face
   samples. For lab sessions, assign each student to the appropriate existing
   batch in Student Management. Unassigned students are excluded from lab capture.
2. Start the session. Open **Photo Attendance** on Live, Attendance session
   details, or Media Attendance.
3. Take or choose 1–3 JPEG/PNG/WebP photos (15 MB each, at most 24 megapixels).
   Shoot from the front at face height, use good lighting, and take 2–3 photos
   to cover different rows. Faces under 35 pixels cannot be used.
4. Preview. Green faces are verified; amber faces require a student selection or
   rejection; red faces cannot be marked. Uncheck unwanted verified selections.
   A student is selected once across the photos.
5. Choose **Confirm & Mark Present** within 15 minutes. The roster refreshes;
   students past the session grace period are recorded LATE. Manual/excused
   records are preserved. Repeating confirmation cannot add duplicate rows.

Preview does not write attendance or retain photos on disk. Confirmation records
an audit entry and a photo digest, not the original photo. Scores are cosine
similarities, not probabilities. Photos cannot establish liveness; teacher review
is required. Real classroom accuracy still needs validation with your own photos.

Photo settings: `PHOTO_DET_SIZE=1280`, `PHOTO_TILE_SIZE=640`,
`PHOTO_TILE_OVERLAP=0.20`, `FACE_RECOGNITION_THRESHOLD=0.58`,
`UNCERTAIN_LOWER_THRESHOLD=0.40`, `PHOTO_MARGIN=0.05`.
Session scheduling currently uses the existing backend UTC convention; confirmation
time determines lateness. Existing legacy API endpoints retain immediate-write contracts for verified
faces only and require ACTIVE sessions; the new teacher UI uses preview/confirm. Video and phone-scanner workflows
remain separate.

### Verification

```bash
.venv-backend/bin/python -m pytest tests/unit/ tests/integration/ -q
(cd frontend && npm run build)
```

Photo tests use mocked embeddings/detections and do not require model weights.
