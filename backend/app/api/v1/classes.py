from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.database.session import get_db
from backend.app.schemas.class_section import (
    ClassSectionCreate,
    ClassSectionResponse,
    ClassSectionUpdate,
)
from backend.app.schemas.timetable import (
    TimetableEntryCreate,
    TimetableEntryResponse,
    TimetableEntryUpdate,
)
from backend.app.services.class_service import ClassService

router = APIRouter(prefix="/classes", tags=["Classes & Sections"])


@router.post(
    "",
    response_model=ClassSectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Class Section",
    description="Registers an academic class / section.",
)
async def create_class(
    class_in: ClassSectionCreate,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.create_class(db, class_in)


@router.get(
    "",
    response_model=List[ClassSectionResponse],
    summary="List Classes",
    description="Retrieves registered academic class sections.",
)
async def list_classes(
    department: Optional[str] = Query(None, description="Filter by department"),
    semester: Optional[int] = Query(None, description="Filter by semester"),
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, INACTIVE)"),
    db: AsyncSession = Depends(get_db),
) -> List[ClassSectionResponse]:
    return await ClassService.list_classes(
        db=db,
        department=department,
        semester=semester,
        status=status,
    )


@router.get(
    "/timetable/entries",
    response_model=List[TimetableEntryResponse],
    summary="List All Timetable Entries",
)
async def list_all_timetable_entries(
    class_id: Optional[str] = Query(None),
    day_of_week: Optional[str] = Query(None),
    scheduled_date: Optional[date] = Query(None, description="Calendar date for day-of-week and conflict detection"),
    db: AsyncSession = Depends(get_db),
) -> List[TimetableEntryResponse]:
    return await ClassService.list_timetable_entries(
        db=db,
        class_id=class_id,
        day_of_week=day_of_week,
        scheduled_date=scheduled_date,
    )


@router.put(
    "/timetable/entries/{entry_id}",
    response_model=TimetableEntryResponse,
    summary="Update Timetable Slot / Map Subject",
)
async def update_timetable_entry(
    entry_id: str,
    update_in: TimetableEntryUpdate,
    db: AsyncSession = Depends(get_db),
) -> TimetableEntryResponse:
    return await ClassService.update_timetable_entry(db, entry_id, update_in)


@router.delete(
    "/timetable/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Timetable Slot",
)
async def delete_timetable_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
):
    await ClassService.delete_timetable_entry(db, entry_id)
    return None


@router.get(
    "/timetable/current",
    response_model=Optional[TimetableEntryResponse],
    summary="Get Current Active Timetable Entry",
    description="Resolves the active timetable entry based on the current time, day, and optional room."
)
async def get_current_timetable_entry(
    room: Optional[str] = Query(None, description="Optional room context to filter"),
    db: AsyncSession = Depends(get_db),
) -> Optional[TimetableEntryResponse]:
    entry = await ClassService.resolve_current_timetable_entry(db, room=room)
    if not entry:
        raise SAMSException(status_code=404, error_code="NO_ACTIVE_CLASS", message="No active class found for the current time.")
    return entry


@router.get(
    "/{class_id}",
    response_model=ClassSectionResponse,
    summary="Get Class Details",
)
async def get_class(
    class_id: str,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.get_class_by_id(db, class_id)


@router.get(
    "/{class_id}/timetable",
    response_model=List[TimetableEntryResponse],
    summary="Get Class Timetable",
)
async def get_class_timetable(
    class_id: str,
    day_of_week: Optional[str] = Query(None),
    scheduled_date: Optional[date] = Query(None, description="Calendar date for day-of-week and conflict detection"),
    db: AsyncSession = Depends(get_db),
) -> List[TimetableEntryResponse]:
    return await ClassService.list_timetable_entries(
        db=db,
        class_id=class_id,
        day_of_week=day_of_week,
        scheduled_date=scheduled_date,
    )


@router.post(
    "/{class_id}/timetable",
    response_model=TimetableEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add Timetable Slot",
)
async def add_timetable_entry(
    class_id: str,
    entry_in: TimetableEntryCreate,
    db: AsyncSession = Depends(get_db),
) -> TimetableEntryResponse:
    entry_in.class_id = class_id
    return await ClassService.create_timetable_entry(db, entry_in)


@router.put(
    "/{class_id}",
    response_model=ClassSectionResponse,
    summary="Update Class",
)
async def update_class(
    class_id: str,
    update_in: ClassSectionUpdate,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.update_class(db, class_id, update_in)


@router.delete(
    "/{class_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Class",
)
async def delete_class(
    class_id: str,
    db: AsyncSession = Depends(get_db),
):
    await ClassService.delete_class(db, class_id)
    return None

