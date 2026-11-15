"""Compatibility entry point for safe, idempotent academic demo seeding."""
import asyncio
from scripts.seed_demo_data import seed_demo_data as seed_database

if __name__ == '__main__':
    asyncio.run(seed_database())
