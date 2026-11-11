from fastapi import APIRouter, Depends, status
from backend.app.core.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.dashboard import DashboardSummaryResponse
from backend.app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"], dependencies=[Depends(get_current_user)])


@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Consolidated Dashboard Summary",
    description="Returns aggregate real-time metrics for students, attendance, active sessions, upcoming classes, camera statuses, exceptions, and recent activities.",
)
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
) -> DashboardSummaryResponse:
    return await DashboardService.get_dashboard_summary(db)
