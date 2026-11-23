"""Store private chat attachments."""
from alembic import op

from backend.app.models.classroom import ClassmateAttachment

revision = "20261126_chat_files"
down_revision = "20261125_classmate_chat"
branch_labels = None
depends_on = None


def upgrade():
    ClassmateAttachment.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    ClassmateAttachment.__table__.drop(op.get_bind())
