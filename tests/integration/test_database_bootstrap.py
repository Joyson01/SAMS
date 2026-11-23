import pytest
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from scripts.bootstrap_database import BASELINE_REVISION, BootstrapError, bootstrap_database


@pytest.mark.asyncio
async def test_bootstrap_creates_and_versions_complete_sqlite_schema(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'fresh.db'}"
    await bootstrap_database(database_url)

    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            assert revision == BASELINE_REVISION

            def check_schema(sync_connection):
                schema = inspect(sync_connection)
                assert {"subjects", "batches", "timetable_entries", "auth_sessions"} <= set(
                    schema.get_table_names()
                )
                constraints = schema.get_unique_constraints("attendance_records")
                assert ["session_id", "student_id"] in [c["column_names"] for c in constraints]

            await connection.run_sync(check_schema)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_bootstrap_refuses_existing_unversioned_database(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'existing.db'}"
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE existing_data (value INTEGER)"))
            await connection.execute(text("INSERT INTO existing_data VALUES (42)"))

        with pytest.raises(BootstrapError, match="empty database"):
            await bootstrap_database(database_url)

        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT value FROM existing_data")) == 42
            tables = await connection.run_sync(lambda sync: inspect(sync).get_table_names())
            assert tables == ["existing_data"]
    finally:
        await engine.dispose()
