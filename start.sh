#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/devserver.py "$@"
elif command -v python >/dev/null 2>&1; then
  exec python scripts/devserver.py "$@"
else
  echo "Install Python 3.11–3.13 (or Python and uv), plus Node.js 20+ with npm." >&2
  exit 1
fi
