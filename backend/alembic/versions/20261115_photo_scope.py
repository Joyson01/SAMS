"""Student batch membership and immutable photo session scope."""

from alembic import op
import sqlalchemy as sa

revision = "20261115_photo_scope"
down_revision = "39ffa3306d5f"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    changes = {
        "students": [sa.Column("batch_id", sa.String(36), nullable=True)],
        "attendance_sessions": [
            sa.Column("photo_batch_id", sa.String(36), nullable=True),
            sa.Column(
                "photo_scope_initialized",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        ],
    }
    for table, columns in changes.items():
        existing = {c["name"] for c in sa.inspect(bind).get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)
    inspector = sa.inspect(bind)
    if "batches" in inspector.get_table_names():
        foreign_keys = inspector.get_foreign_keys("students")
        if not any(fk["constrained_columns"] == ["batch_id"] for fk in foreign_keys):
            with op.batch_alter_table("students") as batch_op:
                batch_op.create_foreign_key(
                    "fk_students_batch",
                    "batches",
                    ["batch_id"],
                    ["id"],
                    ondelete="RESTRICT",
                )
    from backend.app.database.photo_scope import backfill_photo_scope

    backfill_photo_scope(bind)


def downgrade():
    op.drop_column("attendance_sessions", "photo_scope_initialized")
    op.drop_column("attendance_sessions", "photo_batch_id")
    op.drop_column("students", "batch_id")
