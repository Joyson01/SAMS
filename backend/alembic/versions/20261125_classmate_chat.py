"""Persist private messages between classmates."""
from alembic import op

from backend.app.models.classroom import ClassmateMessage

revision = "20261125_classmate_chat"
down_revision = "20261125_submissions"
branch_labels = None
depends_on = None


def upgrade():
    ClassmateMessage.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    ClassmateMessage.__table__.drop(op.get_bind())
