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
