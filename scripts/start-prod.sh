#!/usr/bin/env bash
# ==============================================================================
# AttedDEL — Dedicated Production Server Launcher
# Serves FastAPI Backend + Compiled React SPA on a single production port
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/start.sh" --prod "$@"

