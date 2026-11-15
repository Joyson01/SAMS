"""initial_schema

Revision ID: f59139c4500e
Revises: 
Create Date: 2026-08-30 17:27:54.384554

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = 'f59139c4500e'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(64), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(128), nullable=False),
        sa.Column('role', sa.String(32), nullable=False, server_default='FACULTY'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email', 'users', ['email'])

    # 2. students table
    op.create_table(
        'students',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('student_code', sa.String(32), nullable=False, unique=True),
        sa.Column('roll_number', sa.String(32), nullable=False, unique=True),
        sa.Column('first_name', sa.String(64), nullable=False),
        sa.Column('last_name', sa.String(64), nullable=False),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('department', sa.String(64), nullable=False),
        sa.Column('class_name', sa.String(32), nullable=False),
        sa.Column('section', sa.String(16), nullable=False, server_default='A'),
        sa.Column('status', sa.String(32), nullable=False, server_default='ACTIVE'),
        sa.Column('enrollment_status', sa.String(32), nullable=False, server_default='NOT_ENROLLED'),
        sa.Column('avatar_url', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_students_roll_number', 'students', ['roll_number'])
    op.create_index('ix_students_department', 'students', ['department'])
    op.create_index('ix_students_class_name', 'students', ['class_name'])

    # 3. face_profiles table
    op.create_table(
        'face_profiles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('student_id', sa.String(36), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=False),
        sa.Column('embedding_data', sa.JSON(), nullable=False),
        sa.Column('model_name', sa.String(64), nullable=False, server_default='ArcFace-ResNet50'),
        sa.Column('model_version', sa.String(32), nullable=False, server_default='1.0.0'),
        sa.Column('quality_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('pose_type', sa.String(32), nullable=False, server_default='FRONT'),
        sa.Column('image_path', sa.String(512), nullable=True),
        sa.Column('image_hash', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_face_profiles_student_id', 'face_profiles', ['student_id'])

    # 4. cameras table
    op.create_table(
        'cameras',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(64), nullable=False),
        sa.Column('location', sa.String(128), nullable=False),
        sa.Column('source_type', sa.String(32), nullable=False, server_default='WEBCAM'),
        sa.Column('stream_url', sa.String(512), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('target_fps', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('resolution', sa.String(32), nullable=False, server_default='640x480'),
        sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 5. attendance_sessions table
    op.create_table(
        'attendance_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_code', sa.String(64), nullable=False, unique=True),
        sa.Column('class_name', sa.String(32), nullable=False),
        sa.Column('subject', sa.String(64), nullable=False),
        sa.Column('room', sa.String(32), nullable=False),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='SCHEDULED'),
        sa.Column('created_by_user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('camera_ids', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_attendance_sessions_date', 'attendance_sessions', ['scheduled_date'])
    op.create_index('ix_attendance_sessions_class', 'attendance_sessions', ['class_name'])

    # 6. attendance_records table
    op.create_table(
        'attendance_records',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('attendance_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.String(36), sa.ForeignKey('students.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='PRESENT'),
        sa.Column('first_seen', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('track_id', sa.Integer(), nullable=True),
        sa.Column('camera_id', sa.String(36), sa.ForeignKey('cameras.id', ondelete='SET NULL'), nullable=True),
        sa.Column('liveness_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('verification_metadata', sa.JSON(), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('marked_by_user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('session_id', 'student_id', name='uq_session_student_attendance'),
    )
    op.create_index('ix_attendance_records_session', 'attendance_records', ['session_id'])
    op.create_index('ix_attendance_records_student', 'attendance_records', ['student_id'])

    # 7. recognition_events table
    op.create_table(
        'recognition_events',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('event_timestamp', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('camera_id', sa.String(36), sa.ForeignKey('cameras.id', ondelete='SET NULL'), nullable=True),
        sa.Column('track_id', sa.Integer(), nullable=True),
        sa.Column('candidate_student_id', sa.String(36), sa.ForeignKey('students.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decision', sa.String(32), nullable=False),
        sa.Column('similarity', sa.Float(), nullable=False),
        sa.Column('liveness_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('bbox_coordinates', sa.JSON(), nullable=False),
        sa.Column('snapshot_path', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_recognition_events_time', 'recognition_events', ['event_timestamp'])

    # 8. audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(64), nullable=False),
        sa.Column('entity_type', sa.String(64), nullable=False),
        sa.Column('entity_id', sa.String(64), nullable=False),
        sa.Column('old_values', sa.JSON(), nullable=True),
        sa.Column('new_values', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'])

    # 9. sync_queue table
    op.create_table(
        'sync_queue',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('event_uuid', sa.String(64), nullable=False, unique=True),
        sa.Column('event_type', sa.String(64), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='PENDING'),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_sync_queue_status', 'sync_queue', ['status'])


def downgrade() -> None:
    op.drop_table('sync_queue')
    op.drop_table('audit_logs')
    op.drop_table('recognition_events')
    op.drop_table('attendance_records')
    op.drop_table('attendance_sessions')
    op.drop_table('cameras')
    op.drop_table('face_profiles')
    op.drop_table('students')
    op.drop_table('users')
