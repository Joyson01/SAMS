"""Initialize an empty SAMS database and record its Alembic revision."""

import asyncio
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, inspect
from sqlalchemy.ext.asyncio import create_async_engine

from backend.app.core.config import settings
from backend.app.database.base import Base
import backend.app.models  # noqa: F401


BASELINE_REVISION = "20261125_submissions"
ALEMBIC_CONFIG = Path(__file__).resolve().parents[1] / "backend" / "alembic.ini"


class BootstrapError(RuntimeError):
    pass


def initialize_empty_database(connection: Connection) -> None:
    scripts = ScriptDirectory.from_config(Config(str(ALEMBIC_CONFIG)))
    if scripts.get_current_head() != BASELINE_REVISION:
        raise BootstrapError("The bootstrap schema must be reviewed for the current Alembic head.")

    if connection.dialect.name == "sqlite":
        # Serialize the emptiness check and make SQLite DDL transactional.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
    schema = inspect(connection)
    if schema.get_table_names() or schema.get_view_names():
        raise BootstrapError("Bootstrap requires an empty database. Existing objects were left intact.")

    Base.metadata.create_all(connection)
    MigrationContext.configure(connection).stamp(scripts, BASELINE_REVISION)


async def bootstrap_database(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(initialize_empty_database)
    finally:
        await engine.dispose()


def main() -> None:
    try:
        asyncio.run(bootstrap_database(settings.DATABASE_URL))
    except BootstrapError as exc:
        raise SystemExit(str(exc)) from exc
    print(f"Initialized an empty database at Alembic revision {BASELINE_REVISION}.")


if __name__ == "__main__":
    main()
