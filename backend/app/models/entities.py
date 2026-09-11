import uuid
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator, JSON

from backend.app.database.base import Base

# Universal JSON column type supporting both SQLite and PostgreSQL
JSON_TYPE = JSON().with_variant(JSONB, "postgresql")

# Universal UUID column type supporting both SQLite (as string) and PostgreSQL (as native UUID)
class GUID(TypeDecorator):
    """Platform-independent GUID type."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(value)


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="FACULTY", nullable=False)  # ADMIN, FACULTY, OPERATOR, STUDENT
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    sessions = relationship("AttendanceSession", back_populates="creator")
    audit_logs = relationship("AuditLog", back_populates="user")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    student_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    roll_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(64), nullable=False)
    last_name: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    department: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    class_name: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    section: Mapped[str] = mapped_column(String(16), default="A", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", index=True, nullable=False)
    enrollment_status: Mapped[str] = mapped_column(String(32), default="NOT_ENROLLED", index=True, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    face_profiles = relationship("FaceProfile", back_populates="student", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="student", cascade="all, delete-orphan")


class FaceProfile(Base):
    __tablename__ = "face_profiles"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    student_id: Mapped[str] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    # Stored as serialized JSON list of floats for broad database compatibility
    embedding_data: Mapped[List[float]] = mapped_column(JSON_TYPE, nullable=False)
    model_name: Mapped[str] = mapped_column(String(64), default="ArcFace-ResNet50", nullable=False)
    model_version: Mapped[str] = mapped_column(String(32), default="1.0.0", nullable=False)
    quality_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    pose_type: Mapped[str] = mapped_column(String(32), default="FRONT", nullable=False)  # FRONT, LEFT_15, RIGHT_15, TILT_UP, TILT_DOWN, GLASSES
    image_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    image_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    student = relationship("Student", back_populates="face_profiles")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)  # e.g. 24CSPC501C
    name: Mapped[str] = mapped_column(String(128), nullable=False)                          # e.g. Theoretical Computer Science
    short_name: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)          # e.g. TCS
    vertical: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True) # PCC, PEC, MDM, OE, VSEC
    department: Mapped[str] = mapped_column(String(64), index=True, nullable=False)        # e.g. Computer Engineering
    
    # Contact Hours
    theory_hours: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tutorial_hours: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    practical_hours: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Credits Allotted
    theory_credits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tutorial_credits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    practical_credits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=4, nullable=False)                # Total Credits

    semester: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    academic_year: Mapped[str] = mapped_column(String(32), default="2026-2027", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", index=True, nullable=False)  # ACTIVE, INACTIVE
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    sessions = relationship("AttendanceSession", back_populates="subject_entity")
    class_subjects = relationship("ClassSubject", back_populates="subject", cascade="all, delete-orphan")


class ClassSection(Base):
    __tablename__ = "classes"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)  # e.g. TE-B
    department: Mapped[str] = mapped_column(String(64), index=True, nullable=False)         # e.g. Computer Engineering
    effective_from: Mapped[Optional[str]] = mapped_column(String(32), default="15/06/2026", nullable=True)
    year: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    semester: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    section: Mapped[str] = mapped_column(String(16), default="B", nullable=False)
    academic_year: Mapped[str] = mapped_column(String(32), default="2026-2027", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    class_subjects = relationship("ClassSubject", back_populates="class_section", cascade="all, delete-orphan")
    timetable_entries = relationship("TimetableEntry", back_populates="class_section", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="class_section", cascade="all, delete-orphan")


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    class_id: Mapped[str] = mapped_column(GUID, ForeignKey("classes.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # e.g. "B1", "B2"
    description: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("class_id", "name", name="uq_class_batch_name"),
    )

    class_section = relationship("ClassSection", back_populates="batches")


class ClassSubject(Base):
    __tablename__ = "class_subjects"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    class_id: Mapped[str] = mapped_column(GUID, ForeignKey("classes.id", ondelete="CASCADE"), index=True, nullable=False)
    subject_id: Mapped[str] = mapped_column(GUID, ForeignKey("subjects.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("class_id", "subject_id", name="uq_class_subject"),
    )

    class_section = relationship("ClassSection", back_populates="class_subjects")
    subject = relationship("Subject", back_populates="class_subjects")


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    class_id: Mapped[str] = mapped_column(GUID, ForeignKey("classes.id", ondelete="CASCADE"), index=True, nullable=False)
    subject_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("subjects.id", ondelete="SET NULL"), index=True, nullable=True)
    batch_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("batches.id", ondelete="SET NULL"), nullable=True)
    day_of_week: Mapped[str] = mapped_column(String(16), index=True, nullable=False)  # Monday, Tuesday, Wednesday, Thursday, Friday
    start_time: Mapped[str] = mapped_column(String(16), nullable=False)  # e.g. "09:00", "10:00"
    end_time: Mapped[str] = mapped_column(String(16), nullable=False)    # e.g. "10:00", "11:00"
    entry_type: Mapped[str] = mapped_column(String(32), default="SUBJECT", index=True, nullable=False)  # SUBJECT, ACTIVITY, BREAK
    label: Mapped[str] = mapped_column(String(128), nullable=False)      # e.g. "TCS-DM", "LUNCH BREAK", "Mentoring", "MDM - PG CR 26"
    batch: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # e.g. "B1", "B2", "ALL"
    room: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)   # e.g. "CR 26", "L5", "L4", "L6", "L1", "SL"
    effective_from: Mapped[Optional[str]] = mapped_column(String(32), default="15/06/2026", nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    class_section = relationship("ClassSection", back_populates="timetable_entries")
    subject = relationship("Subject")
    batch_entity = relationship("Batch")


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    session_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    timetable_entry_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("timetable_entries.id", ondelete="SET NULL"), nullable=True)
    subject_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("subjects.id", ondelete="SET NULL"), index=True, nullable=True)
    class_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("classes.id", ondelete="SET NULL"), index=True, nullable=True)
    class_name: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(128), nullable=False)
    room: Mapped[str] = mapped_column(String(32), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, default=date.today, index=True, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    late_threshold_minutes: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    attendance_mode: Mapped[str] = mapped_column(String(32), default="AI_FACE_RECOGNITION", nullable=False)  # AI_FACE_RECOGNITION, MANUAL
    status: Mapped[str] = mapped_column(String(32), default="SCHEDULED", index=True, nullable=False)  # SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED
    created_by_user_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    camera_id: Mapped[Optional[str]] = mapped_column(GUID, nullable=True)
    camera_ids: Mapped[List[str]] = mapped_column(JSON_TYPE, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        Index('ix_session_class_date_status', 'class_name', 'scheduled_date', 'status'),
    )

    # Relationships
    creator = relationship("User", back_populates="sessions")
    subject_entity = relationship("Subject", back_populates="sessions")
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(GUID, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    student_id: Mapped[str] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PRESENT", index=True, nullable=False)  # PRESENT, LATE, ABSENT, EXCUSED, MANUAL_PRESENT, MANUAL_ABSENT, MANUAL_EXCUSED
    source: Mapped[str] = mapped_column(String(32), default="AI", nullable=False)  # AI, MANUAL
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    track_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    camera_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    liveness_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    verification_metadata: Mapped[Dict[str, Any]] = mapped_column(JSON_TYPE, default=dict, nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    marked_by_user_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student_attendance"),
    )

    # Relationships
    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("Student", back_populates="attendance_records")
    camera = relationship("Camera", back_populates="attendance_records")


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str] = mapped_column(String(128), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), default="WEBCAM", nullable=False)  # WEBCAM, MOBILE, RTSP
    device_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)  # Physical hardware device ID
    stream_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="OFFLINE", nullable=False)  # CONNECTED, STREAMING, RECONNECTING, NO_FRAME, OFFLINE, ERROR
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    target_fps: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    resolution: Mapped[str] = mapped_column(String(32), default="1280x720", nullable=False)
    assigned_class: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # e.g. CSE-4A for auto-session selection
    detection_zone: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON_TYPE, nullable=True)  # Optional bounding polygon
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_frame_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    attendance_records = relationship("AttendanceRecord", back_populates="camera")
    recognition_events = relationship("RecognitionEvent", back_populates="camera")
    pairing_sessions = relationship("MobilePairingSession", back_populates="camera", cascade="all, delete-orphan")


class MobilePairingSession(Base):
    __tablename__ = "mobile_pairing_sessions"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    camera_id: Mapped[str] = mapped_column(GUID, ForeignKey("cameras.id", ondelete="CASCADE"), index=True, nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True, nullable=False)  # PENDING, CONNECTED, EXPIRED, REVOKED, DISCONNECTED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    disconnected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    camera = relationship("Camera", back_populates="pairing_sessions")


class RecognitionEvent(Base):
    __tablename__ = "recognition_events"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    event_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    camera_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    track_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    candidate_student_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("students.id", ondelete="SET NULL"), nullable=True)
    decision: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # KNOWN, UNKNOWN, UNCERTAIN
    similarity: Mapped[float] = mapped_column(Float, nullable=False)
    liveness_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    bbox_coordinates: Mapped[List[float]] = mapped_column(JSON_TYPE, default=list, nullable=False)
    snapshot_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    camera = relationship("Camera", back_populates="recognition_events")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)  # CREATE, UPDATE, DELETE, MANUAL_OVERRIDE, RE_ENROLL, LOGIN
    entity_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    old_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON_TYPE, nullable=True)
    new_values: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON_TYPE, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)

    # Relationships
    user = relationship("User", back_populates="audit_logs")


class PresenceEvent(Base):
    __tablename__ = "presence_events"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(GUID, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    student_id: Mapped[str] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # FIRST_SEEN, VISIBLE, TEMPORARILY_NOT_VISIBLE, RETURNED
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    camera_id: Mapped[Optional[str]] = mapped_column(GUID, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SyncQueue(Base):
    __tablename__ = "sync_queue"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    event_uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)  # ATTENDANCE_EVENT, RECOGNITION_EVENT
    payload: Mapped[Dict[str, Any]] = mapped_column(JSON_TYPE, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True, nullable=False)  # PENDING, SYNCED, CONFLICT, FAILED
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[Optional[Text]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class MediaProcessingJob(Base):
    __tablename__ = "media_processing_jobs"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(GUID, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    media_type: Mapped[str] = mapped_column(String(16), nullable=False)  # IMAGE, VIDEO
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_sec: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    resolution: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", index=True, nullable=False)  # QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    frames_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    frames_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    faces_detected_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recognized_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unknown_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uncertain_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attendance_marked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON_TYPE, nullable=True)
    error_message: Mapped[Optional[Text]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    session = relationship("AttendanceSession")



class AttendanceAnomaly(Base):
    __tablename__ = "attendance_anomalies"

    id: Mapped[str] = mapped_column(GUID, primary_key=True, default=generate_uuid)
    session_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=True)
    student_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=True)
    anomaly_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="WARNING", nullable=False)  # LOW, WARNING, CRITICAL
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_by_user_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    session = relationship("AttendanceSession")
    student = relationship("Student")
