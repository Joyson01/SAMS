"""Create the first administrator interactively without built-in credentials."""
import asyncio
import getpass

from sqlalchemy import func, select

from backend.app.core.security import hash_password
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import User


async def create_admin(username: str, email: str, full_name: str, password: str) -> None:
    await init_db_schema()
    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(User))
        if count:
            raise RuntimeError(
                "User accounts already exist; ask an administrator to create an account."
            )
        db.add(User(
            username=username,
            email=email,
            full_name=full_name,
            role="ADMIN",
            password_hash=hash_password(password),
            is_active=True,
        ))
        await db.commit()


def main() -> None:
    username = input("Administrator username: ").strip()
    email = input("Administrator email: ").strip()
    full_name = input("Administrator full name: ").strip()
    password = getpass.getpass("Administrator password (12+ characters): ")
    if not username or not email or not full_name or len(password) < 12:
        raise SystemExit("Enter all fields and use a password with at least 12 characters.")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    asyncio.run(create_admin(username, email, full_name, password))
    print("Administrator created. Sign in with the username and password you chose.")


if __name__ == "__main__":
    main()
