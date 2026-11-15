# Installation & Deployment Guide

## Smart Attendance Management System (SAMS)

> [!TIP]
> **Production & Pilot Deployment**: For the complete production, containerized, and private college pilot deployment instructions, please see the [Production Deployment Runbook](DEPLOYMENT_RUNBOOK.md).

---

## 1. System Requirements

### Hardware Requirements
- **CPU**: 4-Core Processor (x86_64 or ARM64)
- **RAM**: 8 GB minimum (16 GB recommended for multi-stream or video processing)
- **Disk**: 10 GB free space (for Python virtual environment and InsightFace model weights)
- **Camera**: USB Webcam, Laptop Integrated Camera, or RTSP Network IP Camera

### Software Prerequisites
- **Python**: 3.10, 3.11, 3.12, or 3.14
- **Node.js**: 18.x or 20.x LTS with `npm`
- **Git**: 2.30+
- **C/C++ Build Essentials**: Required for compiling native dependencies (`build-essential` on Ubuntu/Debian)

---

## 2. Local Development Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/sams.git
cd sams
```

### Step 2: Environment Configuration
Copy the `.env.example` template into `.env`:
```bash
cp .env.example .env
```
The default `.env` configuration uses SQLite for zero-configuration local development.

### Step 3: Backend Setup (Python & FastAPI)

1. **Create and activate a virtual environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # On Linux / macOS
   # On Windows: .venv\Scripts\activate
   ```

2. **Install Python dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Seed Clean Demo Data**:
   Populate the local database with fictional students, subjects, classes, cameras, and timetable:
   ```bash
   python -m scripts.seed_demo_data
   ```

4. **Start the FastAPI Backend Server**:
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

   The backend will be available at:
   - **Interactive API Documentation (Swagger)**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
   - **Alternative Documentation (ReDoc)**: [http://localhost:8000/api/v1/redoc](http://localhost:8000/api/v1/redoc)
   - **Health Check Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

---

### Step 4: Frontend Setup (React & Vite)

1. Open a new terminal window and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   👉 **[http://localhost:5173](http://localhost:5173)**

---

## 3. Docker Deployment

To launch the complete application stack (Backend + Frontend + PostgreSQL with `pgvector`) in isolated containers:

```bash
# Build and start all services in detached mode
docker-compose up --build -d

# View container logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## 4. Hardware Acceleration (GPU Setup)

By default, SAMS runs ONNX Runtime on the CPU using `CPUExecutionProvider` for universal hardware compatibility without requiring proprietary drivers.

To enable NVIDIA GPU acceleration via CUDA:
1. Ensure NVIDIA CUDA 11.8+ and cuDNN 8.x are installed on your host system.
2. Install the GPU-enabled ONNX Runtime package:
   ```bash
   pip install onnxruntime-gpu
   ```
3. Update `.env`:
   ```env
   AI_PROVIDER=CUDAExecutionProvider
   ```

---

## 5. Running Automated Tests

Run the full pytest suite (102 tests):
```bash
# Run all tests
pytest

# Run tests with verbose output
pytest -v

# Run specific test suites
pytest tests/unit/
pytest tests/integration/
```

Verify frontend TypeScript compilation and production build:
```bash
cd frontend
npm run build
```
