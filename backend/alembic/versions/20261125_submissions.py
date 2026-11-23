"""Store one text submission per student and assignment."""
from alembic import op
import sqlalchemy as sa

from backend.app.models.entities import GUID

revision = "20261125_submissions"
down_revision = "20261124_semester_results"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assignment_submissions",
        sa.Column("post_id", GUID(), sa.ForeignKey("classroom_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("student_id", GUID(), sa.ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("assignment_submissions")
