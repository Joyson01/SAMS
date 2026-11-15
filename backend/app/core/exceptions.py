from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class SAMSException(HTTPException):
    """Base exception for all SAMS domain errors."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            status_code=status_code,
            detail={
                "error_code": error_code,
                "message": message,
                "details": details or {},
            },
        )
        self.error_code = error_code
        self.message = message
        self.details = details or {}


class StudentNotFoundError(SAMSException):
    def __init__(self, student_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="STUDENT_NOT_FOUND",
            message=f"Student with ID '{student_id}' does not exist.",
            details={"student_id": student_id},
        )


class StudentAlreadyExistsError(SAMSException):
    def __init__(self, field_name: str, field_value: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="STUDENT_ALREADY_EXISTS",
            message=f"A student with {field_name} '{field_value}' already exists.",
            details={"field": field_name, "value": field_value},
        )


class StudentValidationError(SAMSException):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="STUDENT_VALIDATION_ERROR",
            message=message,
            details=details,
        )


class SessionNotFoundError(SAMSException):
    def __init__(self, session_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="SESSION_NOT_FOUND",
            message=f"Attendance session '{session_id}' was not found.",
            details={"session_id": session_id},
        )


class SessionAlreadyExistsError(SAMSException):
    def __init__(self, session_code: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="SESSION_ALREADY_EXISTS",
            message=f"Session with code '{session_code}' already exists.",
            details={"session_code": session_code},
        )


class SessionConflictError(SAMSException):
    def __init__(self, message: str, existing_session_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            error_code="SESSION_CONFLICT",
            message=message,
            details={"existing_session_id": existing_session_id} if existing_session_id else {},
        )


class SessionNotActiveError(SAMSException):
    def __init__(self, session_id: str, current_status: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="SESSION_NOT_ACTIVE",
            message=f"Cannot mark attendance for session '{session_id}' because its status is '{current_status}'. Only ACTIVE sessions accept attendance.",
            details={"session_id": session_id, "current_status": current_status},
        )


class RecordNotFoundError(SAMSException):
    def __init__(self, record_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="RECORD_NOT_FOUND",
            message=f"Attendance record '{record_id}' was not found.",
            details={"record_id": record_id},
        )

