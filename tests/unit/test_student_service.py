import pytest
from backend.app.core.exceptions import StudentAlreadyExistsError, StudentNotFoundError
from backend.app.schemas.student import StudentCreate, StudentUpdate
from backend.app.services.student_service import StudentService


@pytest.mark.asyncio
async def test_create_and_get_student(test_db_session):
    payload = StudentCreate(
        student_code="STU-2026-001",
        roll_number="CSE-2026-01",
        first_name="Aarav",
        last_name="Patel",
        email="aarav.patel@campus.edu",
        department="Computer Science",
        class_name="CSE-3A",
        section="A",
        status="ACTIVE",
    )
    created = await StudentService.create_student(test_db_session, payload)
    assert created.id is not None
    assert created.student_code == "STU-2026-001"
    assert created.enrollment_status == "NOT_ENROLLED"
    assert created.sample_count == 0

    # Fetch by ID
    fetched = await StudentService.get_student_by_id(test_db_session, created.id)
    assert fetched.id == created.id
    assert fetched.first_name == "Aarav"
    assert fetched.last_name == "Patel"


@pytest.mark.asyncio
async def test_create_student_duplicate_rejection(test_db_session):
    payload1 = StudentCreate(
        student_code="STU-DUPLICATE",
        roll_number="CSE-99",
        first_name="First",
        last_name="Student",
        email="dup@campus.edu",
        department="IT",
        class_name="IT-1A",
    )
    await StudentService.create_student(test_db_session, payload1)

    # Same student_code
    payload2 = StudentCreate(
        student_code="STU-DUPLICATE",
        roll_number="CSE-100",
        first_name="Second",
        last_name="Student",
        email="dup2@campus.edu",
        department="IT",
        class_name="IT-1A",
    )
    with pytest.raises(StudentAlreadyExistsError):
        await StudentService.create_student(test_db_session, payload2)


@pytest.mark.asyncio
async def test_update_student_and_delete(test_db_session):
    payload = StudentCreate(
        student_code="STU-UPDATE-01",
        roll_number="CSE-UPDATE-01",
        first_name="Test",
        last_name="User",
        email="test.user@campus.edu",
        department="ECE",
        class_name="ECE-2A",
    )
    created = await StudentService.create_student(test_db_session, payload)

    # Update
    update_payload = StudentUpdate(first_name="UpdatedName", class_name="ECE-2B")
    updated = await StudentService.update_student(test_db_session, created.id, update_payload)
    assert updated.first_name == "UpdatedName"
    assert updated.class_name == "ECE-2B"

    # Delete
    deleted = await StudentService.delete_student(test_db_session, created.id)
    assert deleted is True

    # Confirm Not Found
    with pytest.raises(StudentNotFoundError):
        await StudentService.get_student_by_id(test_db_session, created.id)


@pytest.mark.asyncio
async def test_search_and_filter_students(test_db_session):
    for i in range(1, 6):
        await StudentService.create_student(
            test_db_session,
            StudentCreate(
                student_code=f"STU-FILTER-{i}",
                roll_number=f"ROLL-{i:03d}",
                first_name=f"Student{i}",
                last_name="Test",
                email=f"stu{i}@campus.edu",
                department="Mechanical" if i <= 3 else "Civil",
                class_name="ME-1A" if i <= 3 else "CE-1A",
            ),
        )

    # Search by term
    search_res = await StudentService.get_students(test_db_session, search="Student2")
    assert search_res.total == 1
    assert search_res.items[0].student_code == "STU-FILTER-2"

    # Filter by department
    dept_res = await StudentService.get_students(test_db_session, department="Mechanical")
    assert dept_res.total == 3

    # Stats
    stats = await StudentService.get_student_statistics(test_db_session)
    assert stats.total_students >= 5
    assert "Mechanical" in stats.departments
    assert "Civil" in stats.departments

