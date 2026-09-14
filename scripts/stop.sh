#!/usr/bin/env bash
# ==============================================================================
# AttedDEL — Smart Attendance Management System
# Service Shutdown Script
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

RUN_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"

echo "============================================================"
echo "           AttedDEL — Stopping All Services                 "
echo "============================================================"
echo ""

STOPPED_COUNT=0

# 1. Stop Backend
if [ -f "${BACKEND_PID_FILE}" ]; then
    BACKEND_PID=$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)
    if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        echo "  ⏹ Stopping Backend server (PID: ${BACKEND_PID})..."
        kill "${BACKEND_PID}" 2>/dev/null || true
        sleep 0.5
        if kill -0 "${BACKEND_PID}" 2>/dev/null; then
            kill -9 "${BACKEND_PID}" 2>/dev/null || true
        fi
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
    fi
    rm -f "${BACKEND_PID_FILE}"
fi

# 2. Stop Frontend
if [ -f "${FRONTEND_PID_FILE}" ]; then
    FRONTEND_PID=$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || true)
    if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        echo "  ⏹ Stopping Frontend dev server (PID: ${FRONTEND_PID})..."
        kill "${FRONTEND_PID}" 2>/dev/null || true
        sleep 0.5
        if kill -0 "${FRONTEND_PID}" 2>/dev/null; then
            kill -9 "${FRONTEND_PID}" 2>/dev/null || true
        fi
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
    fi
    rm -f "${FRONTEND_PID_FILE}"
fi

# 3. Clean any orphaned port bindings
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    PORT_8000_PID=$(lsof -Pi :8000 -sTCP:LISTEN -t | head -n 1)
    echo "  ℹ Releasing port 8000 (PID: ${PORT_8000_PID})..."
    kill -9 "${PORT_8000_PID}" 2>/dev/null || true
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    PORT_5173_PID=$(lsof -Pi :5173 -sTCP:LISTEN -t | head -n 1)
    echo "  ℹ Releasing port 5173 (PID: ${PORT_5173_PID})..."
    kill -9 "${PORT_5173_PID}" 2>/dev/null || true
fi

echo ""
echo "✓ All JOJIPA-SAMS services are stopped."

