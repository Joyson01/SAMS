# System Architecture

## Smart Attendance Management System (SAMS)

---

## 1. High-Level Overview

The **Smart Attendance Management System (SAMS)** is an AI-powered biometric platform that automates student attendance tracking using computer vision and deep facial recognition. It provides real-time multi-face identification, live webcam streaming, mobile/IP camera ingestion, recorded video processing, and administrative reporting with duplicate prevention.

```mermaid
flowchart TB
    subgraph ClientLayer["Client Layer (Frontend)"]
        UI["React 18 + Vite + TypeScript Dashboard"]
        WebcamClient["Webcam / MediaDevices Capture"]
        MobileClient["Mobile Camera Browser Portal"]
    end

    subgraph APILayer["API Gateway (FastAPI)"]
        Router["API Router (/api/v1)"]
        AuthMiddleware["JWT Authentication & CORS"]
        WSServer["WebSocket Streaming Gateway"]
    end

    subgraph ServiceLayer["Business Logic Services"]
        AttService["Attendance Service"]
        MediaService["Media Processing Service"]
        CamService["Camera & Stream Service"]
        StudService["Student & Enrollment Service"]
        ClassService["Class & Timetable Service"]
        ReportService["Analytics & Reports Service"]
    end

    subgraph AIEngine["AI Computer Vision Pipeline"]
        SCRFD["Face Detection (SCRFD 10G)"]
        Aligner["2D Affine Alignment (112x112)"]
        ArcFace["Feature Extraction (ArcFace ResNet-50)"]
        Matcher["Cosine Vector Matcher"]
        Quality["Pose & Sharpness Quality Filter"]
        Tracker["Multi-Face ByteTrack & Kalman"]
        Temporal["Sliding-Window Temporal Verifier"]
    end

    subgraph DataLayer["Persistence Layer"]
        DB[(SQLite / PostgreSQL Database)]
        EmbeddingsStore["Local 512-d Vector Index"]
        StaticStorage["Output & Upload Storage"]
    end

    UI --> Router
    WebcamClient --> Router
    MobileClient --> Router
    WebcamClient --> WSServer

    Router --> AuthMiddleware
    AuthMiddleware --> ServiceLayer
    WSServer --> CamService

    AttService --> AIEngine
    MediaService --> AIEngine
    CamService --> AIEngine
    StudService --> AIEngine

    ServiceLayer --> DataLayer
    AIEngine --> EmbeddingsStore

---

## 2. Frontend Architecture

The frontend is a single-page application (SPA) built with **React 18**, **TypeScript**, and **Vite**.

- **Routing & State**: Feature-based page routing with active tab persistence (`AttendancePage`, `LiveDashboardPage`, `MediaAttendancePage`, `FaceEnrollmentPage`, `TimetablePage`, `StudentListPage`, `CameraManagementPage`, `ReportsPage`, `SettingsPage`).
- **Media Ingestion**:
  - Direct webcam access using the HTML5 `navigator.mediaDevices.getUserMedia` API.
  - Video and image file uploading with client-side preview.
  - Interactive bounding-box rendering over video frames and uploaded images.
- **Real-Time Communication**: WebSocket client for live telemetry, FPS tracking, and instant attendance notifications.
- **Styling**: Tailwind CSS with dark theme support and Lucide icon components.

---

## 3. Backend Architecture

The backend is built with **FastAPI** (Python 3.10+) utilizing asynchronous request handling and dependency injection.

- **Routing Layer (`backend/app/api/v1/`)**:
  - `attendance.py`: Real-time photo capture recognition and live attendance recording.
  - `media_attendance.py`: Multi-face image analysis and asynchronous video lecture processing.
  - `recognition.py`: Raw face detection, quality analysis, and recognition threshold configuration.
  - `students.py`: Student profile CRUD, face sample upload, and embedding management.
  - `subjects.py` & `classes.py`: Academic departments, courses, sections, and weekly timetable schedules.
  - `cameras.py`: USB webcam, mobile phone IP camera, and RTSP stream registration and health diagnostics.
  - `reports.py`: Attendance aggregations, student punctuality metrics, and CSV/PDF data exports.
  - `stream.py`: WebSocket live video stream processing and client frame broadcasting.
- **Service Layer (`backend/app/services/`)**: Encapsulates business logic, session lifecycle management, and thread-safe camera capture workers.
- **Database Access (`backend/app/database/`)**: Asynchronous SQLAlchemy 2.0 sessions with SQLite (`aiosqlite`) for zero-configuration local development and PostgreSQL (`asyncpg`) for production.

---

## 4. AI Recognition Engine (`ai_engine/`)

The computer vision subsystem is built on **InsightFace (`buffalo_l`)**, **OpenCV**, and **ONNX Runtime**.

```
Input Frame (RGB/BGR)
        ↓
1. SCRFD Face Detector (Confidence >= 0.60, 5-point facial landmarks)
        ↓
2. Quality & Pose Validation (Sharpness >= 50, Yaw/Pitch/Roll <= 35°)
        ↓
3. 2D Similarity Transform Alignment (112x112 canonical face crop)
        ↓
4. ArcFace ResNet-50 Embedding Extraction (512-dimensional vector)
        ↓
5. L2 Normalization (Unit vector ||v||_2 = 1.0)
        ↓
6. Cosine Similarity Matching (Dot product against cached gallery embeddings)
        ↓
7. Temporal Consensus & Multi-Object Tracking (ByteTrack across video frames)
        ↓
8. Classification: KNOWN (>= 0.65) | UNCERTAIN (0.40 - 0.64) | UNKNOWN (< 0.40)
```

---

## 5. Database Layer & Duplicate Prevention

### Entities
- `students`: Core student demographic and academic metadata.
- `face_profiles`: 512-dimensional mathematical embeddings and quality scores.
- `subjects`: Academic course definitions, departments, and semesters.
- `classes` & `batches`: Class divisions and laboratory practical batches.
- `timetable_entries`: Weekly scheduled class hours mapped to subjects and rooms.
- `attendance_sessions`: Active and scheduled lecture sessions.
- `attendance_records`: Individual attendance events with confidence scores and timestamps.
- `cameras`: Registered webcam, IP camera, and RTSP stream configurations.

### Multi-Tier Duplicate Prevention
1. **In-Frame Deduplication**: Rejects secondary detections of the same student within a single photograph.
2. **Application State Check**: Verifies if a student is already marked `PRESENT` before creating new records.
3. **Database Constraint**: Enforced at the relational level:
   ```sql
   CONSTRAINT uq_session_student_attendance UNIQUE (session_id, student_id)
   ```

---

## 6. Camera & Media Ingestion

- **Webcam**: Accessed via HTML5 MediaDevices in browser and processed frame-by-frame via WebSocket or REST API.
- **Mobile IP Camera**: Compatible with standard IP webcam applications broadcasting MJPEG over HTTP (`http://YOUR_MOBILE_IP:PORT/video`).
- **RTSP CCTV**: Handled by background threaded workers using OpenCV `VideoCapture` with reconnection retry logic (`rtsp://YOUR_CAMERA_IP:554/stream`).
- **Media Upload**: Supports JPEG/PNG group photographs and MP4/AVI/MKV video files with configurable frame-skip intervals.
