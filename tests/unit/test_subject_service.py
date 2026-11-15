import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.schemas.subject import SubjectCreate, SubjectUpdate
from backend.app.services.subject_service import (
    SubjectAlreadyExistsError,
    SubjectNotFoundError,
    SubjectService,
)


@pytest.mark.asyncio
async def test_subject_crud_lifecycle(test_db_session: AsyncSession):
    # 1. Create Subject
    subj_in = SubjectCreate(
        code="CS401",
        name="Computer Networks",
        short_name="CN",
        department="Computer Science",
        credits=4,
        semester=4,
        academic_year="2026-2027",
    )
    subj = await SubjectService.create_subject(test_db_session, subj_in)
    assert subj.code == "CS401"
    assert subj.name == "Computer Networks"
    assert subj.status == "ACTIVE"
    subj_id = subj.id

    # 2. Get Subject by ID
    fetched = await SubjectService.get_subject_by_id(test_db_session, subj_id)
    assert fetched.id == subj_id
    assert fetched.code == "CS401"

    # 3. List Subjects with filter
    subjects = await SubjectService.list_subjects(
        test_db_session,
        department="Computer Science",
        semester=4,
    )
    assert len(subjects) == 1
    assert subjects[0].code == "CS401"

    # 4. Update Subject
    updated = await SubjectService.update_subject(
        test_db_session,
        subj_id,
        SubjectUpdate(name="Advanced Computer Networks", credits=5),
    )
    assert updated.name == "Advanced Computer Networks"
    assert updated.credits == 5

    # 5. Delete Subject
    deleted = await SubjectService.delete_subject(test_db_session, subj_id)
    assert deleted is True

    # 6. Verify 404
    with pytest.raises(SubjectNotFoundError):
        await SubjectService.get_subject_by_id(test_db_session, subj_id)


@pytest.mark.asyncio
async def test_duplicate_subject_code_rejection(test_db_session: AsyncSession):
    # 1. Create initial subject
    await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS402",
            name="Artificial Intelligence",
            department="Computer Science",
            credits=4,
            semester=4,
        ),
    )

    # 2. Duplicate code must fail with 409
    with pytest.raises(SubjectAlreadyExistsError):
        await SubjectService.create_subject(
            test_db_session,
            SubjectCreate(
                code="CS402",
                name="Another AI Course",
                department="Information Technology",
                credits=3,
                semester=5,
            ),
        )

