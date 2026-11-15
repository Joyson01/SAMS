#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv-backend/bin/python || ! -d frontend/node_modules ]]; then
  echo 'Install first: uv venv .venv-backend --python 3.11'
  echo 'uv pip install --python .venv-backend/bin/python -r requirements.txt'
  echo '(cd frontend && npm ci)'
  exit 1
fi
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./data/sams_dev.db}"
export SQLITE_FALLBACK_URL="$DATABASE_URL"
mkdir -p data
.venv-backend/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM
cd frontend
npm run dev
