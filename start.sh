#!/usr/bin/env bash
# ==============================================================================
# AttedDEL — Smart Attendance Management System
# Root Launcher
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/scripts/start.sh" "$@"