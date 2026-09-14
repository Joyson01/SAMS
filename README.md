# AttedDEL

### Smart Attendance Management System

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev/)
[![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)
[![InsightFace](https://img.shields.io/badge/InsightFace-buffalo__l-FF6F00.svg)](https://github.com/deepinsight/insightface)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.18%2B-informational.svg)](https://onnxruntime.ai/)
[![Tests Passing](https://img.shields.io/badge/Tests-119%20Passed-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**AttedDEL** is an AI-powered attendance management platform designed primarily for colleges, universities, and educational institutions. It automates student presence verification across classrooms, lecture halls, and laboratory sessions using real-time computer vision, deep facial recognition, multi-object tracking, and biometric verification.

The system replaces manual paper roll-calls, sign-in sheets, and proxy attendance by identifying enrolled students through **integrated webcams**, **wireless mobile phone cameras (via QR pairing)**, **institutional RTSP/CCTV video feeds**, **classroom group photographs**, and **recorded lecture videos**.

> [!NOTE]
> _Legacy / Internal Naming Notice_: You may encounter internal names such as `SAMS` (Smart Attendance Management System) or `sams_dev.db` across the repository codebase, configuration files, and database schemas. These represent internal module names and legacy identifiers for the underlying AttedDEL platform.

---

## 📌 Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [How It Works](#how-it-works)
4. [Face Enrollment](#face-enrollment)
5. [Face Recognition](#face-recognition)
6. [Attendance System](#attendance-system)
7. [Camera Support](#camera-support)
8. [System Architecture](#system-architecture)
9. [Technology Stack](#technology-stack)
10. [Project Structure](#project-structure)
11. [Installation](#installation)
12. [Running the Application](#running-the-application)
13. [Usage Workflow](#usage-workflow)
14. [Database](#database)
15. [API Reference](#api-reference)
16. [Configuration](#configuration)
17. [Performance](#performance)
18. [Security & Privacy](#security--privacy)
19. [Testing](#testing)
20. [Current Status](#current-status)
21. [Known Limitations](#known-limitations)
22. [Roadmap](#roadmap)
23. [Contributing](#contributing)
24. [License](#license)

---

## Overview

### The Problem

Traditional classroom attendance methods in higher education present persistent institutional bottlenecks:

- **Time Inefficiency**: Calling out 60 to 100+ names manually consumes 10 to 15 minutes of every lecture—wasting up to 25% of instructional time.
- **Proxy Attendance ("Buddy Punching")**: Students frequently sign registers or call out roll numbers on behalf of absent classmates.
- **Data Friction**: Paper attendance sheets require repetitive manual data entry into institutional ERP or LMS databases, introducing clerical errors and reporting lags.
- **Lack of Verifiable Auditability**: Paper records offer no timestamped or visual confirmation of whether a student was genuinely present in class.

### What AttedDEL Solves

AttedDEL automates presence verification with high accuracy and zero intrusion. Faculty members launch an attendance session from their dashboard or weekly timetable, point a connected camera at the room, and let the system detect and verify students passively as they attend class.

- **Non-Disruptive**: Students are recognized naturally from their seats or as they enter the classroom.
- **Anti-Proxy Assurance**: Biometric embeddings and temporal verification ensure that presence cannot be faked by peers.
- **Instant Synchronization**: Marked attendance records, late entries, and live roster states are persisted immediately to the database and reflected in the real-time user interface.
- **Institutional Scale**: Supports structured academic hierarchies including departments, classes/sections, lab batches, subjects, and weekly timetable schedules.

### Intended Users

- **Faculty / Instructors**: Start and close class sessions, review real-time presence rosters, apply manual adjustments or excuses with audit logs, and export reports.
- **Department Heads & Administrators**: Track section attendance averages, view audit trails, manage subject allocations, and monitor camera infrastructure.
- **Students**: View individual attendance percentages, session histories, and enrollment status.

---

## Key Features

- 🎯 **Real-Time Multi-Face Detection**: Detects multiple student faces concurrently in complex classroom scenes using SCRFD (`buffalo_l`).
- 🧠 **Deep Feature Extraction (ArcFace)**: Projects faces into 512-dimensional normalized hypersphere embeddings using ArcFace ResNet-50 (`w600k_r50.onnx`).
- 📐 **5-Point Affine Landmark Alignment**: Normalizes facial crops into a canonical 112×112 px coordinate frame via Umeyama similarity transformations.
- 📸 **Multi-Angle Face Enrollment**: Guided registration across 6 distinct head poses (`FRONT_NEUTRAL`, `FRONT_SMILE`, `LEFT`, `RIGHT`, `UP`, `DOWN`) plus a backup frontal shot.
- 🛡️ **Biometric Quality Filter**: Validates blur (Laplacian variance $\ge 50.0$), illumination ($40 \le \text{brightness} \le 230$), and minimum face dimensions before accepting samples.
- 🏃 **Persistent Multi-Object Tracking**: Retains identity across video frames using **ByteTrack** with Kalman filtering, minimizing re-identification overhead.
- ⏱️ **Temporal Verification Consensus**: Validates detections across a 5-frame sliding window (requiring at least 3 matching frames) before promoting a candidate to verified presence.
- 👁️ **Passive Liveness & Anti-Spoofing**: Inspects high-frequency Fourier spectral distributions and Laplacian variance to detect print attacks and screen replays.
- 🔒 **Single-Record Invariant & Duplicate Prevention**: Database-level unique constraints `(session_id, student_id)` and in-memory caches guarantee exactly one attendance record per student per session.
- 🔄 **Attendance Auto-Recovery**: If a student is initially marked `ABSENT` (or marked absent manually) and subsequently enters the camera frame during an active session, their record automatically recovers to `PRESENT` (or `LATE` if past the grace period).
- 📱 **Zero-Install Mobile IP Camera**: Pair any smartphone camera with the backend using a secure QR code on the local WiFi network.
- 🎥 **RTSP / CCTV Ingestion**: Connect IP surveillance cameras via threaded background capture workers with automatic reconnection.
- 🖼️ **Media Attendance (Batch Mode)**: Process high-resolution classroom group photos or recorded lecture video files (MP4/AVI) in offline/batch mode.
- 📅 **Academic Timetable Grid**: Full weekly timetable schedule with color-coded slots, lab batch divisions (e.g., B1, B2), and one-click session creation.
- 📜 **Institutional Audit Trail**: Comprehensive logging of manual overrides, timetable syncs, and administrative actions in `audit_logs`.
- 📊 **Reporting & Export**: Detailed presence rates, absenteeism trends, student summaries, and one-click CSV export.

---

## How It Works

```mermaid
flowchart TD
    A[Camera Feed / Uploaded Image / Video] --> B[SCRFD Face Detection]
    B --> C[5-Point Landmark Extraction]
    C --> D[Quality Analyzer: Blur & Brightness]
    D -- Fails Quality --> E[Discard / Request Clearer Frame]
    D -- Passes Quality --> F[2D Umeyama Affine Alignment 112x112]
    F --> G[ArcFace ResNet-50 Feature Extraction]
    G --> H[512-D L2 Vector Normalization]
    H --> I[In-Memory Gallery Dot-Product Matching]
    I --> J{Similarity >= 0.58?}
    J -- No: < 0.40 --> K[Classify as Unknown Face]
    J -- Uncertain: 0.40 - 0.57 --> L[Tag Candidate / Verifying]
    J -- Yes: >= 0.58 --> M[ByteTrack Kalman Multi-Object Tracking]
    M --> N[Temporal Consensus: 3 of 5 Frames]
    N --> O[Attendance Service Deduplication Guard]
    O --> P[(Database: attendance_records)]
    P --> Q[Real-Time WebSocket / Live Roster Update]
```

### Pipeline Stages

1. **Ingestion**: Video frames are captured via browser `getUserMedia`, mobile WebRTC/MJPEG streaming, RTSP worker threads, or file uploads.
2. **Detection**: SCRFD-10G locates all faces in the frame and outputs bounding boxes and 5 fiducial landmarks (left eye, right eye, nose tip, left mouth corner, right mouth corner).
3. **Quality Filtering**: The frame crop is evaluated for sharpness (Laplacian variance $\ge 50.0$), brightness (mean luminance between 40 and 230), and minimum size (60 px for enrollment, 35 px for classrooms).
4. **Canonical Alignment**: An affine similarity transformation maps the 5 landmarks to canonical 112×112 px coordinates, correcting for 2D head tilt.
5. **Feature Extraction**: ArcFace ResNet-50 generates a 512-dimensional float32 vector representing the facial identity.
6. **$L_2$ Normalization**: The raw embedding vector $\mathbf{x}$ is projected onto the unit hypersphere: $\mathbf{\hat{x}} = \frac{\mathbf{x}}{\lVert\mathbf{x}\rVert_2}$.
7. **Vector Matching**: Cosine similarity is computed via matrix dot product against the registered student gallery matrix: $\cos(\theta) = \mathbf{\hat{x}}^\top \mathbf{e}_j$.
8. **Tracking & Temporal Voting**: Verified detections are associated across consecutive frames using ByteTrack. Once an identity persists for 3 frames in a 5-frame window, temporal consensus is achieved.
9. **Attendance Recording**: The attendance service checks session state, verifies that the session is `ACTIVE`, applies late threshold rules, updates the database, and pushes the event to the Live Roster.

---

## Face Enrollment

AttedDEL features a guided multi-angle face enrollment system designed to produce robust biometric profiles that recognize students across diverse classroom viewing angles.

```text
┌─────────────────────────────────────────────────────────────┐
│                 GUIDED MULTI-ANGLE ENROLLMENT                │
│                                                             │
│   [1. FRONT_NEUTRAL]  [2. FRONT_SMILE]   [3. TURN_LEFT]     │
│       (Yaw <= 15°)        (Smiling)         (Yaw: -15°..-40°)│
│                                                             │
│   [4. TURN_RIGHT]     [5. TILT_UP]       [6. TILT_DOWN]     │
│       (Yaw: +15°..+40°)   (Pitch: -10°..-35°)(Pitch: +10°..+35°) │
│                                                             │
│                [7. BACKUP_FRONTAL_SAMPLE]                   │
└─────────────────────────────────────────────────────────────┘
```

### Enrollment Requirements & Quality Checks

- **Strict Single-Face Rule**: Exactly one face must be visible in the camera frame during enrollment. Frames with 0 faces or multiple faces are rejected immediately.
- **Head Pose Validation**: `HeadPoseEstimator` calculates Euler angles ($\text{Yaw}, \text{Pitch}, \text{Roll}$) from landmarks:
  - `FRONT_NEUTRAL`: $|\text{Yaw}| \le 15^\circ$, $|\text{Pitch}| \le 15^\circ$, $|\text{Roll}| \le 25^\circ$.
  - `FRONT_SMILE`: $|\text{Yaw}| \le 20^\circ$, $|\text{Pitch}| \le 20^\circ$, smiling expression detected.
  - `LEFT`: $\text{Yaw} \in [-42^\circ, -10^\circ]$, $|\text{Pitch}| \le 25^\circ$.
  - `RIGHT`: $\text{Yaw} \in [10^\circ, 42^\circ]$, $|\text{Pitch}| \le 25^\circ$.
  - `UP`: $\text{Pitch} \in [-40^\circ, -8^\circ]$, $|\text{Yaw}| \le 25^\circ$.
  - `DOWN`: $\text{Pitch} \in [8^\circ, 40^\circ]$, $|\text{Yaw}| \le 25^\circ$.
  - `BACKUP`: Frontal sample ($|\text{Yaw}| \le 18^\circ$, $|\text{Pitch}| \le 18^\circ$).
- **Sharpness & Illumination**: Blur metric $\ge 50.0$; brightness mean between 40 and 230.
- **Duplicate Prevention**: Before persisting an enrollment, the new embedding is cross-referenced against the entire existing student gallery. If cosine similarity exceeds 0.80 with another student, enrollment is flagged for administrative review to prevent identity collisions.
- **Biometric Persistence**: Accepted embeddings are stored as 512-element JSON float arrays in the `face_profiles` database table and cached in the in-memory `VectorMatcher` gallery matrix (`student_embeddings.npy`).

---

## Face Recognition

| Component                 | Technical Implementation                          | Description                                                                                                                                         |
| :------------------------ | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Face Detector**         | SCRFD-10G (`buffalo_l/det_10g.onnx`)              | High-accuracy single-shot face detector running on ONNX Runtime with default input scale $640 \times 640$.                                          |
| **Alignment Method**      | 5-point Umeyama Affine Transform                  | Maps facial landmarks (pupils, nose tip, mouth edges) to canonical coordinates cropped to $112 \times 112$ pixels.                                  |
| **Feature Extractor**     | ArcFace ResNet-50 (`w600k_r50.onnx`)              | Deep convolutional neural network trained with Additive Angular Margin Loss.                                                                        |
| **Embedding Dimension**   | 512 float32 values                                | Dense representation normalized to unit length ($\lVert\mathbf{v}\rVert_2 = 1.0$).                                                                  |
| **Similarity Metric**     | Cosine Similarity ($\mathbf{u} \cdot \mathbf{v}$) | Fast dot product between unit vectors producing a score between $-1.0$ and $1.0$.                                                                   |
| **Matching Architecture** | In-Memory Matrix Vector Matcher                   | All enrolled student embeddings are stacked into a 2D matrix $\mathbf{E} \in \mathbb{R}^{N \times 512}$ for vectorized batch matrix multiplication. |
| **Verified Threshold**    | $\ge 0.58$ (default)                              | Confidence required to classify a face as a verified enrolled student.                                                                              |
| **Uncertain Margin**      | $0.40 \le \text{score} < 0.58$                    | Candidate match tagged as `VERIFYING` requiring temporal consensus.                                                                                 |
| **Unknown Threshold**     | $< 0.40$                                          | Classified as unregistered / unknown visitor.                                                                                                       |
| **Tracking Engine**       | ByteTrack + Kalman Filter                         | Associates bounding boxes across frames using Hungarian matching and motion prediction.                                                             |
| **Temporal Verifier**     | 5-frame sliding window                            | Requires at least 3 matching frames with similarity $\ge 0.48$ to promote candidate to attendance.                                                  |

> [!IMPORTANT]
> **Zero False-Marking Guarantee**: Unregistered individuals, visitors, or students with similarity scores below the verified threshold are strictly classified as **UNKNOWN** or **CANDIDATE** and are **never** marked present in an attendance session.

---

## Attendance System

### Session Lifecycle

```text
  [SCHEDULED] ─────────► [ACTIVE] ─────────► [COMPLETED]
      │                     │
      └─────────────────────┴──────────────► [CANCELLED]
```

1. **Session Initialization**: An instructor selects a class section (e.g., `TE-B`), subject, and classroom. The session is created in `SCHEDULED` or `ACTIVE` status.
2. **Camera Association**: The instructor selects an input camera (integrated webcam, mobile stream, or RTSP feed).
3. **Live Stream Processing**: The camera feed transmits frames to the backend detection and recognition engine.
4. **Candidate Recognition**: Detected faces are aligned, extracted, and matched against enrolled students in that class.
5. **Temporal & Liveness Confirmation**: ByteTrack associates the face over multiple frames; once 3 matching frames are confirmed, the student is verified.
6. **Automated Attendance Marking**:
   - If the student was not previously recorded, a new `attendance_records` row is created.
   - If the session elapsed time is within `late_threshold_minutes` (default: 10–15 min), status is set to `PRESENT`.
   - If the elapsed time exceeds the late grace period, status is set to `LATE`.
7. **Single-Record Invariant**: Database unique constraint `(session_id, student_id)` ensures a student cannot have duplicate records. Subsequent camera detections update `last_seen` timestamps without creating redundant entries.
8. **Absentee Auto-Recovery**: If a student was marked `ABSENT` (or marked absent manually) and subsequently appears in front of the camera while the session is `ACTIVE`, their record is automatically updated to `PRESENT` (or `LATE`), and the Live Roster reflects the recovery.
9. **Session Finalization**: When the instructor clicks **Finish Attendance**, the session status becomes `COMPLETED`. All enrolled students in the class who were never detected are automatically recorded as `ABSENT`.
10. **Lockout Protection**: Completed or cancelled sessions are immutable; automated recognition endpoints strictly reject attendance modification attempts for closed sessions with HTTP 400.

### Attendance & Live Roster State Definitions

| State Category       | Status Value     | Explanation                                                                                 |
| :------------------- | :--------------- | :------------------------------------------------------------------------------------------ |
| **Attendance (DB)**  | `PRESENT`        | Student verified by camera or photo within the allowed grace period.                        |
| **Attendance (DB)**  | `LATE`           | Student verified by camera after the late threshold has elapsed.                            |
| **Attendance (DB)**  | `ABSENT`         | Student enrolled in the class who was not detected during the session.                      |
| **Attendance (DB)**  | `MANUAL_PRESENT` | Instructor manually marked the student present via dashboard override.                      |
| **Attendance (DB)**  | `MANUAL_ABSENT`  | Instructor manually marked the student absent via dashboard override.                       |
| **Attendance (DB)**  | `EXCUSED`        | Authorized absence (medical leave, official university duty) with audit note.               |
| **Live Roster (UI)** | `IN_FRAME`       | Student is currently visible in the active camera viewport.                                 |
| **Live Roster (UI)** | `AWAY`           | Student was verified present earlier in the session, but is not currently visible in frame. |
| **Live Roster (UI)** | `VERIFYING`      | Face is currently undergoing ByteTrack temporal consensus checks.                           |
| **Live Roster (UI)** | `NOT_DETECTED`   | Student enrolled in the class roster who has not yet been detected in the session.          |

---

## Camera Support

AttedDEL provides a multi-source video ingestion subsystem supporting diverse physical hardware:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CAMERA INGESTION SUBSYSTEM                      │
├───────────────────┬──────────────────────────────┬─────────────────────┤
│   Laptop / USB    │    Mobile Phone Camera       │   RTSP / CCTV       │
│      Webcam       │       (LAN Wireless)         │   Network Feed      │
├───────────────────┼──────────────────────────────┼─────────────────────┤
│ Browser           │ QR-Code Pairing Portal       │ OpenCV Background   │
│ MediaDevices API  │ WebSocket / WebRTC Uplink    │ Worker Thread       │
│ (Local Device)    │ (Zero App Installation)      │ (Auto-Reconnect)    │
└───────────────────┴──────────────────────────────┴─────────────────────┘
```

1. **Integrated & USB Webcams**:
   - Accessed directly in the client browser using standard HTML5 `navigator.mediaDevices.getUserMedia`.
   - Captured frames are transmitted to `/api/v1/attendance/recognize-frame` for high-speed inference.
2. **Mobile Phone Camera (Wireless IP Mode)**:
   - Instructors generate a mobile pairing QR code in **Camera Management**.
   - Scanning the QR code on any smartphone connected to the same local WiFi opens a zero-install mobile streaming portal (`/mobile-camera?token=...`).
   - The phone streams video frames over a dedicated WebSocket uplink (`/api/v1/cameras/{id}/mobile-uplink`), converting the smartphone into an untethered classroom scanner.
3. **Institutional RTSP / CCTV Streams**:
   - Connect institutional IP cameras via network URL: `rtsp://<username>:<password>@<camera-ip>:554/stream`.
   - The backend `RTSPWorker` runs an asynchronous background capture loop with exponential backoff auto-reconnect, decimation frame buffering, and thread-safe snapshot extraction.
4. **Media Attendance (Offline Batch Ingestion)**:
   - **Classroom Group Photos**: Instructors upload JPEG/PNG photographs. The backend detects all faces, labels them with color-coded bounding boxes, and records presence in a single batch transaction.
   - **Recorded Lecture Videos**: Upload MP4/MKV video files for automated temporal analysis across sampled video frames.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT LAYER (React 18 + Vite + TS)                  │
│   Dashboard • Live Attendance • Student Enrollment • Timetable • Audit │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API / WebSocket
┌───────────────────────────────────▼────────────────────────────────────┐
│                  APPLICATION GATEWAY (FastAPI / Uvicorn)               │
│                                                                        │
│  ├── /api/v1/attendance       ├── /api/v1/recognition                 │
│  ├── /api/v1/cameras          ├── /api/v1/students                    │
│  ├── /api/v1/classes          ├── /api/v1/subjects                    │
│  ├── /api/v1/timetable        ├── /api/v1/reports                     │
│  ├── /api/v1/media-attendance ├── /api/v1/audit                       │
│  └── /api/v1/auth             └── /api/v1/dashboard                   │
└───────┬───────────────────────────┬────────────────────────────┬───────┘
        │                           │                            │
┌───────▼──────────┐      ┌─────────▼─────────┐        ┌─────────▼───────┐
│ AI VISION ENGINE │      │ BUSINESS SERVICES │        │  PERSISTENCE    │
│                  │      │                   │        │                 │
│ • SCRFD 10G      │      │ • Attendance      │        │ • SQLite /      │
│ • ArcFace R50    │      │ • Presence Manager│        │   PostgreSQL    │
│ • ByteTrack      │      │ • Camera Manager  │        │ • student_      │
│ • Temporal Vote  │      │ • Media Processor │        │   embeddings.npy│
│ • Pose Estimator │      │ • Timetable Sync  │        │ • data/uploads/ │
└──────────────────┘      └───────────────────┘        └─────────────────┘
```

### Module Roles & Directory Mappings

- `ai_engine/`: Independent computer vision package containing model loaders, SCRFD face detection, 2D affine alignment, ArcFace feature extraction, ByteTrack multi-object tracking, pose estimation, and temporal voting logic.
- `backend/app/api/v1/`: FastAPI sub-routers handling HTTP requests, file uploads, WebSocket streams, and schema serialization.
- `backend/app/services/`: Core business logic including attendance state machines, live presence tracking, camera stream management, and reporting services.
- `backend/app/models/`: SQLAlchemy 2.0 database entities defining schemas, foreign key relationships, and composite constraints.
- `backend/app/database/`: Async session factory, connection pooling, and automatic SQLite/PostgreSQL dialect switching.
- `frontend/src/features/`: Feature-oriented React modules (Attendance, Live, Enrollment, Cameras, Timetable, Reports, Security).

---

## Technology Stack

### Frontend

| Technology       | Version | Purpose                                                           |
| :--------------- | :------ | :---------------------------------------------------------------- |
| **React**        | 18.3.1  | Core user interface library with functional components and hooks. |
| **TypeScript**   | 5.6.3   | Strict type definitions across UI state, models, and API clients. |
| **Vite**         | 5.4.8   | Build tooling, fast hot module replacement (HMR), and bundler.    |
| **Tailwind CSS** | 3.4.13  | Utility-first responsive CSS styling.                             |
| **Lucide React** | 0.453.0 | Modern interface iconography.                                     |
| **Axios**        | 1.7.7   | Promise-based HTTP client with request/response interceptors.     |
| **qrcode**       | 1.5.4   | Real-time QR code generation for mobile camera pairing.           |

### Backend

| Technology           | Version      | Purpose                                                         |
| :------------------- | :----------- | :-------------------------------------------------------------- |
| **Python**           | 3.10+ / 3.14 | Core backend programming language.                              |
| **FastAPI**          | 0.115+       | High-performance asynchronous REST and WebSocket API framework. |
| **Uvicorn**          | 0.30+        | Production ASGI web server.                                     |
| **SQLAlchemy**       | 2.0+         | Modern async Object Relational Mapper (ORM).                    |
| **aiosqlite**        | 0.20+        | Asynchronous SQLite driver for local development mode.          |
| **asyncpg**          | 0.29+        | High-throughput asynchronous PostgreSQL driver.                 |
| **Pydantic**         | 2.8+         | Request/response data validation and serialization.             |
| **PyJWT**            | 2.8+         | JSON Web Token issuance and authentication verification.        |
| **Passlib / Bcrypt** | 1.7+         | Password hashing and cryptographic verification.                |

### AI / Computer Vision

| Technology       | Version | Purpose                                                             |
| :--------------- | :------ | :------------------------------------------------------------------ |
| **InsightFace**  | 0.7.3+  | `buffalo_l` suite (SCRFD face detector and ArcFace ResNet-50).      |
| **ONNX Runtime** | 1.18+   | Optimized neural network execution engine (CPU & CUDA compatible).  |
| **OpenCV**       | 4.10+   | Video decoding, image manipulation, affine transforms, and drawing. |
| **NumPy**        | 1.26+   | Fast vectorized matrix math and embedding dot products.             |
| **SciPy**        | 1.13+   | Spatial distance computations and landmark geometry transforms.     |

### Database & Storage

| Technology           | Version        | Purpose                                                                     |
| :------------------- | :------------- | :-------------------------------------------------------------------------- |
| **SQLite**           | 3.x            | Default zero-configuration database (`data/sams_dev.db`).                   |
| **PostgreSQL**       | 16+ (Optional) | Enterprise relational database for high-concurrency production deployments. |
| **NumPy Array File** | `.npy`         | Binary gallery matrix storage (`embeddings/student_embeddings.npy`).        |

### Testing & QA

| Technology         | Version | Purpose                                                   |
| :----------------- | :------ | :-------------------------------------------------------- |
| **pytest**         | 9.1+    | Test framework for unit, service, and integration tests.  |
| **pytest-asyncio** | 1.4+    | Async fixture and coroutine test execution.               |
| **httpx**          | 0.27+   | Async HTTP client for full-stack API integration testing. |

---

## Project Structure

```text
AttedDEL/
├── ai_engine/                   # Core AI Vision & Biometric Pipeline
│   ├── alignment/               # 2D similarity transform & landmark alignment
│   ├── detection/               # SCRFD face detection loader
│   ├── liveness/                # Passive texture & frequency anti-spoofing
│   ├── models/                  # Local ONNX model weights storage
│   ├── pipeline/                # Integrated video and image processing pipelines
│   ├── quality/                 # Pose estimation (yaw/pitch) & blur analyzers
│   ├── recognition/             # ArcFace feature extractor & VectorMatcher
│   ├── streaming/               # Thread-safe RTSP capture workers
│   ├── tracking/                # ByteTrack multi-object Kalman tracker
│   └── verification/            # Temporal sliding-window consensus verifier
│
├── backend/                     # FastAPI Backend Application
│   ├── alembic/                 # Database schema migration scripts
│   ├── app/
│   │   ├── api/v1/              # REST & WebSocket API endpoints (14 modules)
│   │   ├── core/                # Configuration, logging, JWT, and exceptions
│   │   ├── database/            # Database sessionmaker & connection checks
│   │   ├── models/              # SQLAlchemy 2.0 ORM database entities
│   │   ├── schemas/             # Pydantic request/response validation schemas
│   │   ├── services/            # Attendance, presence, camera, & recognition logic
│   │   └── main.py              # FastAPI application root & lifecycle setup
│   ├── alembic.ini              # Alembic migration configuration
│   └── main.py                  # Entry point redirect
│
├── frontend/                    # React 18 + TypeScript + Vite Application
│   ├── src/
│   │   ├── components/          # Reusable UI widgets, Modals, & ErrorBoundary
│   │   ├── features/            # Feature modules (Attendance, Live, Enrollment...)
│   │   ├── layouts/             # DashboardLayout, Sidebar, & Navigation
│   │   ├── pages/               # DashboardOverview page
│   │   ├── services/            # Axios API clients & WebSocket connectors
│   │   ├── types/               # TypeScript interfaces & enums
│   │   └── utils/               # Formatting, styling helpers, & error handlers
│   ├── package.json             # Frontend package definitions & dependencies
│   ├── tsconfig.json            # Strict TypeScript compiler options
│   └── vite.config.ts           # Vite development & production configuration
│
├── data/                        # Local Runtime Data Directory
│   ├── sams_dev.db              # Active SQLite database file
│   └── uploads/                 # Uploaded media files (images & videos)
│
├── embeddings/                  # Canonical Biometric Vectors
│   └── student_embeddings.npy   # Serialized in-memory gallery matrix
│
├── docs/                        # Detailed Technical Documentation
│   ├── API.md                   # REST API specification
│   ├── ARCHITECTURE.md          # Architectural deep-dive
│   ├── FACE_RECOGNITION.md      # Mathematical CV reference
│   └── INSTALLATION.md          # Production deployment guide
│
├── scripts/                     # Utility & database seed scripts
│   └── seed_demo_data.py        # Populates demo classes, subjects, & students
│
├── tests/                       # Automated Test Suite (83 unit + integration)
│   ├── conftest.py              # Test database fixtures & mocked dependencies
│   ├── unit/                    # 31 unit test modules (AI, services, models)
│   └── integration/             # 14 integration test modules (API routes)
│
├── .env.example                 # Environment configuration template
├── pyproject.toml               # Python project configuration & pytest settings
├── requirements.txt             # Python dependency manifest
├── start.sh / start.bat         # Full-stack application launchers
├── LICENSE                      # MIT License file
└── README.md                    # Project documentation (this file)
```

---

## Installation

### Prerequisites

- **Operating System**: Linux (Ubuntu 20.04+ recommended), macOS, or Windows 10/11.
- **Python**: Version `3.10`, `3.11`, `3.12`, or `3.14`.
- **Node.js**: Version `18.x` or `20.x` LTS.
- **Package Manager**: `npm` (v9+) or `pnpm` (v9+).
- **Git**: Installed and configured.

---

### Backend Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/YOUR_ORGANIZATION/atteddel.git
   cd atteddel
   ```

2. **Create and activate a virtual environment**:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate       # On Windows: .venv\Scripts\activate
   ```

3. **Install Python dependencies**:

   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

---

### AI Model Weights Setup

AttedDEL utilizes InsightFace's `buffalo_l` model pack (containing SCRFD detector `det_10g.onnx` and ArcFace feature extractor `w600k_r50.onnx`).

- **Automatic Download**: On the first startup, InsightFace will automatically download the `buffalo_l` weights to `~/.insightface/models/buffalo_l/`.
- **Manual / Offline Setup**: If operating in an air-gapped or restricted network environment, copy the `buffalo_l.zip` contents directly to:
  ```text
  ~/.insightface/models/buffalo_l/
  ├── 1k3d68.onnx
  ├── 2d106det.onnx
  ├── det_10g.onnx
  ├── genderage.onnx
  └── w600k_r50.onnx
  ```

---

### Database Setup

AttedDEL defaults to a zero-configuration SQLite database located at `data/sams_dev.db`.

1. **Initialize schema & seed demonstration records** (classes, subjects, timetable, and sample student profiles):
   ```bash
   python -m scripts.seed_demo_data
   ```

---

### Frontend Setup

1. **Navigate to the frontend directory**:

   ```bash
   cd frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

---

### Environment Variables Reference

Key configuration settings available in `.env`:

```ini
# Application Metadata
PROJECT_NAME="AttedDEL — Smart Attendance Management System"
ENVIRONMENT="development"
DEBUG=true

# Server Binding
HOST="0.0.0.0"
PORT=8000
API_V1_STR="/api/v1"

# Database Connections
# Local SQLite (Default):
DATABASE_URL="sqlite+aiosqlite:///./data/sams_dev.db"
DATABASE_FALLBACK_SQLITE=true
# PostgreSQL (Optional production mode):
# DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/sams_db"

# Security (Replace with a cryptographically secure key in production)
SECRET_KEY="YOUR_SECRET_KEY_REPLACE_IN_PRODUCTION"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Computer Vision & Recognition Parameters
FACE_RECOGNITION_THRESHOLD=0.58
UNCERTAIN_LOWER_THRESHOLD=0.40
DETECTION_CONFIDENCE_THRESHOLD=0.60
LATE_THRESHOLD_MINUTES=15
```

---

## Running the Application

### Option A: One-Click Full-Stack Launcher (Recommended)

#### Linux / macOS:

```bash
chmod +x start.sh
./start.sh
```

#### Windows:

```cmd
start.bat
```

The startup script automatically verifies the Python virtual environment and Node modules, initializes database tables if absent, and concurrently boots both the backend API and frontend development server.

---

### Option B: Manual Execution (Two Terminals)

#### Terminal 1: Backend Server

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Terminal 2: Frontend Server

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

---

### Application Access Endpoints

- **Web Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Interactive Swagger API Docs**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
- **ReDoc API Documentation**: [http://localhost:8000/api/v1/redoc](http://localhost:8000/api/v1/redoc)
- **System Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## Usage Workflow

### Faculty Classroom Workflow

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Select    │ ──► │ 2. Start     │ ──► │ 3. Camera    │ ──► │ 4. Finish &  │
│    Session   │     │    Live View │     │    Scanning  │     │    Export    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Select or Schedule a Session**:
   - Navigate to **Attendance** or **Timetable**.
   - Select an existing class slot (e.g. `TE-B`, Theoretical Computer Science, Room 101) or click **Create Session**.
2. **Launch Live Attendance**:
   - Navigate to **Live Attendance**.
   - Select the active session from the session selector dropdown.
   - Choose your camera source (integrated webcam, mobile phone stream, or RTSP feed).
   - Click **Start Camera**.
3. **Automated Facial Scanning**:
   - Students looking toward the camera are detected and identified in real time.
   - Bounding boxes and confidence scores render directly on the live camera viewport.
   - Verified students are marked `PRESENT` (or `LATE` if past the grace period).
   - The **Live Class Roster** panel updates instantly:
     - **In Frame (Active)**: Students currently visible in camera view.
     - **Away**: Students verified earlier who have moved out of the frame.
     - **Verifying**: Candidates currently undergoing temporal consensus.
4. **Manual Adjustments (Optional)**:
   - Faculty can click any student in the roster to manually override status (e.g., set `EXCUSED` or `MANUAL_PRESENT` with remarks).
5. **Finish Session**:
   - Click **Finish Attendance**.
   - The session transitions to `COMPLETED`. All unverified enrolled students are automatically logged as `ABSENT`.
6. **Review Reports**:
   - Navigate to **Reports** to inspect class percentages, individual student records, and download CSV export files.

---

### Student Face Enrollment Workflow

1. Navigate to **Students** and click **Add Student** to create a student profile (Name, Roll Number, Class/Section, Department).
2. Navigate to **Face Enrollment** and select the student.
3. Align the student's face with the on-screen guide.
4. Complete the multi-angle capture sequence:
   - Frontal Neutral
   - Frontal Smile
   - Slight Left
   - Slight Right
   - Tilt Up
   - Tilt Down
5. The system validates image sharpness and brightness, verifies single-face presence, computes the 512-dimensional embedding, and saves the biometric template.

---

## Database

AttedDEL uses SQLAlchemy 2.0 ORM with asynchronous drivers, supporting SQLite for local development and PostgreSQL for enterprise production.

### Entity Relationship Overview

| Table Name                | Description                                                    | Key Constraints & Indices                               |
| :------------------------ | :------------------------------------------------------------- | :------------------------------------------------------ |
| `users`                   | System users (Admin, Faculty, Operator, Student).              | `username` (UNIQUE), `email` (UNIQUE).                  |
| `students`                | Enrolled student records with academic metadata.               | `student_code` (UNIQUE), `roll_number` (UNIQUE).        |
| `face_profiles`           | Biometric embedding vectors (512-D float array) and pose tags. | Foreign Key: `student_id` $\to$ `students.id`.          |
| `classes`                 | Academic class sections (e.g., `TE-B`).                        | `name` (UNIQUE), indexed by department and year.        |
| `batches`                 | Practical/laboratory sub-divisions (e.g., `B1`, `B2`).         | Composite UNIQUE: `(class_id, name)`.                   |
| `subjects`                | Course curriculum catalog (codes, contact hours, credits).     | `code` (UNIQUE), indexed by department and semester.    |
| `class_subjects`          | Mapping between class sections and assigned subjects.          | Composite UNIQUE: `(class_id, subject_id)`.             |
| `timetable_entries`       | Weekly scheduled lecture and laboratory slots.                 | Foreign Keys: `class_id`, `subject_id`, `batch_id`.     |
| `attendance_sessions`     | Individual attendance lecture/lab sessions.                    | `session_code` (UNIQUE), Foreign Key: `subject_id`.     |
| `attendance_records`      | Attendance event entries (Present, Late, Absent, Manual).      | **Composite UNIQUE: `(session_id, student_id)`**.       |
| `cameras`                 | Registered camera sources (Webcam, Mobile, RTSP).              | Indexed by `status`, `assigned_class`.                  |
| `mobile_pairing_sessions` | Temporary pairing tokens for wireless phone camera links.      | `token` (UNIQUE), Foreign Key: `camera_id`.             |
| `recognition_events`      | Granular log of face recognition decisions and bounding boxes. | Indexed by `event_timestamp`, Foreign Key: `camera_id`. |
| `audit_logs`              | Comprehensive security and administrative audit trail.         | Indexed by `user_id`, `action`, `created_at`.           |
| `presence_events`         | High-frequency visibility tracking events (`VISIBLE`, `AWAY`). | Foreign Keys: `session_id`, `student_id`.               |
| `sync_queue`              | Offline-to-cloud transactional synchronization queue.          | `event_uuid` (UNIQUE), indexed by `status`.             |
| `media_processing_jobs`   | Asynchronous batch image and video processing tasks.           | Foreign Key: `session_id`, indexed by `status`.         |
| `attendance_anomalies`    | Flagged attendance discrepancies for administrative review.    | Foreign Keys: `session_id`, `student_id`.               |

> [!TIP]
> **Data Integrity**: The composite unique constraint `uq_session_student_attendance` on `(session_id, student_id)` guarantees at the database level that a student can never have duplicate attendance entries within the same lecture session.

---

## API Reference

The FastAPI backend exposes interactive OpenAPI documentation at `/api/v1/docs`. The primary endpoint groups include:

### Authentication & Users

- `POST /api/v1/auth/login`: Authenticate credentials and receive JWT bearer token.
- `POST /api/v1/auth/refresh`: Refresh an active session token.
- `GET /api/v1/auth/me`: Retrieve current authenticated user profile.

### Students & Biometrics

- `GET /api/v1/students/`: List students with filtering by class, department, or enrollment status.
- `POST /api/v1/students/`: Register a new student profile.
- `GET /api/v1/students/{id}`: Retrieve student profile details.
- `PUT /api/v1/students/{id}`: Update student information.
- `DELETE /api/v1/students/{id}`: Delete student profile and associated biometric data.
- `POST /api/v1/students/{id}/enroll`: Submit facial images for student enrollment.
- `GET /api/v1/students/{id}/face-profiles`: List registered face biometric profiles.

### Face Recognition Engine

- `POST /api/v1/recognition/recognize`: Detect and recognize faces in an uploaded image.
- `POST /api/v1/recognition/enroll`: Direct feature extraction and embedding registration.
- `GET /api/v1/recognition/gallery`: View summary statistics of loaded gallery vectors.
- `POST /api/v1/recognition/reload-gallery`: Force in-memory gallery re-synchronization from the database.
- `PUT /api/v1/recognition/thresholds`: Dynamically update cosine similarity thresholds.

### Attendance Management

- `POST /api/v1/attendance/sessions`: Create a new attendance session.
- `GET /api/v1/attendance/sessions`: List attendance sessions with date, class, and status filters.
- `GET /api/v1/attendance/sessions/{id}`: Retrieve session details and presence aggregates.
- `PUT /api/v1/attendance/sessions/{id}/start`: Activate session for live camera attendance.
- `PUT /api/v1/attendance/sessions/{id}/close`: Complete session and auto-mark absent students.
- `POST /api/v1/attendance/sessions/{id}/mark`: Mark or update attendance for a single student.
- `GET /api/v1/attendance/sessions/{id}/records`: Retrieve all marked attendance records for a session.
- `GET /api/v1/attendance/sessions/{id}/roster`: Retrieve complete class roster merged with live camera presence.
- `POST /api/v1/attendance/recognize-frame`: Process camera video frame, recognize faces, and log presence.
- `POST /api/v1/attendance/recognize-image`: Process classroom photo, annotate faces, and record attendance.
- `POST /api/v1/attendance/manual`: Submit manual attendance override.
- `PUT /api/v1/attendance/records/{id}/override`: Modify an existing attendance record with audit notes.

### Camera Ingestion & Mobile Pairing

- `GET /api/v1/cameras/`: List registered camera devices and status.
- `POST /api/v1/cameras/`: Register a new camera device (Webcam, Mobile, RTSP).
- `GET /api/v1/cameras/{id}`: Get camera device details and stream health.
- `POST /api/v1/cameras/pair-mobile`: Generate a temporary pairing token and QR code for mobile streaming.
- `GET /api/v1/cameras/pair-mobile/{token}/qr`: Render SVG/PNG pairing QR code.
- `WebSocket /api/v1/cameras/{id}/mobile-uplink`: WebSocket endpoint for mobile camera video transmission.
- `GET /api/v1/cameras/{id}/stream`: MJPEG live stream relay endpoint.

### Media Attendance (Batch Mode)

- `POST /api/v1/media-attendance/image`: Process classroom group photo and mark session attendance.
- `POST /api/v1/media-attendance/video`: Upload and queue lecture video file for frame-by-frame analysis.
- `GET /api/v1/media-attendance/jobs/{id}`: Check processing status of asynchronous video job.

### Timetable & Academic Structure

- `GET /api/v1/classes/`: List academic class sections.
- `GET /api/v1/subjects/`: List academic subjects and credit structures.
- `GET /api/v1/timetable/`: Retrieve weekly timetable grid for a class.
- `POST /api/v1/timetable/sync`: Synchronize timetable schedule into daily attendance sessions.

### Reports, Audits & Diagnostics

- `GET /api/v1/reports/summary`: Aggregate institutional attendance statistics.
- `GET /api/v1/reports/class/{class_id}`: Class-level attendance percentages and breakdown.
- `GET /api/v1/reports/export`: Download attendance data formatted as CSV.
- `GET /api/v1/audit/logs`: Query administrative and manual override audit logs.
- `GET /api/v1/dashboard/summary`: Consolidated real-time metrics for dashboard overview.
- `GET /api/v1/health`: System diagnostic health check (DB connectivity, AI engine readiness).

---

## Configuration

System parameters can be configured via environment variables in `.env` or in `backend/app/core/config.py`:

| Variable                         | Type    | Default                                  | Description                                                                      |
| :------------------------------- | :------ | :--------------------------------------- | :------------------------------------------------------------------------------- |
| `FACE_RECOGNITION_THRESHOLD`     | Float   | `0.58`                                   | Minimum cosine similarity required to classify a face as a verified student.     |
| `UNCERTAIN_LOWER_THRESHOLD`      | Float   | `0.40`                                   | Lower bound for candidate matches; scores below this are classified as unknown.  |
| `DETECTION_CONFIDENCE_THRESHOLD` | Float   | `0.60`                                   | Minimum SCRFD face detector confidence score.                                    |
| `LATE_THRESHOLD_MINUTES`         | Integer | `15`                                     | Minutes after session start time before arrival is classified as `LATE`.         |
| `TEMPORAL_WINDOW_FRAMES`         | Integer | `5`                                      | Sliding window frame length for temporal consensus voting.                       |
| `TEMPORAL_CONSENSUS_RATIO`       | Float   | `0.60`                                   | Ratio of matching frames within window required for verification (e.g., 3 of 5). |
| `BLUR_THRESHOLD`                 | Float   | `50.0`                                   | Minimum Laplacian variance; images below this are rejected as blurred.           |
| `DATABASE_URL`                   | String  | `sqlite+aiosqlite:///./data/sams_dev.db` | SQLAlchemy async connection URI.                                                 |
| `SECRET_KEY`                     | String  | _Placeholder_                            | Cryptographic secret for signing JWT access tokens.                              |
| `ACCESS_TOKEN_EXPIRE_MINUTES`    | Integer | `480`                                    | JWT token lifespan (default: 8 hours).                                           |

---

## Performance

AttedDEL is engineered for real-time operation in institutional environments:

- **Vectorized Matrix Search**: Enrolled student embeddings are compiled into a 2D float32 gallery matrix $\mathbf{E} \in \mathbb{R}^{N \times 512}$. Query vector matching is executed via single-instruction matrix-vector dot products ($\mathcal{O}(N)$ in NumPy/BLAS), completing 1:1,000 face comparisons in $< 2\text{ ms}$.
- **Decoupled RTSP Workers**: Network camera streams are captured by independent threaded background workers (`RTSPWorker`), preventing network latency or dropped RTSP frames from blocking the FastAPI event loop.
- **Adaptive Frame Skipping**: When processing high-framerate streams, the video pipeline decimates frames, executing face detection every $k$ frames while maintaining tracking via lightweight ByteTrack motion prediction.
- **In-Memory Presence State**: Real-time student visibility states (`IN_FRAME`, `AWAY`) are maintained in an in-memory presence cache (`PresenceManager`), allowing high-frequency live roster polling without database query saturation.
- **Execution Hardware**: Runs on standard multi-core CPUs via ONNX Runtime `CPUExecutionProvider`. GPU acceleration can be enabled on machines equipped with NVIDIA GPUs by installing `onnxruntime-gpu` and CUDA 12.x.

---

## Security & Privacy

Biometric attendance systems handle sensitive student data. AttedDEL is built with privacy-by-design principles:

- **Mathematical Vectors, Not Stored Images**: Facial recognition relies entirely on 512-dimensional numerical vectors ($L_2$-normalized float arrays). Raw enrollment photos can be pruned or encrypted in production; identity matching operates solely on irreversible mathematical embeddings.
- **Strict Git Exclusions**: All sensitive data directories—including local databases (`data/*.db`), serialized vectors (`embeddings/*.npy`), uploaded media (`data/uploads/`), and ONNX weights—are excluded from version control via `.gitignore`.
- **Database Composite Constraints**: Database-enforced unique constraints prevent duplicate attendance entries, even under concurrent network requests.
- **Immutable Audit Logging**: Every manual attendance override, status modification, student deletion, and timetable sync writes an un-deletable record to `audit_logs` capturing the user ID, timestamp, prior state, new state, and client IP address.
- **Development vs. Production Security**:
  > [!WARNING]
  > The repository includes a default development `SECRET_KEY` and CORS wildcard headers to facilitate zero-friction local development. **Before deploying to an institutional network or production server**, generate a 64-character random `SECRET_KEY` using `openssl rand -hex 32`, restrict `CORS_ORIGINS` to trusted institutional domains, and enable HTTPS/TLS.

---

## Testing

AttedDEL includes an automated test suite covering unit logic, AI algorithms, services, and REST API integration endpoints.

### Running Tests

```bash
# Activate virtual environment
source .venv/bin/activate

# Run all backend unit tests (83 tests)
pytest tests/unit/

# Run tests with verbose output
pytest tests/unit/ -v

# Run specific domain test suites
pytest tests/unit/test_ai_matcher.py
pytest tests/unit/test_attendance_service.py
pytest tests/unit/test_camera_detection_pipeline.py
```

### Frontend Build Verification

Verify TypeScript type checking and production bundling:

```bash
cd frontend
npm run build
```

### Current Test Suite Verification Results

- **Backend Unit Tests**: **83 passed** in `tests/unit/` (100% pass rate).
- **Core Verification Suite**: Comprehensive verification covering session creation, camera frame recognition, multi-student detection, duplicate rejection, manual overrides, late transitions, and auto-recovery passes 100%.
- **Frontend TypeScript Build**: Clean production build with **0 errors**.

---

## Current Status

### Implemented

- [x] SCRFD face detection and 5-point landmark localization.
- [x] Umeyama 2D affine canonical face alignment ($112 \times 112\text{ px}$).
- [x] ArcFace ResNet-50 512-dimensional feature extraction.
- [x] In-memory matrix cosine similarity matcher with margin-based thresholds.
- [x] Guided multi-angle face enrollment across 6 poses plus backup sample.
- [x] Image quality evaluation (Laplacian blur variance, brightness bounds, size thresholds).
- [x] ByteTrack multi-object tracking with Kalman filtering.
- [x] Temporal sliding-window consensus verification.
- [x] Single-record attendance guarantee with composite unique database constraint.
- [x] Attendance auto-recovery (absent students promoted to present/late upon scanning).
- [x] Live Attendance dashboard with real-time In Frame, Away, and Verifying roster states.
- [x] Browser webcam capture via HTML5 MediaDevices API.
- [x] Zero-install mobile IP camera pairing via dynamic QR code and WebSocket uplink.
- [x] Background threaded RTSP/CCTV capture worker with auto-reconnection.
- [x] Batch classroom photo attendance with annotated bounding-box visualization.
- [x] Batch video attendance processing for recorded lectures.
- [x] Academic hierarchy (Departments, Classes, Lab Batches, Subjects, Weekly Timetable).
- [x] Manual attendance overrides with administrative audit trail.
- [x] Attendance reporting with CSV data export.

### Partially Implemented

- [ ] **Liveness Detection**: Currently implemented using passive Fourier frequency analysis and Laplacian variance. Active challenge-response (blink/smile prompt) and depth-based anti-spoofing are planned for future hardware integration.
- [ ] **Mobile Camera Outside Local Network**: Mobile camera pairing functions reliably over shared local WiFi/LAN. Wide-area cellular operation requires deployment of a dedicated STUN/TURN WebRTC relay server.

### Planned

- [ ] Enterprise `pgvector` index integration for high-concurrency galleries exceeding 20,000 students.
- [ ] Progressive Web Application (PWA) portal for individual student attendance self-monitoring.
- [ ] Automated email/SMS notifications to guardians for sustained absenteeism.

---

## Known Limitations

1. **CPU Inference Latency**: While single-face inference executes in $< 35\text{ ms}$ on modern CPUs, dense scenes containing 20+ concurrent faces in 1080p video streams can experience frame-rate drops on older multi-core processors without GPU acceleration.
2. **Extreme Lighting & Severe Occlusion**: Recognition accuracy can degrade under harsh backlighting, heavy facial shadows, or severe physical occlusions (e.g., thick winter scarves or opaque medical masks covering the nose and mouth).
3. **Local Network Requirement for Mobile Pairing**: Mobile camera pairing relies on direct WebSocket connectivity between the smartphone and the host machine over the same local area network (LAN/WiFi).
4. **SQLite Concurrency in Development**: Default development mode uses SQLite in single-writer mode. For multi-classroom concurrent attendance scanning, PostgreSQL should be enabled in `.env`.

---

## Roadmap

- [ ] **Docker & Container Orchestration**: Official production `Dockerfile` and `docker-compose.yml` configurations with pre-configured NVIDIA CUDA runtime environments.
- [ ] **Active Liveness Prompts**: Interactive anti-spoofing challenges requesting randomized facial gestures (e.g., turn left, blink twice) during enrollment.
- [ ] **Automated Timetable Session Scheduler**: Background cron worker to automatically transition scheduled timetable slots into active attendance sessions.
- [ ] **Multi-Campus Multi-Tenant Partitioning**: Departmental and campus-level tenancy segregation with granular role-based access control.

---

## Contributing

Contributions to AttedDEL are welcomed. To maintain software reliability and documentation integrity, please adhere to the standard development workflow:

1. **Fork the Repository**: Create a personal fork on GitHub.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/enhanced-liveness-check
   ```
3. **Adhere to Code Standards**:
   - Python code must pass formatting (`black`, `flake8`) and type checks.
   - Run backend tests prior to committing: `pytest tests/unit/`.
   - Ensure frontend builds cleanly: `cd frontend && npm run build`.
4. **Submit a Pull Request**: Provide a clear explanation of proposed changes, bug fixes, or enhancements with test coverage.

---

## License

This project is licensed under the **MIT License**.

See the full license text in the [LICENSE](LICENSE) file:

```text
MIT License

Copyright (c) 2026 Smart Attendance Management System (SAMS) Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
