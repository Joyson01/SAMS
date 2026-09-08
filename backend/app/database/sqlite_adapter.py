"""
SQLite Direct Database Adapter for JOJIPA-SAMS.
Provides thread-safe direct SQLite operations for low-latency frame-by-frame lookups,
presence verification, and attendance marking with structured logging.
"""

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("jojipa_sams.sqlite_adapter")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sams_dev.db"


def get_db_path() -> Path:
    return DB_PATH


def _get_connection() -> sqlite3.Connection:
    """Returns a direct SQLite connection to the primary database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_all_students() -> Dict[str, str]:
    """
    Returns a mapping of student identifier (ID or student_code) -> Full Name.
    Keyed by both student UUID and student_code for maximum compatibility.
    """
    mapping: Dict[str, str] = {}
    if not DB_PATH.is_file():
        return mapping

    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, student_code, first_name, last_name FROM students WHERE status = 'ACTIVE' OR status IS NULL")
        for row in cursor.fetchall():
            s_id = str(row["id"])
            s_code = str(row["student_code"]) if row["student_code"] else ""
            full_name = f"{row['first_name']} {row['last_name']}".strip()
            mapping[s_id] = full_name
            if s_code:
                mapping[s_code] = full_name
        conn.close()
    except Exception as e:
        logger.warning(f"Error querying student list from SQLite: {e}")

    return mapping


def get_student_details(identifier: str) -> Optional[Dict[str, Any]]:
    """Fetches student record by ID or student_code."""
    if not DB_PATH.is_file():
        return None

    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, student_code, roll_number, first_name, last_name, class_name FROM students WHERE id = ? OR student_code = ?",
            (identifier, identifier),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "id": str(row["id"]),
                "student_code": str(row["student_code"]),
                "roll_number": str(row["roll_number"]),
                "name": f"{row['first_name']} {row['last_name']}".strip(),
                "class_name": str(row["class_name"]),
            }
    except Exception as e:
        logger.warning(f"Error fetching student details for '{identifier}': {e}")

    return None


def is_marked_present(student_id: str, session_id: str) -> bool:
    """Checks whether a student is already marked for this session."""
    if not DB_PATH.is_file() or not session_id:
        return False

    try:
        conn = _get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM students WHERE id = ? OR student_code = ?", (student_id, student_id))
        st_row = cursor.fetchone()
        resolved_st_id = str(st_row["id"]) if st_row else student_id

        cursor.execute(
            "SELECT id, status FROM attendance_records WHERE session_id = ? AND student_id = ?",
            (session_id, resolved_st_id),
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return False
            
        return str(row["status"]).upper() in ["PRESENT", "MANUAL_PRESENT", "EXCUSED", "MANUAL_EXCUSED"]
    except Exception as e:
        logger.warning(f"Error checking attendance presence: {e}")
        return False


def mark_attendance(
    student_id: str,
    session_id: str,
    status: str = "PRESENT",
    confidence: float = 1.0,
    source: str = "MEDIA_IMAGE",
    remarks: str = "Marked via InsightFace Recognition",
) -> Dict[str, Any]:
    """Marks attendance record for a student in a session with duplicate protection."""
    if not DB_PATH.is_file() or not session_id:
        return {"success": False, "error": "Database not initialized or invalid session"}

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        conn = _get_connection()
        cursor = conn.cursor()

        # Resolve student ID
        cursor.execute("SELECT id, first_name, last_name, student_code, roll_number FROM students WHERE id = ? OR student_code = ?", (student_id, student_id))
        st_row = cursor.fetchone()
        if not st_row:
            conn.close()
            return {"success": False, "error": f"Student '{student_id}' not found"}

        resolved_st_id = str(st_row["id"])
        st_name = f"{st_row['first_name']} {st_row['last_name']}".strip()

        # Check existing attendance record
        cursor.execute(
            "SELECT id, status FROM attendance_records WHERE session_id = ? AND student_id = ?",
            (session_id, resolved_st_id),
        )
        existing = cursor.fetchone()
        if existing:
            existing_status = existing["status"]
            # Upgrade status to PRESENT if previously REVIEW_REQUIRED
            if existing_status == "REVIEW_REQUIRED" and status == "PRESENT":
                cursor.execute(
                    "UPDATE attendance_records SET status = ?, last_seen = ?, confidence = ?, updated_at = ? WHERE id = ?",
                    (status, now_iso, float(confidence), now_iso, existing["id"]),
                )
            else:
                cursor.execute(
                    "UPDATE attendance_records SET last_seen = ?, confidence = MAX(confidence, ?), updated_at = ? WHERE id = ?",
                    (now_iso, float(confidence), now_iso, existing["id"]),
                )
            conn.commit()
            conn.close()
            return {
                "success": True,
                "alreadyPresent": True,
                "attendanceMarked": False,
                "studentId": resolved_st_id,
                "studentName": st_name,
            }

        rec_id = str(uuid.uuid4())
        meta_json = json.dumps({
            "source": source,
            "confidence": float(confidence),
            "engine": "insightface_buffalo_l",
            "timestamp": now_iso,
        })
        cursor.execute(
            """
            INSERT INTO attendance_records
            (id, session_id, student_id, status, source, first_seen, last_seen, confidence, liveness_score, verification_metadata, remarks, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec_id,
                session_id,
                resolved_st_id,
                status,
                source,
                now_iso,
                now_iso,
                float(confidence),
                1.0,
                meta_json,
                remarks,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        return {
            "success": True,
            "alreadyPresent": False,
            "attendanceMarked": True,
            "studentId": resolved_st_id,
            "studentName": st_name,
        }
    except Exception as e:
        logger.error(f"Error marking attendance: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
