"""
SAMS Database Demo Seeder Script (Alias for seed_demo_data).

Usage:
    python -m scripts.seed_demo
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath("."))

from scripts.seed_demo_data import seed_demo_data

if __name__ == "__main__":
    asyncio.run(seed_demo_data())
