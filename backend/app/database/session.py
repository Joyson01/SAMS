import os
import time
from pathlib import Path
from typing import AsyncGenerator, Tuple
from sqlalchemy import text, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.database.base import Base

# Determine Database URL
_db_url = settings.DATABASE_URL
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_active_db_type: str = "postgresql"


def _enable_sqlite_pragmas(engine: AsyncEngine) -> None:
    """Configures high-concurrency PRAGMAs (WAL, synchronous, timeout) on SQLite connections."""
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=10000")
            cursor.close()
        except Exception:
            pass


def get_engine() -> AsyncEngine:
    """Initializes and returns the singleton AsyncEngine."""
    global _engine, _session_factory, _active_db_type

    if _engine is not None:
        return _engine

    db_url = settings.DATABASE_URL
    is_sqlite = db_url.startswith("sqlite")

    if is_sqlite:
        _active_db_type = "sqlite"
        db_path = db_url.replace("sqlite+aiosqlite:///", "")
        if db_path.startswith("./"):
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(
            db_url,
            echo=False,
            connect_args={"check_same_thread": False},
        )
        _enable_sqlite_pragmas(_engine)
    else:
        _active_db_type = "postgresql"
        _engine = create_async_engine(
            db_url,
            echo=False,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    _session_factory = async_sessionmaker(
        bind=_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=AsyncSession,
    )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Returns the configured sessionmaker factory."""
    if _session_factory is None:
        get_engine()
    assert _session_factory is not None
    return _session_factory


def AsyncSessionLocal() -> AsyncSession:
    """Convenience factory returning an AsyncSession instance."""
    return get_session_factory()()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for obtaining an async database session."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_database_connection() -> Tuple[bool, str, float]:
    """Tests database connectivity by executing a quick query.

    Returns:
        Tuple[bool, str, float]: (is_connected, db_type_or_message, latency_ms)
    """
    global _engine, _session_factory, _active_db_type
    start_time = time.perf_counter()
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        return True, _active_db_type, round(latency_ms, 2)
    except Exception as exc:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        logger.warning(f"Primary database connection check failed: {exc}")

        # If PostgreSQL fails and fallback is enabled, attempt SQLite
        if settings.DATABASE_FALLBACK_SQLITE and _active_db_type == "postgresql":
            try:
                logger.info(f"Attempting fallback to local SQLite: {settings.SQLITE_FALLBACK_URL}")
                fallback_engine = create_async_engine(
                    settings.SQLITE_FALLBACK_URL,
                    connect_args={"check_same_thread": False},
                )
                _enable_sqlite_pragmas(fallback_engine)
                async with fallback_engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))

                _engine = fallback_engine
                _active_db_type = "sqlite"
                _session_factory = async_sessionmaker(
                    bind=_engine,
                    autocommit=False,
                    autoflush=False,
                    expire_on_commit=False,
                    class_=AsyncSession,
                )
                return True, "sqlite_fallback", round(latency_ms, 2)
            except Exception as fallback_exc:
                logger.error(f"Fallback SQLite check also failed: {fallback_exc}")

        return False, str(exc), round(latency_ms, 2)


async def init_db_schema() -> None:
    """Initializes tables and migrates schema columns for local development/testing."""
    import backend.app.models.entities  # noqa: F401
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Dynamic column additions for SQLite/Postgres backwards compatibility
        alter_statements = [
            ("classes", "effective_from", "VARCHAR(32) DEFAULT '15/06/2026'"),
            ("subjects", "vertical", "VARCHAR(32)"),
            ("subjects", "theory_hours", "INTEGER DEFAULT 0"),
            ("subjects", "tutorial_hours", "INTEGER DEFAULT 0"),
            ("subjects", "practical_hours", "INTEGER DEFAULT 0"),
            ("subjects", "theory_credits", "INTEGER DEFAULT 0"),
            ("subjects", "tutorial_credits", "INTEGER DEFAULT 0"),
            ("subjects", "practical_credits", "INTEGER DEFAULT 0"),
            ("timetable_entries", "batch_id", "VARCHAR(36)"),
            ("attendance_sessions", "timetable_entry_id", "VARCHAR(36)"),
        ]

        for table, col, col_type in alter_statements:
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
            except Exception:
                # Column already exists or table not ready
                pass

    logger.info("Database schema initialized and columns synchronized successfully.")

