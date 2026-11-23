from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.core.security import get_current_user, require_roles
from backend.app.core.teacher_access import require_session_access
from backend.app.database.session import get_db
from backend.app.models.entities import User
from backend.app.schemas.reports import InstitutionAnalyticsResponse
from backend.app.services.report_service import (
    ReportService,
    attendance_csv,
    attendance_pdf,
    attendance_xlsx,
)

router = APIRouter(
    prefix="/reports",
    tags=["Reporting & Analytics"],
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)

EXPORT_FORMATS = {
    "csv": ("text/csv", attendance_csv),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", attendance_xlsx),
    "pdf": ("application/pdf", attendance_pdf),
}


def validate_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "Start date must be on or before end date.")


@router.get(
    "/analytics",
    response_model=InstitutionAnalyticsResponse,
    summary="Get Institutional Attendance Analytics",
)
@router.get(
    "/summary",
    response_model=InstitutionAnalyticsResponse,
    summary="Get Institutional Attendance Analytics Summary Alias",
)
async def get_analytics(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    department: str | None = Query(None),
    class_name: str | None = Query(None),
    subject: str | None = Query(None, max_length=128),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InstitutionAnalyticsResponse:
    validate_date_range(start_date, end_date or date.today())
    return await ReportService.get_institution_analytics(
        db=db,
        start_date=start_date,
        end_date=end_date,
        department=department,
        class_name=class_name,
        subject=subject.strip() if subject else None,
        teacher_id=user.id if user.role == "FACULTY" else None,
    )


@router.get("/export/{file_format}", summary="Export attendance records")
async def export_attendance(
    file_format: Literal["csv", "xlsx", "pdf"],
    session_id: str | None = Query(None),
    class_name: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    subject: str | None = Query(None, max_length=128),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    validate_date_range(start_date, end_date)
    if session_id:
        await require_session_access(db, user, session_id)
    rows = await ReportService.get_attendance_export_rows(
        db=db,
        session_id=session_id,
        class_name=class_name,
        start_date=start_date,
        end_date=end_date,
        subject=subject.strip() if subject else None,
        teacher_id=user.id if user.role == "FACULTY" else None,
    )
    media_type, render = EXPORT_FORMATS[file_format]
    filename = f"attendance_report_{date.today().isoformat()}.{file_format}"
    return Response(
        content=await run_in_threadpool(render, rows),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
