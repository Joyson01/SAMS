"""Backfill saved session scope without overwriting an existing snapshot."""

from sqlalchemy import inspect, text


def backfill_photo_scope(connection):
    tables = set(inspect(connection).get_table_names())
    if not {"attendance_sessions", "timetable_entries", "classes", "batches"} <= tables:
        return
    rows = connection.execute(text("""SELECT id, timetable_entry_id, class_name
        FROM attendance_sessions WHERE photo_scope_initialized = FALSE""")).mappings()
    for row in list(rows):
        batch_id = None
        if row["timetable_entry_id"]:
            slot = (
                connection.execute(
                    text("""SELECT t.batch_id, t.batch, c.name
                FROM timetable_entries t JOIN classes c ON c.id=t.class_id
                WHERE t.id=:id"""),
                    {"id": row["timetable_entry_id"]},
                )
                .mappings()
                .first()
            )
            if not slot or slot["name"] != row["class_name"]:
                batch_id = "unresolved-scope"
            elif slot["batch_id"]:
                batch_id = slot["batch_id"]
            elif slot["batch"] and slot["batch"].upper() != "ALL":
                batch_id = connection.execute(
                    text("""SELECT b.id FROM batches b
                    JOIN classes c ON c.id=b.class_id
                    WHERE c.name=:class_name AND b.name=:name"""),
                    {"class_name": row["class_name"], "name": slot["batch"]},
                ).scalar()
                batch_id = batch_id or "unresolved-scope"
        connection.execute(
            text("""UPDATE attendance_sessions
            SET photo_batch_id=:batch, photo_scope_initialized=TRUE WHERE id=:id"""),
            {"batch": batch_id, "id": row["id"]},
        )
