#!/usr/bin/env bash
# ==============================================================================
# JOJIPA-SAMS — Smart Attendance Management System
# Root Launcher
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/scripts/start.sh" "$@"

https://10.175.7.202:5173/mobile-camera