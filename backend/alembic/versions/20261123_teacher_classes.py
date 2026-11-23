"""Record teacher class assignments."""
from alembic import op
import sqlalchemy as sa

from backend.app.models.entities import GUID

revision = "20261123_teacher_classes"
down_revision = "20261123_hod_department"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("teacher_class_assignments"):
        return
    op.create_table(
        "teacher_class_assignments",
        sa.Column("teacher_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("class_id", GUID(), sa.ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_teacher_class_assignments_class_id", "teacher_class_assignments", ["class_id"])


def downgrade():
    op.drop_table("teacher_class_assignments")
