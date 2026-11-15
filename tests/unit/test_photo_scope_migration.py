from sqlalchemy import create_engine, text
from backend.app.database.photo_scope import backfill_photo_scope


def test_backfill_freezes_scope_and_preserves_existing():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        for ddl in [
            "CREATE TABLE classes (id TEXT, name TEXT)",
            "CREATE TABLE batches (id TEXT, class_id TEXT, name TEXT)",
            "CREATE TABLE timetable_entries (id TEXT, class_id TEXT, "
            "batch_id TEXT, batch TEXT)",
            "CREATE TABLE attendance_sessions (id TEXT, timetable_entry_id TEXT, "
            "class_name TEXT, photo_batch_id TEXT, photo_scope_initialized BOOLEAN)",
        ]:
            conn.execute(text(ddl))
        conn.execute(text("INSERT INTO classes VALUES ('c','A')"))
        conn.execute(text("INSERT INTO batches VALUES ('b','c','B1')"))
        conn.execute(text("INSERT INTO timetable_entries VALUES ('t','c',NULL,'B1')"))
        conn.execute(
            text("INSERT INTO attendance_sessions VALUES ('s','t','A',NULL,FALSE)")
        )
        backfill_photo_scope(conn)
        assert (
            conn.execute(
                text("SELECT photo_batch_id FROM attendance_sessions")
            ).scalar()
            == "b"
        )
        conn.execute(text("UPDATE timetable_entries SET batch='ALL'"))
        backfill_photo_scope(conn)
        assert (
            conn.execute(
                text("SELECT photo_batch_id FROM attendance_sessions")
            ).scalar()
            == "b"
        )


def test_photo_revision_upgrades_existing_schema_idempotently():
    import importlib
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    revision = importlib.import_module("backend.alembic.versions.20261115_photo_scope")
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE students (id TEXT PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE attendance_sessions (id TEXT PRIMARY KEY)"))
        with Operations.context(MigrationContext.configure(conn)):
            revision.upgrade()
            revision.upgrade()
        conn.execute(text("INSERT INTO attendance_sessions (id) VALUES ('s')"))
        assert (
            conn.execute(
                text("SELECT photo_scope_initialized FROM attendance_sessions")
            ).scalar()
            == 0
        )
