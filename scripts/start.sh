#!/usr/bin/env bash
# ==============================================================================
# JOJIPA-SAMS — Smart Attendance Management System
# Full-Stack One-Click Application Launcher
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

BACKEND_PORT=8000
FRONTEND_PORT=5173
LOG_DIR="${ROOT_DIR}/logs"
RUN_DIR="${ROOT_DIR}/.run"

mkdir -p "${LOG_DIR}" "${RUN_DIR}" "data"

BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"

cleanup() {
    echo ""
    echo "Shutting down JOJIPA-SAMS services gracefully..."

    if [ -f "${BACKEND_PID_FILE}" ]; then
        BACKEND_PID=$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)
        if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
            echo "  ⏹ Stopping Backend server (PID: ${BACKEND_PID})..."
            kill "${BACKEND_PID}" 2>/dev/null || true
        fi
        rm -f "${BACKEND_PID_FILE}"
    fi

    if [ -f "${FRONTEND_PID_FILE}" ]; then
        FRONTEND_PID=$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || true)
        if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
            echo "  ⏹ Stopping Frontend dev server (PID: ${FRONTEND_PID})..."
            kill "${FRONTEND_PID}" 2>/dev/null || true
        fi
        rm -f "${FRONTEND_PID_FILE}"
    fi

    # Kill any child jobs in background process group
    jobs -p | xargs -r kill 2>/dev/null || true
    echo "✓ All JOJIPA-SAMS services stopped cleanly."
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "============================================================"
echo "                       JOJIPA-SAMS                          "
echo "           Smart Attendance Management System               "
echo "============================================================"
echo ""

# 1. Check Environment & Virtualenv
echo "[1/5] Checking environment..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "  ℹ Copying .env.example to .env..."
        cp .env.example .env
    else
        echo "❌ Error: .env file missing. Run ./scripts/setup.sh first."
        exit 1
    fi
fi

PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [ ! -f "${PYTHON_BIN}" ]; then
    echo "❌ Error: Virtual environment (.venv) not found."
    echo "   Please run one-time setup first: ./scripts/setup.sh"
    exit 1
fi
echo "  ✓ Python virtual environment ready"

# 2. Check and Prepare Database
echo ""
echo "[2/5] Initializing database & running migrations..."
"${PYTHON_BIN}" -c "
import asyncio
from backend.app.database.session import init_db_schema
asyncio.run(init_db_schema())
" > /dev/null 2>&1 || {
    echo "❌ Database initialization failed. Check backend/app/database/session.py or .env"
    exit 1
}
echo "  ✓ Database schema validated & up to date"

# 3. Check for Port Conflicts & Start Backend
echo ""
echo "[3/5] Starting FastAPI Backend on port ${BACKEND_PORT}..."

