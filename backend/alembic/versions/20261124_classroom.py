"""Add the academic classroom stream."""
from alembic import op
import sqlalchemy as sa

from backend.app.models.entities import GUID

revision = "20261124_classroom"
down_revision = "20261123_teacher_classes"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("classroom_posts"):
        return
    op.create_table(
        "classroom_posts",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("class_id", GUID(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", GUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("classroom_url", sa.String(2048)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_classroom_posts_class_id", "classroom_posts", ["class_id"])


def downgrade():
    op.drop_table("classroom_posts")
