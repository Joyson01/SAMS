import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.schemas.class_section import ClassSectionCreate, ClassSectionUpdate
from backend.app.services.class_service import (
    ClassAlreadyExistsError,
    ClassNotFoundError,
    ClassService,
)


@pytest.mark.asyncio
async def test_class_crud_lifecycle(test_db_session: AsyncSession):
    # 1. Create Class Section
    cls_in = ClassSectionCreate(
        name="CSE-4A",
        department="Computer Science",
        year=4,
        semester=4,
        section="A",
        academic_year="2026-2027",
    )
    cls_sec = await ClassService.create_class(test_db_session, cls_in)
    assert cls_sec.name == "CSE-4A"
    assert cls_sec.status == "ACTIVE"
    cls_id = cls_sec.id

    # 2. Get Class by ID
    fetched = await ClassService.get_class_by_id(test_db_session, cls_id)
    assert fetched.id == cls_id
    assert fetched.name == "CSE-4A"

    # 3. List Classes
    classes = await ClassService.list_classes(test_db_session, department="Computer Science")
    assert len(classes) == 1

    # 4. Update Class
    updated = await ClassService.update_class(
        test_db_session,
        cls_id,
        ClassSectionUpdate(section="A1"),
    )
    assert updated.section == "A1"

    # 5. Delete Class
    deleted = await ClassService.delete_class(test_db_session, cls_id)
    assert deleted is True

    # 6. Verify 404
    with pytest.raises(ClassNotFoundError):
        await ClassService.get_class_by_id(test_db_session, cls_id)


@pytest.mark.asyncio
async def test_duplicate_class_rejection(test_db_session: AsyncSession):
    await ClassService.create_class(
        test_db_session,
        ClassSectionCreate(
            name="ECE-3B",
            department="Electronics",
            year=3,
            semester=3,
            section="B",
        ),
    )

    with pytest.raises(ClassAlreadyExistsError):
        await ClassService.create_class(
            test_db_session,
            ClassSectionCreate(
                name="ECE-3B",
                department="Electronics",
                year=3,
                semester=3,
                section="B",
            ),
        )