# Check if port 8000 is occupied
if lsof -Pi :${BACKEND_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    EXISTING_BACKEND_PID=$(lsof -Pi :${BACKEND_PORT} -sTCP:LISTEN -t | head -n 1)
    # Check if it is already our healthy backend
    if curl -s "http://127.0.0.1:${BACKEND_PORT}/health" | grep -q "healthy"; then
        echo "  ℹ Backend already running & healthy (PID: ${EXISTING_BACKEND_PID})"
        echo "${EXISTING_BACKEND_PID}" > "${BACKEND_PID_FILE}"
    else
        echo "⚠️ Port ${BACKEND_PORT} is occupied by PID ${EXISTING_BACKEND_PID}. Releasing port..."
        kill -9 "${EXISTING_BACKEND_PID}" 2>/dev/null || true
        sleep 1
    fi
fi

if [ ! -f "${BACKEND_PID_FILE}" ] || ! kill -0 "$(cat "${BACKEND_PID_FILE}" 2>/dev/null || echo "0")" 2>/dev/null; then
    "${PYTHON_BIN}" -m uvicorn backend.app.main:app --host 0.0.0.0 --port "${BACKEND_PORT}" --reload > "${BACKEND_LOG}" 2>&1 &
    BACKEND_PID=$!
    echo "${BACKEND_PID}" > "${BACKEND_PID_FILE}"
fi

# Poll backend health
echo "  ℹ Waiting for backend health check..."
MAX_RETRIES=20
COUNT=0
BACKEND_HEALTHY=false

while [ "${COUNT}" -lt "${MAX_RETRIES}" ]; do
    if curl -s "http://127.0.0.1:${BACKEND_PORT}/health" | grep -q "healthy"; then
        BACKEND_HEALTHY=true
        break
    fi
    sleep 0.5
    COUNT=$((COUNT + 1))
done

if [ "${BACKEND_HEALTHY}" = true ]; then
    echo "  ✓ Backend healthy at http://localhost:${BACKEND_PORT}"
else
    echo "❌ Error: Backend failed to start. Showing last 15 lines of ${BACKEND_LOG}:"
    echo "------------------------------------------------------------"
    tail -n 15 "${BACKEND_LOG}" || true
    echo "------------------------------------------------------------"
    cleanup
    exit 1
fi

# 4. Check for Port Conflicts & Start Frontend
echo ""
echo "[4/5] Starting React + Vite Frontend on port ${FRONTEND_PORT}..."

# Check if port 5173 is occupied
if lsof -Pi :${FRONTEND_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
    EXISTING_FRONTEND_PID=$(lsof -Pi :${FRONTEND_PORT} -sTCP:LISTEN -t | head -n 1)
    echo "⚠️ Port ${FRONTEND_PORT} is occupied by PID ${EXISTING_FRONTEND_PID}. Releasing port..."
    kill -9 "${EXISTING_FRONTEND_PID}" 2>/dev/null || true
    sleep 1
fi

cd "${ROOT_DIR}/frontend"
if command -v pnpm &>/dev/null; then
    pnpm run dev --host 0.0.0.0 --port "${FRONTEND_PORT}" > "${FRONTEND_LOG}" 2>&1 &
elif command -v corepack &>/dev/null; then
    corepack pnpm run dev --host 0.0.0.0 --port "${FRONTEND_PORT}" > "${FRONTEND_LOG}" 2>&1 &
else
    npm run dev -- --host 0.0.0.0 --port "${FRONTEND_PORT}" > "${FRONTEND_LOG}" 2>&1 &
fi
FRONTEND_PID=$!
echo "${FRONTEND_PID}" > "${FRONTEND_PID_FILE}"
cd "${ROOT_DIR}"

# Poll frontend readiness
MAX_F_RETRIES=20
F_COUNT=0
FRONTEND_READY=false

while [ "${F_COUNT}" -lt "${MAX_F_RETRIES}" ]; do
    if curl -k -s "https://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1 || curl -s "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1; then
        FRONTEND_READY=true
        break
    fi
    sleep 0.5
    F_COUNT=$((F_COUNT + 1))
done

if [ "${FRONTEND_READY}" = true ]; then
    echo "  ✓ Frontend running at https://localhost:${FRONTEND_PORT}"
else
    echo "⚠️ Frontend started (PID: ${FRONTEND_PID}). Verification continuing..."
fi

# 5. Detect Network IP for Mobile Devices
LOCAL_IP="localhost"
if command -v hostname &>/dev/null; then
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    if [ -n "${DETECTED_IP}" ]; then
        LOCAL_IP="${DETECTED_IP}"
    fi
elif command -v ip &>/dev/null; then
    DETECTED_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || true)
    if [ -n "${DETECTED_IP}" ]; then
        LOCAL_IP="${DETECTED_IP}"
    fi
fi

# 6. Print System Ready Dashboard
echo ""
echo "============================================================"
echo "               🎉 JOJIPA-SAMS SYSTEM READY                  "
echo "============================================================"
echo ""
echo "  🖥️  Web Application    : https://localhost:${FRONTEND_PORT}"
echo "  📱  Mobile Station     : https://${LOCAL_IP}:${FRONTEND_PORT}/mobile-camera"
echo "  🔌  Backend API        : http://localhost:${BACKEND_PORT}"
echo "  📖  API Documentation  : http://localhost:${BACKEND_PORT}/docs"
echo "  🩺  Health Probe       : http://localhost:${BACKEND_PORT}/health"
echo ""
echo "  📁  Logs:"
echo "      Backend  : logs/backend.log"
echo "      Frontend : logs/frontend.log"
echo ""
echo "  💡 Tips:"
echo "      - For camera access, allow permissions in your browser."
echo "      - For mobile camera pairing, connect phone to the same Wi-Fi."
echo ""
echo "  ⏹️  Press Ctrl+C to stop all services."
echo "============================================================"
echo ""

# Keep launcher active to manage sub-processes
while true; do
    # Monitor health of processes
    if [ -f "${BACKEND_PID_FILE}" ]; then
        BPID=$(cat "${BACKEND_PID_FILE}" 2>/dev/null || echo "")
        if [ -n "${BPID}" ] && ! kill -0 "${BPID}" 2>/dev/null; then
            echo "⚠️ Backend process died unexpectedly. Check logs/backend.log"
            break
        fi
    fi
    if [ -f "${FRONTEND_PID_FILE}" ]; then
        FPID=$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || echo "")
        if [ -n "${FPID}" ] && ! kill -0 "${FPID}" 2>/dev/null; then
            echo "⚠️ Frontend process died unexpectedly. Check logs/frontend.log"
            break
        fi
    fi
    sleep 3
done

cleanup
