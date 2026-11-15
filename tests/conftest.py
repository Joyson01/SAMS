import asyncio
import os
import sys
from pathlib import Path
import pytest
import pytest_asyncio

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test environment
os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SQLITE_FALLBACK_URL"] = "sqlite+aiosqlite:///:memory:"

from backend.app.core.security import hash_password
from backend.app.database.base import Base
from backend.app.database.session import get_db
from backend.app.main import app
from backend.app.models.entities import User


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def test_db_session():
    """Provides an isolated in-memory SQLite database session for tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db_session):
    """Provides an HTTP async test client with overridden database dependency."""
    async def override_get_db():
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def staff_client(client, test_db_session):
    """Sign in as a staff member through the API."""
    password = "attendance-test-password"
    test_db_session.add(User(
        username="test_staff",
        email="staff@campus.edu",
        full_name="Test Staff",
        role="ADMIN",
        password_hash=hash_password(password),
    ))
    await test_db_session.commit()
    response = await client.post("/api/v1/auth/login", json={
        "username_or_email": "test_staff",
        "password": password,
    })
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client
