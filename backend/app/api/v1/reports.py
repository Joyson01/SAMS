from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from backend.app.core.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.reports import InstitutionAnalyticsResponse
from backend.app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reporting & Analytics"], dependencies=[Depends(get_current_user)])


@router.get(
    "/analytics",
    response_model=InstitutionAnalyticsResponse,
    summary="Get Institutional Attendance Analytics",
    description="Aggregates overall attendance rate, class breakdowns, daily trends, and defaulter student alerts.",
)
@router.get(
    "/summary",
    response_model=InstitutionAnalyticsResponse,
    summary="Get Institutional Attendance Analytics Summary Alias",
    description="Alias endpoint for institutional attendance summary and analytics.",
)
async def get_analytics(
    start_date: Optional[date] = Query(None, description="Start date for reporting window"),
    end_date: Optional[date] = Query(None, description="End date for reporting window"),
    department: Optional[str] = Query(None, description="Filter by department"),
    class_name: Optional[str] = Query(None, description="Filter by class/batch"),
    db: AsyncSession = Depends(get_db),
) -> InstitutionAnalyticsResponse:
    return await ReportService.get_institution_analytics(
        db=db,
        start_date=start_date,
        end_date=end_date,
        department=department,
        class_name=class_name,
    )


@router.get(
    "/export/csv",
    summary="Export Attendance Records to CSV",
    description="Generates and downloads a standardized CSV file of attendance records.",
)
async def export_attendance_csv(
    session_id: Optional[str] = Query(None, description="Filter by specific session ID"),
    class_name: Optional[str] = Query(None, description="Filter by class/batch"),
    start_date: Optional[date] = Query(None, description="Filter by start date"),
    end_date: Optional[date] = Query(None, description="Filter by end date"),
    db: AsyncSession = Depends(get_db),
):
    csv_content = await ReportService.export_attendance_csv(
        db=db,
        session_id=session_id,
        class_name=class_name,
        start_date=start_date,
        end_date=end_date,
    )
    filename = f"attendance_report_{date.today().isoformat()}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

