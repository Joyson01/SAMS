#!/usr/bin/env bash
# ==============================================================================
# AttedDEL — Smart Attendance Management System
# One-Time Environment & Dependency Setup Script
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "============================================================"
echo "           AttedDEL — Initial Environment Setup             "
echo "============================================================"
echo ""

# 1. Verify Prerequisites
echo "[1/6] Checking system prerequisites..."
if ! command -v python3 &>/dev/null; then
    echo "❌ Error: python3 is not installed or not in PATH."
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "  ✓ Python ${PYTHON_VERSION} detected"

if ! command -v node &>/dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH."
    exit 1
fi
NODE_VERSION=$(node -v)
echo "  ✓ Node.js ${NODE_VERSION} detected"

# 2. Setup Environment File (.env)
echo ""
echo "[2/6] Checking environment configuration..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "  ℹ .env not found. Creating from .env.example..."
        cp .env.example .env
        echo "  ✓ Default .env created"
    else
        echo "❌ Error: Neither .env nor .env.example found."
        exit 1
    fi
else
    echo "  ✓ Existing .env file found"
fi

# 3. Create Runtime & Storage Directories
echo ""
echo "[3/6] Initializing storage and log directories..."
mkdir -p data logs .run tests/fixtures ai_engine/models
echo "  ✓ Created data/, logs/, .run/, tests/fixtures/"

# 4. Setup Python Virtual Environment (.venv)
echo ""
echo "[4/6] Setting up Python virtual environment..."
if [ ! -d .venv ]; then
    echo "  ℹ Creating virtual environment at .venv..."
    python3 -m venv .venv
fi

PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
PIP_BIN="${ROOT_DIR}/.venv/bin/pip"

if [ ! -f "${PYTHON_BIN}" ]; then
    echo "❌ Error: Virtual environment python binary not found at ${PYTHON_BIN}"
    exit 1
fi

echo "  ℹ Installing Python dependencies from requirements.txt..."
"${PIP_BIN}" install --upgrade pip --quiet
"${PIP_BIN}" install -r requirements.txt --quiet
echo "  ✓ Python backend dependencies installed"

# 5. Setup Frontend Dependencies
echo ""
echo "[5/6] Setting up Frontend dependencies..."
cd "${ROOT_DIR}/frontend"

if command -v corepack &>/dev/null; then
    corepack enable &>/dev/null || true
fi

if command -v pnpm &>/dev/null; then
    pnpm install --silent
elif command -v corepack &>/dev/null; then
    corepack pnpm install --silent
else
    echo "  ℹ pnpm not found directly, falling back to npm install..."
    npm install --silent
fi
cd "${ROOT_DIR}"
echo "  ✓ Frontend dependencies installed"

# 6. Verify Database & Health Readiness
echo ""
echo "[6/6] Validating database initialization..."
"${PYTHON_BIN}" -c "
import asyncio
from backend.app.database.session import init_db_schema
asyncio.run(init_db_schema())
print('  ✓ Database schema validated successfully')
"

echo ""
echo "============================================================"
echo "🎉 SETUP COMPLETED SUCCESSFULLY!"
echo "You can now launch the full stack with:"
echo "    ./start.sh"
echo "============================================================"
