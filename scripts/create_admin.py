"""Interactive first-admin setup; never edits the database by hand."""
import asyncio
import getpass
from sqlalchemy import select, text
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import User
from backend.app.schemas.auth import UserRegisterRequest
from backend.app.services.auth_service import AuthService

async def create_admin(username, email, full_name, password):
    payload = UserRegisterRequest(username=username, email=email, full_name=full_name, password=password, role='ADMIN')
    await init_db_schema()
    async with AsyncSessionLocal() as db:
        await db.execute(text('BEGIN IMMEDIATE' if db.bind.dialect.name == 'sqlite' else 'LOCK TABLE users IN EXCLUSIVE MODE'))
        if await db.scalar(select(User.id).where(User.role == 'ADMIN').limit(1)):
            raise RuntimeError('An administrator already exists. Use Users to create another.')
        await AuthService.register_user(db, payload, actor=User(role='ADMIN'))

async def seed_development_admin():
    from backend.app.core.config import settings
    if settings.ENVIRONMENT != 'development':
        return
    async with AsyncSessionLocal() as db:
        if await db.scalar(select(User.id).limit(1)):
            return
    await create_admin('admin', 'admin@example.com', 'Development Administrator', 'Admin@12345')
    print('\nDevelopment account: admin / Admin@12345 — change this password in Users.\n', flush=True)

def main():
    username = input('Username: ').strip()
    email = input('Email: ').strip()
    name = input('Full name: ').strip()
    password = getpass.getpass('Password (8+ characters, letter and digit): ')
    if password != getpass.getpass('Confirm password: '):
        raise SystemExit('Passwords do not match.')
    asyncio.run(create_admin(username, email, name, password))
    print('Administrator created.')

if __name__ == '__main__':
    main()
