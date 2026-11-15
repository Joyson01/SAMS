# Simple Local Photo Attendance System

## Intent

Replace the current complex platform with a small local application for a teacher: enroll students, take one classroom photo, recognize enrolled faces, review the result, and save attendance. It should run on a laptop without a subscription or internet connection during normal use; a phone on the same Wi-Fi can open the laptop-hosted interface and use its camera.

## Goals

- Register each student using three clear individual face photos.
- Take or upload one classroom photo and recognize multiple enrolled students.
- Show the recognition result for a quick review, then save attendance.
- Record present and absent students by class, subject, date, and time.
- Keep all student, biometric, and attendance data on the laptop.
- Provide basic attendance history and CSV export.

## Non-goals for the First Version

- Cloud hosting, online synchronization, or multi-campus deployment.
- CCTV, RTSP cameras, continuous video, tracking, or QR phone pairing.
- Timetables, analytics dashboards, student portals, multiple administrative roles, or complex authentication.
- Liveness detection or examination-grade identity verification.
- Saving attendance without a teacher reviewing the proposed result.

## Anti-goals

- Never silently mark a low-confidence face as a known student.
- Never require internet access for normal attendance.
- Do not expose the application outside the local network by default.
- Do not retain classroom or enrollment photos after processing by default.
- Do not preserve features merely because the previous project had them.

## Approaches Considered

1. **Local FastAPI + SQLite + InsightFace (selected):** Strong local recognition, phone-camera access over Wi-Fi, and no recurring cost. The model must be installed once and the laptop must be running.
2. **Browser-only cloud app + Supabase:** Easy public access and no local server, but recognition is more device-dependent, biometric-data handling is more sensitive, and a free database can pause.
3. **Python backend on a free cloud host:** Familiar server-side recognition, but free instances sleep, lack durable local storage, and have tight compute and memory limits for face models.

## Selected Architecture

- **Backend:** FastAPI running on the laptop.
- **Interface:** Responsive server-rendered HTML, CSS, and minimal JavaScript; no separate frontend build system.
- **Database:** Local SQLite database.
- **Recognition:** InsightFace with ONNX Runtime CPU execution for face detection and embeddings.
- **Access:** `localhost` on the laptop; the laptop's private LAN address when phone access is enabled.

This keeps capable group-photo recognition and private data local while removing the operational complexity of the current React/FastAPI platform.

## User Flow

### Home

Show only **Students**, **Take Attendance**, and **Attendance History**, plus face-model readiness.

### Classes and Enrollment

The teacher creates a class such as `TE-B`. For each student, the teacher enters a name and roll number and captures or uploads three individual photos. Each photo must contain exactly one sufficiently clear face. The app stores the resulting numeric embeddings locally and deletes the source photos after successful processing by default.

Duplicate roll numbers within a class are rejected. A new face that is unusually similar to an existing enrolled face triggers a warning instead of being silently accepted.

### Take Attendance

The teacher selects a class, enters or selects a subject, and captures or uploads one classroom photo. The browser sends one compressed image to the local server. The server detects every visible face and compares each embedding only with students enrolled in that class.

### Review and Confirm

The result overlays boxes and names on recognized faces and separately lists proposed-present students, proposed-absent students, and unknown or low-confidence faces. Low-confidence faces are never assigned automatically. The teacher may correct the present/absent checkboxes, then presses **Confirm Attendance** to save one record per enrolled student.

## Recognition Rules

- Compare faces only against the selected class.
- If the same student matches two detected faces, propose only the highest-confidence match; leave the other unknown.
- Treat all recognition results as proposals until teacher confirmation.
- Explain that lighting, distance, occlusion, camera quality, and face size affect accuracy.
- Calibrate thresholds and image-quality limits using representative photos rather than claiming a universal accuracy level.

## Data Model

- `classes`: id, name, created_at
- `students`: id, class_id, roll_number, name, created_at, active
- `face_embeddings`: id, student_id, embedding, quality_score, created_at
- `subjects`: id, name
- `attendance_sessions`: id, class_id, subject_id, captured_at, confirmed_at
- `attendance_records`: id, session_id, student_id, status (`present` or `absent`), confidence, manually_adjusted

Use migrations or a small schema-version mechanism so later changes do not require deleting attendance data.

## Privacy and Safety

- Store data in a dedicated application-data directory on the laptop.
- Delete classroom photos after confirmation by default.
- Delete enrollment source photos after embeddings are generated by default.
- Listen on the local network only when phone-access mode is explicitly started.
- Explain that face embeddings are biometric data and provide complete student deletion, including embeddings.
- Make backups explicit database-file copies; do not add automatic cloud backup.

## Repository Reset

Preserve `.git` and its history. Before replacement, create a safety branch or tag at the current commit. Inspect and account for uncommitted user work. Then remove the current application, generated outputs, local databases, virtual environment, logs, and obsolete documentation, and build only what this design needs.

## Verification

- Automated tests cover database constraints, enrollment validation, matching decisions, duplicate prevention, confirmation, deletion, and CSV export.
- A browser smoke test covers enrollment through attendance confirmation.
- Manual tests include representative individual and classroom photos, unknown people, and partially obscured faces.
- Test phone-camera capture over local Wi-Fi.
- Verify setup and start instructions on the target laptop.

## Builder Decisions

- Exact HTML templating and CSS organization.
- ORM versus direct SQLite access, provided migrations and constraints remain clear.
- Model download/cache mechanism and CPU tuning.
- Recognition and quality thresholds after calibration.
- In-memory versus short-lived temporary-file handling for classroom photos.
