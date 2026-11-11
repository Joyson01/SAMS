from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from backend.app.core.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.subject import SubjectCreate, SubjectResponse, SubjectUpdate
from backend.app.services.subject_service import SubjectService

router = APIRouter(prefix="/subjects", tags=["Academic Subjects"], dependencies=[Depends(get_current_user)])


@router.post(
    "",
    response_model=SubjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Subject",
    description="Registers a new academic subject.",
)
async def create_subject(
    subject_in: SubjectCreate,
    db: AsyncSession = Depends(get_db),
) -> SubjectResponse:
    return await SubjectService.create_subject(db, subject_in)


@router.get(
    "",
    response_model=List[SubjectResponse],
    summary="List Subjects",
    description="Retrieves registered academic subjects with filtering and search.",
)
async def list_subjects(
    department: Optional[str] = Query(None, description="Filter by department"),
    semester: Optional[int] = Query(None, description="Filter by semester"),
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, INACTIVE)"),
    search: Optional[str] = Query(None, description="Search query by code or name"),
    db: AsyncSession = Depends(get_db),
) -> List[SubjectResponse]:
    return await SubjectService.list_subjects(
        db=db,
        department=department,
        semester=semester,
        status=status,
        search=search,
    )


@router.get(
    "/{subject_id}",
    response_model=SubjectResponse,
    summary="Get Subject Details",
)
async def get_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
) -> SubjectResponse:
    return await SubjectService.get_subject_by_id(db, subject_id)


@router.put(
    "/{subject_id}",
    response_model=SubjectResponse,
    summary="Update Subject",
)
async def update_subject(
    subject_id: str,
    update_in: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> SubjectResponse:
    return await SubjectService.update_subject(db, subject_id, update_in)


@router.delete(
    "/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete / Deactivate Subject",
    description="Deletes a subject, or deactivates it if historical attendance sessions reference it.",
)
async def delete_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
):
    await SubjectService.delete_subject(db, subject_id)
    return None

