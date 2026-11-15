#!/usr/bin/env bash
# ==============================================================================
# AttedDEL — Smart Attendance Management System
# Service Health & Telemetry Status Script
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

RUN_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"

echo "============================================================"
echo "            AttedDEL — System Service Status                "
echo "============================================================"
echo ""

# 1. Check Backend
BACKEND_STATUS="❌ Offline"
BACKEND_PID="None"
if [ -f "${BACKEND_PID_FILE}" ]; then
    BACKEND_PID=$(cat "${BACKEND_PID_FILE}" 2>/dev/null || echo "None")
fi

HEALTH_JSON=$(curl -s --connect-timeout 2 "http://127.0.0.1:8000/health" || true)
if echo "${HEALTH_JSON}" | grep -q "healthy"; then
    DB_STATUS=$(echo "${HEALTH_JSON}" | grep -o '"status":"connected"' || echo "Connected")
    DB_LATENCY=$(echo "${HEALTH_JSON}" | grep -o '"latency_ms":[0-9.]*' | cut -d':' -f2 || echo "N/A")
    BACKEND_STATUS="✓ Healthy (PID: ${BACKEND_PID}, DB latency: ${DB_LATENCY}ms)"
elif [ "${BACKEND_PID}" != "None" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    BACKEND_STATUS="⚠️ Running but health check failed (PID: ${BACKEND_PID})"
fi

# 2. Check Frontend
FRONTEND_STATUS="❌ Offline"
FRONTEND_PID="None"
if [ -f "${FRONTEND_PID_FILE}" ]; then
    FRONTEND_PID=$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || echo "None")
fi

if curl -k -s --connect-timeout 2 "https://127.0.0.1:5173/" >/dev/null 2>&1 || curl -s --connect-timeout 2 "http://127.0.0.1:5173/" >/dev/null 2>&1; then
    FRONTEND_STATUS="✓ Running (PID: ${FRONTEND_PID}, Port: 5173)"
elif [ "${FRONTEND_PID}" != "None" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    FRONTEND_STATUS="⚠️ Process alive (PID: ${FRONTEND_PID})"
fi

# 3. Check Database File
DATABASE_STATUS="✓ Active (SQLite data/sams_dev.db)"
if [ ! -f "${ROOT_DIR}/data/sams_dev.db" ]; then
    DATABASE_STATUS="⚠️ Database file not found at data/sams_dev.db"
fi

# 4. Check InsightFace AI Models
MODEL_STATUS="✓ Models Cached (~/.insightface/models/buffalo_l/)"
if [ ! -d "${HOME}/.insightface/models/buffalo_l" ]; then
    MODEL_STATUS="⚠️ Models not cached locally (will auto-download on first AI scan)"
fi

echo "  Component      Status"
echo "  ───────────    ─────────────────────────────────────────"
printf "  Database       %s\n" "${DATABASE_STATUS}"
printf "  Backend API    %s\n" "${BACKEND_STATUS}"
printf "  Frontend App   %s\n" "${FRONTEND_STATUS}"
printf "  AI Pipeline    %s\n" "${MODEL_STATUS}"
echo ""
echo "  URLs:"
echo "    Frontend : https://localhost:5173"
echo "    Backend  : http://localhost:8000"
echo "    API Docs : http://localhost:8000/docs"
echo "============================================================"

