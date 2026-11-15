"""
AttedDEL / SAMS - Initial Administrator & Staff Account Bootstrapper.

Idempotently creates or updates an administrator/staff account directly in the database.
Useful for first-boot provisioning in containerized and bare-metal environments.

Usage:
    python -m scripts.bootstrap_admin --username admin --email admin@college.edu --password <secret> --role ADMIN

Or via environment variables:
    BOOTSTRAP_ADMIN_USERNAME=admin
    BOOTSTRAP_ADMIN_EMAIL=admin@college.edu
    BOOTSTRAP_ADMIN_PASSWORD=<secret>
    BOOTSTRAP_ADMIN_ROLE=ADMIN
    python -m scripts.bootstrap_admin
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath("."))

from sqlalchemy import select, or_
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import User
from backend.app.core.security import hash_password


async def bootstrap_admin(username: str, email: str, password: str, role: str = "ADMIN", full_name: str = "System Administrator"):
    print("=" * 60)
    print("🔑 SAMS STAFF / ADMIN ACCOUNT BOOTSTRAPPER")
    print("=" * 60)

    await init_db_schema()

    role = role.upper()
    if role not in ("ADMIN", "FACULTY", "STUDENT"):
        print(f"❌ Error: Invalid role '{role}'. Allowed roles: ADMIN, FACULTY, STUDENT.")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        query = select(User).where(or_(User.username == username, User.email == email))
        existing = (await db.execute(query)).scalars().first()

        if existing:
            print(f"  ℹ User '{username}' / '{email}' already exists (Current role: {existing.role}).")
            existing.password_hash = hash_password(password)
            existing.role = role
            existing.full_name = full_name
            existing.is_active = True
            await db.commit()
            print(f"  ✓ Account credentials and role updated to '{role}'.")
        else:
            new_user = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=role,
                is_active=True,
            )
            db.add(new_user)
            await db.commit()
            print(f"  ✓ Administrator account created successfully:")
            print(f"      Username:  {username}")
            print(f"      Email:     {email}")
            print(f"      Role:      {role}")
            print(f"      Full Name: {full_name}")

    print("=" * 60)
    print("✅ Bootstrap completed successfully.")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Bootstrap initial SAMS admin/staff user.")
    parser.add_argument("--username", default=os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin"), help="Username")
    parser.add_argument("--email", default=os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@college.edu"), help="Email address")
    parser.add_argument("--password", default=os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "AdminPass123!"), help="Account password")
    parser.add_argument("--role", default=os.getenv("BOOTSTRAP_ADMIN_ROLE", "ADMIN"), help="User role (ADMIN, FACULTY, STUDENT)")
    parser.add_argument("--full-name", default=os.getenv("BOOTSTRAP_ADMIN_FULL_NAME", "System Administrator"), help="Full Name")

    args = parser.parse_args()

    asyncio.run(bootstrap_admin(
        username=args.username,
        email=args.email,
        password=args.password,
        role=args.role,
        full_name=args.full_name
    ))


if __name__ == "__main__":
    main()
