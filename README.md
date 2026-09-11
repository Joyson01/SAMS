# SAMS — Smart Attendance Management System

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://www.typescriptlang.org/)
[![InsightFace](https://img.shields.io/badge/InsightFace-buffalo__l-FF6F00.svg)](https://github.com/deepinsight/insightface)
[![Tests](https://img.shields.io/badge/Tests-102%20Passing-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**SAMS** is an AI-powered biometric attendance management platform that automates student presence verification across universities, colleges, and schools using computer vision and deep facial recognition.

It eliminates manual roll-calling, paper sign-in sheets, and proxy attendance by identifying students in real time from **live webcams**, **wireless mobile phone cameras**, **CCTV RTSP streams**, **high-resolution classroom group photographs**, and **recorded lecture videos**.

---

## 📌 Table of Contents

- [What is SAMS?](#what-is-sams)
  - [The Problem It Solves](#the-problem-it-solves)
  - [How It Works](#how-it-works)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [AI Recognition Pipeline](#ai-recognition-pipeline)
- [Camera & Input Ingestion Sources](#camera--input-ingestion-sources)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
  - [One-Click Launcher (Recommended)](#one-click-launcher-recommended)
  - [Manual Setup (Step-by-Step)](#manual-setup-step-by-step)
- [Project Structure](#project-structure)
- [Usage Workflow](#usage-workflow)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Privacy, Ethics & Security](#privacy-ethics--security)
- [Technical Documentation Index](#technical-documentation-index)
- [License](#license)

---

## 💡 What is SAMS?

### The Problem It Solves

Traditional classroom attendance has major drawbacks:
1. **Time-Consuming**: Calling out 60+ student names consumes 10–15 minutes of every lecture (up to 20% of instructional time).
2. **Proxy Attendance / Buddy Punching**: Students sign sheets or answer roll calls for absent peers.
3. **Administrative Overhead**: Paper registers must be manually entered into ERP databases, leading to typos, misplaced records, and delays.
4. **Lack of Verifiable Auditing**: No visual or timestamped evidence exists to prove whether a student was genuinely in class.

### How It Works

**SAMS** automates the entire presence verification lifecycle:

```mermaid
flowchart LR
    A[Camera Feed / Photo / Video] --> B[SCRFD Face Detection]
    B --> C[2D Affine 112x112 Alignment]
    C --> D[ArcFace ResNet-50 Extraction]
    D --> E[512-D L2 Vector Normalization]
    E --> F[Matrix Cosine Similarity vs Gallery]
    F --> G{Threshold >= 0.65?}
    G -- Yes --> H[ByteTrack & Temporal Consensus]
    G -- No --> I[Candidate / Unknown Flag]
    H --> J[Session Deduplication Guard]
    J --> K[(Database Attendance Record)]
    K --> L[Live Dashboard & Reports]
```

1. **Detection**: SCRFD detects all visible faces simultaneously, even at extreme angles, lighting variations, and with partial occlusions.
2. **Alignment & Normalization**: Faces are normalized to a canonical 112×112 px 2D coordinate system using 5-point facial landmarks.
3. **Deep Feature Extraction**: ArcFace ResNet-50 extracts an invariant 512-dimensional mathematical embedding vector per face.
4. **Vector Matching**: Fast dot-product cosine matching compares queries against the student embedding gallery in milliseconds.
5. **Temporal Voting & Deduplication**: Multi-frame consensus voting verifies persistent identity across video frames, while session-level database unique constraints prevent duplicate attendance entries.

---

## ✨ Key Features

- 🎯 **Multi-Face Detection**: Single-shot multi-face localization powered by SCRFD (`buffalo_l`).
- 🧠 **Deep ArcFace Recognition**: 512-dimensional facial embedding extraction with cosine similarity matching.
- 💻 **Live Webcam Attendance**: Browser-based real-time video stream processing with bounding box overlays.
- 📱 **Mobile IP Camera Integration**: Turn any smartphone into an IP camera using QR-code pairing over local WiFi.
- 🎥 **RTSP / CCTV Ingestion**: Connect institutional RTSP security cameras with background threaded auto-reconnection workers.
- 📸 **Photo-Based Batch Attendance**: Upload group photos with bounding-box annotations and instant multi-student presence logging.
- 🎬 **Video Lecture Attendance**: Upload recorded lectures with configurable frame sampling and temporal consensus voting.
- 🏃 **ByteTrack & Kalman Filter Tracking**: Track student faces persistently across video frames to eliminate false positives.
- 🛡️ **Zero Duplicate Attendance**: Multi-layer deduplication (in-frame non-maximum suppression, application presence states, and database-level unique constraints `(session_id, student_id)`).
- 📅 **Academic Timetable Integration**: Complete weekly timetable grid with color-coded subject slots and lab batch allocations.
- 🔒 **Security Audit Logging**: Full audit trail recording manual overrides, timetable sync events, and administrative actions.
- 📊 **Analytics & Reports**: Class presence percentages, individual student histories, and one-click CSV export.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 18 + Vite)                      │
│  Dashboard • Live Stream • Media Attendance • Timetable • Audit Logs   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / WebSocket
┌───────────────────────────────────▼────────────────────────────────────┐
│                    API GATEWAY (FastAPI / Uvicorn)                     │
│  /attendance • /recognition • /cameras • /media • /timetable • /audit  │
└───────┬───────────────────────────┬────────────────────────────┬───────┘
        │                           │                            │
┌───────▼──────────┐      ┌─────────▼─────────┐        ┌─────────▼───────┐
│ AI VISION ENGINE │      │ BUSINESS SERVICES │        │  DATA & STORAGE │
│ • SCRFD 10G      │      │ • Attendance      │        │ • SQLite/Postgres
│ • ArcFace R50    │      │ • Media Process   │        │ • student_      │
│ • ByteTrack      │      │ • Timetable Grid  │        │   embeddings.npy│
│ • Temporal Vote  │      │ • RTSP Streamer   │        │ • data/uploads/ │
└──────────────────┘      └───────────────────┘        └─────────────────┘
```

For the comprehensive architectural specification and database entity diagrams, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🔬 AI Recognition Pipeline

| Stage | Technology | Function | Output |
|---|---|---|---|
| **1. Ingestion** | OpenCV / WebRTC | Video stream frame capture & EXIF auto-rotation | $H \times W \times 3$ BGR Array |
| **2. Detection** | SCRFD-10G (`buffalo_l`) | Single-shot multi-face detection & 5 landmarks | Bounding boxes $[x_1, y_1, x_2, y_2]$ |
| **3. Quality Filter** | LapLace & Pose Analyzer | Rejects blurred images or extreme yaw/pitch (>35°) | Quality Pass / Reject |
| **4. Alignment** | 2D Affine Similarity | Transforms face to canonical standard orientation | $112 \times 112 \times 3$ normalized face |
| **5. Extraction** | ArcFace (ResNet-50) | Deep feature representation | 512-dimensional vector $\mathbf{x}$ |
| **6. Normalization** | L2 Normalization | Unit hypersphere projection ($\lVert\mathbf{v}\rVert_2 = 1.0$) | $\mathbf{\hat{x}} = \frac{\mathbf{x}}{\lVert\mathbf{x}\rVert_2}$ |
| **7. Matching** | Cosine Dot Product | Dot product vs gallery embeddings: $\cos(\theta) = \mathbf{\hat{x}}^\top \mathbf{e}_j$ | Similarity score $[0.0, 1.0]$ |
| **8. Decision** | Dual Thresholds | $\ge 0.65$: Verified Known • $0.40 - 0.64$: Candidate • $< 0.40$: Unknown | Student Identity / Unknown |
| **9. Tracking** | ByteTrack + Kalman | Associative bounding-box tracking across video frames | Persistent Track ID |
| **10. Consensus** | Temporal Sliding Window | Sliding window vote (e.g. 3 of 5 frames confirmed) | Final Attendance Trigger |

For full mathematical formulations, cosine distance metrics, and anti-spoofing details, see [docs/FACE_RECOGNITION.md](docs/FACE_RECOGNITION.md).

---

## 📹 Camera & Input Ingestion Sources

1. **Laptop / USB Webcam**:
   - Navigate to **Live Attendance** in the web dashboard.
   - Click **Start Camera** and grant browser camera permissions.
2. **Mobile Phone Camera (Wireless IP Mode)**:
   - In **Cameras**, generate a Mobile Pairing QR Code.
   - Scan with any smartphone on the same WiFi network to open the zero-install mobile streaming portal.
3. **Institutional RTSP CCTV**:
   - In **Cameras**, add a network camera URL: `rtsp://<camera-ip>:554/stream`.
   - The backend worker connects with background reconnection recovery.
4. **Classroom Group Photo Upload**:
   - In **Media Attendance**, select **Image Attendance**, choose an academic session, and upload a photo (JPEG/PNG).
   - The system detects all faces, labels them with color-coded bounding boxes, and records presence in one click.
5. **Recorded Lecture Video Upload**:
   - In **Media Attendance**, select **Video Attendance**, choose a session, and upload an MP4/AVI/MKV recording.
   - Multi-frame temporal voting analyzes appearances across time to produce attendance reports.

---

## 🛠️ Technology Stack

| Layer | Component | Version | Notes |
|---|---|---|---|
| **Frontend** | React | 18.3 | Modular component architecture |
| | TypeScript | 5.6 | Strict type-safety across all UI modules |
| | Vite | 5.4 | Fast HMR dev server & Rollup production bundler |
| | Tailwind CSS | 3.4 | Modern responsive user interface |
| | Lucide React | 0.453 | Iconography |
| | Axios | 1.7 | HTTP client with automatic error wrapping |
| **Backend** | FastAPI | 0.115+ | High-performance asynchronous REST & WebSocket framework |
| | Python | 3.10+ / 3.14 | Core language |
| | Uvicorn | 0.30+ | ASGI production server |
| | SQLAlchemy | 2.0+ | Modern async ORM |
| | Pydantic | 2.8+ | Fast schema validation & serialization |
| | PyJWT / Bcrypt | — | Security tokens and password hashing |
| **AI / CV** | InsightFace | 0.7.3+ | SCRFD 10G detector & ArcFace feature extractor |
| | ONNX Runtime | 1.18+ | Fast CPU and GPU model inference |
| | OpenCV | 4.10+ | Computer vision and matrix manipulation |
| | NumPy / SciPy | — | Numerical vector calculations, Kalman filtering |
| **Database** | SQLite | 3.x | Default zero-config local dev (`data/sams_dev.db`) |
| | PostgreSQL | 16+ | Enterprise production mode with `pgvector` |

---

## 🚀 Quick Start

### One-Click Launcher (Recommended)

#### Linux / macOS:
```bash
./start.sh
```

#### Windows:
```cmd
start.bat
```

The launcher will automatically verify Python and Node.js, create `.venv`, install dependencies, initialize the database, and launch both backend and frontend servers.

---

### Manual Setup (Step-by-Step)

#### 1. Clone & Configure Environment
```bash
git clone https://github.com/YOUR_USERNAME/sams.git
cd sams
cp .env.example .env
```

#### 2. Backend Setup
```bash
# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate       # On Windows: .venv\Scripts\activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Seed demonstration dataset (fictional students, subjects, timetable)
python -m scripts.seed_demo_data

# Start FastAPI server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend URLs:
- **Interactive Swagger Docs**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
- **ReDoc Documentation**: [http://localhost:8000/api/v1/redoc](http://localhost:8000/api/v1/redoc)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

#### 3. Frontend Setup
```bash
# In a second terminal window:
cd frontend
pnpm install                    # Or: npm install
pnpm run dev                    # Or: npm run dev
```

Open your browser at **[http://localhost:5173](http://localhost:5173)**.

For Docker Compose container orchestration, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## 📁 Project Structure

```text
SAMS/
├── ai_engine/                   # AI Computer Vision Pipeline
│   ├── alignment/               # 2D similarity transform & landmark alignment
│   ├── detection/               # SCRFD face detector
│   ├── liveness/                # Texture & anti-spoofing checker
│   ├── models/                  # Local ONNX model weights directory
│   ├── pipeline/                # Face & video processing pipelines
│   ├── quality/                 # Pose estimation & blur analysis
│   ├── recognition/             # ArcFace feature extractor & vector matcher
│   ├── streaming/               # Thread-safe RTSP capture worker
│   ├── tracking/                # ByteTrack & Kalman Filter tracker
│   └── verification/            # Temporal sliding-window verifier
│
├── backend/                     # FastAPI Backend Application
│   ├── alembic/                 # Database migration scripts
│   ├── app/
│   │   ├── api/v1/              # REST API endpoints (14 sub-routers)
│   │   ├── core/                # App configuration, security & logging
│   │   ├── database/            # Async sessionmaker & SQLite adapter
│   │   ├── models/              # SQLAlchemy 2.0 ORM models
│   │   ├── schemas/             # Pydantic validation schemas
│   │   ├── services/            # Business logic & face recognition services
│   │   └── main.py              # FastAPI application entry point
│   ├── alembic.ini              # Alembic configuration
│   └── main.py                  # Root backend entry point
│
├── frontend/                    # React 18 + Vite + TypeScript Frontend
│   ├── src/
│   │   ├── components/          # Reusable UI components & ErrorBoundary
│   │   ├── features/            # Feature pages (Attendance, Live, Media, Security)
│   │   ├── layouts/             # Dashboard layout & sidebar navigation
│   │   ├── pages/               # DashboardOverview
│   │   ├── services/            # Axios API client modules
│   │   ├── types/               # TypeScript interfaces
│   │   ├── utils/               # Error handlers & cn utility
│   │   └── App.tsx              # Main application component & routes
│   ├── package.json             # Frontend dependencies & scripts
│   ├── pnpm-lock.yaml           # Frontend lockfile
│   └── vite.config.ts           # Vite bundler configuration
│
├── docs/                        # Complete Technical Documentation
│   ├── API.md                   # REST & WebSocket API specification
│   ├── ARCHITECTURE.md          # Detailed system architecture
│   ├── DEMO_GUIDE.md            # Presentation & demonstration script
│   ├── FACE_RECOGNITION.md      # AI pipeline mathematical reference
│   └── INSTALLATION.md          # Installation & deployment guide
│
├── data/                        # Runtime Database & Upload Storage
│   ├── sams_dev.db              # Active SQLite development database
│   └── uploads/                 # Uploaded media (images & videos)
│
├── embeddings/                  # Canonical Face Embeddings Storage
│   ├── README.md                # Embeddings documentation
│   └── student_embeddings.npy   # Canonical 512-d biometric vectors
│
├── sample-data/                 # Sample dataset guidelines & privacy policy
│   └── README.md
├── scripts/                     # Seeders & lifecycle management scripts
├── tests/                       # Automated test suite (102 tests + fixtures)
├── docker-compose.yml           # Root Docker container orchestration
├── pyproject.toml               # Python project & test configuration
├── requirements.txt             # Python dependencies
├── start.sh / start.bat         # Full-stack application launchers
└── README.md                    # Project overview & documentation index
```

---

## 🔄 Usage Workflow

1. **Add Students**: In **Students**, create student profiles with department, class section, and roll number.
2. **Face Enrollment**: In **Face Enrollment**, select a student, capture 3–5 face angles via webcam or mobile upload, and save. Embeddings are extracted and saved automatically.
3. **Schedule / Open Session**: In **Attendance**, select a subject, class, and room to open a live attendance session (or generate from **Weekly Timetable**).
4. **Choose Visual Input**:
   - Open **Live Attendance** for webcam recognition.
   - Connect an external mobile phone or RTSP feed in **Cameras**.
   - Upload classroom group photos or lecture videos in **Media Attendance**.
5. **Automatic Verification**: As students appear in the video feed or image, their faces are detected, matched against the gallery, deduplicated, and marked **PRESENT**.
6. **Review & Export**: View attendance counts, percentages, and detection confidence scores in **Reports**, and export CSV summaries.

---

## 🧪 Testing & Quality Assurance

The codebase includes an extensive automated test suite covering unit, integration, and end-to-end flows:

```bash
# Run the complete test suite (102 tests)
pytest

# Run with verbose output
pytest -v

# Run specific test suites
pytest tests/unit/
pytest tests/integration/
```

Verify frontend TypeScript compilation and production bundling:
```bash
cd frontend
npm run build
```

---

## 🔒 Privacy, Ethics & Security

- **Mathematical Vectors, Not Photographs**: SAMS extracts and saves non-reversible 512-dimensional numerical vectors. Raw photographs do not need to be stored in production.
- **Git Exclusions**: Biometric vector files (`*.npy`, `*.onnx`) and database files (`*.db`, `*.sqlite`) are strictly excluded from version control via `.gitignore`.
- **Duplicate Protection**: Database composite unique constraint `(session_id, student_id)` ensures a student can never be double-marked in the same class session.
- **Institutional Compliance**: Designed to assist universities in complying with student privacy guidelines (GDPR, FERPA, and local data protection regulations).

---

## 📚 Technical Documentation Index

- 📐 [System Architecture Specification](docs/ARCHITECTURE.md)
- 🚀 [Installation & Deployment Guide](docs/INSTALLATION.md)
- 🔌 [REST & WebSocket API Reference](docs/API.md)
- 🧠 [Face Recognition Pipeline Mathematical Reference](docs/FACE_RECOGNITION.md)
- 🎬 [Showcase Demonstration Script](docs/DEMO_GUIDE.md)
- 📦 [Sample & Demo Data Guidelines](sample-data/README.md)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
