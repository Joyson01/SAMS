# SAMS Showcase Demonstration Script

This document details the recommended workflow for conducting a professional demonstration or project defense of the **Smart Attendance Management System (SAMS)**.

---

## 🎬 10-Minute Presentation Workflow

### 1. Introduction & Architecture (Minute 0–2)
- Open **Dashboard** at `http://localhost:5173`.
- Highlight key statistics:
  - Total Enrolled Students
  - Active Courses & Subjects
  - Today's Scheduled Attendance Sessions
  - System Health & AI Engine Connectivity status.

### 2. Student & Academic Management (Minute 2–4)
- Navigate to **Students** (`/students`):
  - Show student profile management, department, class, roll numbers.
- Navigate to **Academic & Courses** (`/subjects`):
  - Show registered subjects, department mappings, and semesters.
- Navigate to **Weekly Timetable** (`/timetable`):
  - Show weekly schedule matrix with color-coded subject blocks and lab batches.

### 3. Student Face Biometric Enrollment (Minute 4–5)
- Navigate to **Enrollment** (`/enrollment`):
  - Select a demo student (e.g. `DEMO001 - Aarav Patel`).
  - Demonstrate real-time face detection with landmark overlay.
  - Capture 3-5 facial samples across angles.
  - Click **Complete Enrollment** and observe instant embedding extraction and database synchronization.

### 4. Attendance Session Setup (Minute 5–6)
- Navigate to **Attendance** (`/attendance`):
  - Select or create an attendance session (e.g. `CSE-4A: Artificial Intelligence & Machine Learning`).
  - Set the attendance mode to **AI Face Recognition**.

### 5. Multi-Source Attendance Verification (Minute 6–8)

#### A. Static Image Attendance (`/media`)
- Upload a classroom group photograph or single student capture.
- Click **Analyze Image Attendance**.
- Show:
  - Fast processing latency (<100ms).
  - Color-coded bounding boxes:
    - 🟢 **Green**: Recognized student marked PRESENT.
    - 🔵 **Blue**: Student already marked present (duplicate prevention).
    - 🟠 **Orange**: Low quality / blurry face warning.
    - ⚪ **Gray**: Unenrolled / Unknown person.
  - Breakdown table with confidence percentages.

#### B. Recorded Video Attendance (`/media`)
- Upload a classroom lecture clip.
- Demonstrate frame extraction, multi-frame accumulation voting, and final attendance summary.

#### C. Live Webcam Attendance (`/live`)
- Start the live webcam stream.
- Demonstrate multi-face real-time tracking, temporal consensus, and instantaneous attendance marking on the active session.

### 6. Reports, Audit Logs & Analytics (Minute 8–10)
- Navigate to **Reports** (`/reports`):
  - View session attendance percentage bar charts and student punctuality metrics.
  - Export attendance CSV/PDF summary.
- Navigate to **Settings** (`/settings`):
  - Show configurable recognition thresholds, liveness thresholds, and system diagnostics.

---

## 🎯 Key Talking Points for Evaluators

1. **Privacy-by-Design**: No raw biometric photos are stored on public servers; 512-dimensional normalized mathematical vectors are used locally.
2. **Duplicate Prevention**: Multi-layer protection (in-frame deduplication + application check + database unique constraint `uq_session_student_attendance`).
3. **Hardware Agnostic**: Fully functional on standard laptop CPUs (`CPUExecutionProvider`) with optional GPU acceleration.
4. **Resilient Architecture**: Asynchronous FastAPI backend + React 18 frontend + modular OpenCV / InsightFace computer vision pipeline.
