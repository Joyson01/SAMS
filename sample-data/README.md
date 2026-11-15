# SAMS Sample & Demo Data Guide

This directory documents the structure and guidelines for test, demo, and sample datasets in the **Smart Attendance Management System (SAMS)**.

---

## 🔒 Privacy & Biometric Data Policy

> **Important**: This repository does not commit real personal photographs, student biometrics, or facial embedding vectors (`.npy`, `.onnx` weights).

In compliance with privacy regulations (GDPR, FERPA, DPDP Act), all biometric enrollment must be executed locally by the administrator during deployment or onboarding.

---

## 🚀 Seeding the Showcase Demo Dataset

To populate your local development environment with fictional demo records (classes, courses, fictional student names, sample timetable, and a live session), run:

```bash
# Using virtual environment
python -m scripts.seed_demo_data
```

### What gets seeded:
1. **5 Academic Subjects**:
   - `CS401`: Computer Networks
   - `CS402`: Artificial Intelligence & Machine Learning
   - `CS403`: Database Management Systems
   - `CS404`: Computer Vision & Biometrics
   - `CS405`: Software Engineering & Agile Methodologies

2. **2 Class Sections**:
   - `CSE-4A` (Computer Science, Semester 4, Section A)
   - `CSE-4B` (Computer Science, Semester 4, Section B)

3. **5 Fictional Students**:
   - `DEMO001`: Aarav Patel (`CSE-4A`, Roll: `CS2026-001`)
   - `DEMO002`: Diya Iyer (`CSE-4A`, Roll: `CS2026-002`)
   - `DEMO003`: Kabir Verma (`CSE-4A`, Roll: `CS2026-003`)
   - `DEMO004`: Ananya Pandey (`CSE-4B`, Roll: `CS2026-004`)
   - `DEMO005`: Rohan Mehta (`CSE-4B`, Roll: `CS2026-005`)

4. **2 Cameras**:
   - `Room 204 Main Webcam` (Webcam / USB camera)
   - `Auditorium CCTV RTSP` (RTSP / Network camera placeholder)

5. **Timetable Schedule & Demo Session**:
   - Monday 09:00 - 10:00 CSE-4A session ready for live demonstration.

---

## 📸 Local Student Face Enrollment

To test face recognition with your own face or demo subject:
1. Start backend (`./scripts/start.sh` or `uvicorn backend.app.main:app --port 8000`).
2. Start frontend (`cd frontend && npm run dev`).
3. Open `http://localhost:5173` in your browser.
4. Navigate to **Face Enrollment** in the sidebar.
5. Select a student (e.g. `DEMO001 - Aarav Patel`).
6. Capture 3–5 face angles via webcam or upload photos.
7. Click **Complete Enrollment**.

The face embeddings are stored securely in your local database and `embeddings/student_embeddings.npy` (automatically ignored by Git).
