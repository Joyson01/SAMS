#!/usr/bin/env python3
"""
JOJIPA-SAMS — Smart Attendance Management System
Direct Python Entry Point
"""

import sys
from pathlib import Path

# Add project root to sys.path
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )

