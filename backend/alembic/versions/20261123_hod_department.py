"""Store the department assigned to an HOD account."""
from alembic import op
import sqlalchemy as sa

revision = "20261123_hod_department"
down_revision = "20261115_photo_scope"
branch_labels = None
depends_on = None


def upgrade():
    columns = sa.inspect(op.get_bind()).get_columns("users")
    if "department" not in {column["name"] for column in columns}:
        op.add_column("users", sa.Column("department", sa.String(64), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("department")
