"""Store published subject marks by student, academic year and semester."""
from alembic import op
import sqlalchemy as sa

revision = "20261124_semester_results"
down_revision = "20261124_classroom"
branch_labels = None
depends_on = None


def upgrade():
    if not sa.inspect(op.get_bind()).has_table("semester_results"):
        op.create_table(
            "semester_results",
            sa.Column("student_id", sa.String(36), sa.ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("academic_year", sa.String(32), primary_key=True),
            sa.Column("semester", sa.Integer(), primary_key=True),
            sa.Column("subject_id", sa.String(36), sa.ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True),
            sa.Column("marks", sa.Integer(), nullable=False),
            sa.Column("maximum", sa.Integer(), nullable=False),
            sa.CheckConstraint("maximum > 0 AND marks >= 0 AND marks <= maximum", name="valid_result_marks"),
        )


def downgrade():
    op.drop_table("semester_results")
