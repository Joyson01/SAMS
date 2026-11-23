from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from backend.app.core.security import require_roles, get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.database.session import get_db
from backend.app.models.entities import User
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

router = APIRouter(prefix="/classes", tags=["Classes & Sections"], dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))])


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
    user: User = Depends(get_current_user),
) -> List[ClassSectionResponse]:
    return await ClassService.list_classes(
        db=db,
        department=department,
        semester=semester,
        status=status,
        teacher_id=user.id if user.role == "FACULTY" else None,
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


from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from backend.app.models.entities import Batch, ClassSubject, Subject, Student, TimetableEntry

class BatchInput(BaseModel):
    name: str = Field(min_length=1, max_length=32, pattern=r".*\S.*")
    description: str | None = Field(None, max_length=128)

@router.get('/{class_id}/batches')
async def list_batches(class_id: str, db: AsyncSession = Depends(get_db)):
    await ClassService.get_class_by_id(db,class_id)
    return (await db.scalars(select(Batch).where(Batch.class_id == class_id).order_by(Batch.name))).all()

@router.post('/{class_id}/batches', status_code=201)
async def create_batch(class_id: str, payload: BatchInput, db: AsyncSession = Depends(get_db)):
    await ClassService.get_class_by_id(db,class_id)
    row=Batch(class_id=class_id,name=payload.name.strip(),description=payload.description)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409,'A batch with this name already exists.')
    await db.refresh(row)
    return row

@router.put('/{class_id}/batches/{batch_id}')
async def update_batch(class_id: str, batch_id: str, payload: BatchInput, db: AsyncSession = Depends(get_db)):
    row=await db.get(Batch,batch_id)
    if not row or row.class_id != class_id:
        raise HTTPException(404,'Batch not found.')
    row.name=payload.name.strip()
    row.description=payload.description
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409,'A batch with this name already exists.')
    await db.refresh(row)
    return row

@router.delete('/{class_id}/batches/{batch_id}', status_code=204)
async def delete_batch(class_id: str, batch_id: str, db: AsyncSession = Depends(get_db)):
    row=await db.get(Batch,batch_id)
    if not row or row.class_id != class_id:
        raise HTTPException(404,'Batch not found.')
    if await db.scalar(select(Student.id).where(Student.batch_id==batch_id).limit(1)) or await db.scalar(select(TimetableEntry.id).where(TimetableEntry.batch_id==batch_id).limit(1)):
        raise HTTPException(409,'Reassign students and timetable slots before deleting this batch.')
    await db.delete(row)
    await db.commit()

@router.get('/{class_id}/subjects')
async def class_subjects(class_id: str, db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Subject).join(ClassSubject).where(ClassSubject.class_id==class_id))).all()
