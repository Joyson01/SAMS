from datetime import date
import pytest


@pytest.mark.asyncio
async def test_reports_api_unauthorized(client):
    """Verifies that unauthenticated access to reports endpoints is rejected."""
    resp = await client.get("/api/v1/reports/analytics")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reports_api_endpoints(staff_client):
    # 1. Query Analytics endpoint
    resp = await staff_client.get("/api/v1/reports/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert "overall_attendance_rate_pct" in data
    assert "total_sessions_conducted" in data
    assert "defaulters" in data
    assert "class_breakdowns" in data
    assert "daily_trends" in data

    # 2. Query CSV Export endpoint
    csv_resp = await staff_client.get("/api/v1/reports/export/csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "attachment; filename=" in csv_resp.headers["content-disposition"]
    csv_text = csv_resp.text
    assert "Record ID,Session Code,Subject" in csv_text



@pytest.mark.asyncio
async def test_report_exports_and_date_validation(staff_client):
    invalid_dates = {"start_date": "2026-11-22", "end_date": "2026-11-01"}
    for path in ("analytics", "export/csv", "export/xlsx", "export/pdf"):
        response = await staff_client.get(f"/api/v1/reports/{path}", params=invalid_dates)
        assert response.status_code == 422

    excel = await staff_client.get("/api/v1/reports/export/xlsx")
    assert excel.status_code == 200
    assert excel.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert excel.content.startswith(b"PK")
    assert excel.headers["content-disposition"].endswith('.xlsx"')

    pdf = await staff_client.get("/api/v1/reports/export/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF-")
    assert pdf.headers["content-disposition"].endswith('.pdf"')


@pytest.mark.asyncio
async def test_faculty_exports_enforce_scope_and_preserve_excel_text(client, test_db_session):
    from datetime import time
    from io import BytesIO

    from openpyxl import load_workbook

    from backend.app.core.security import hash_password
    from backend.app.models.entities import (
        AttendanceRecord,
        AttendanceSession,
        ClassSection,
        Student,
        TeacherClassAssignment,
        User,
    )

    password = "attendance-test-password"
    faculty = User(
        username="reports_teacher",
        email="reports-teacher@example.edu",
        role="FACULTY",
        full_name="Reports Teacher",
        password_hash=hash_password(password),
    )
    test_db_session.add(faculty)
    await test_db_session.flush()
    sessions = []
    for name in ("Class A", "Class B"):
        section = ClassSection(name=name, department="COMPS")
        student = Student(
            student_code=name,
            first_name=name,
            last_name="Student",
            email=f"{name.replace(' ', '').lower()}@example.edu",
            roll_number="01" if name == "Class A" else "02",
            class_name=name,
            department="COMPS",
        )
        test_db_session.add_all([section, student])
        await test_db_session.flush()
        if name == "Class A":
            test_db_session.add(TeacherClassAssignment(teacher_id=faculty.id, class_id=section.id))
        session = AttendanceSession(
            session_code=name,
            class_id=section.id,
            class_name=name,
            room="101",
            subject="Algorithms",
            start_time=time(9),
            end_time=time(10),
        )
        test_db_session.add(session)
        await test_db_session.flush()
        sessions.append(session)
        test_db_session.add(AttendanceRecord(
            student_id=student.id,
            session_id=session.id,
            remarks="=1+1",
        ))
    await test_db_session.commit()

    login = await client.post("/api/v1/auth/login", json={
        "username_or_email": faculty.username, "password": password,
    })
    assert login.status_code == 200
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    for format_name in ("csv", "xlsx", "pdf"):
        path = f"/api/v1/reports/export/{format_name}"
        denied = await client.get(path, params={"session_id": sessions[1].id})
        assert denied.status_code == 403
    excel = await client.get("/api/v1/reports/export/xlsx", params={"subject": "algorithms"})
    assert excel.status_code == 200
    workbook = load_workbook(BytesIO(excel.content), read_only=True)
    try:
        headers, row = list(workbook.active.rows)
        entries = {header.value: cell for header, cell in zip(headers, row)}
        assert entries["Class"].value == "Class A"
        assert entries["Roll Number"].value == "01"
        assert entries["Remarks"].value == "=1+1"
        assert entries["Remarks"].data_type == "s"
        assert entries["Confidence (%)"].value == 100
    finally:
        workbook.close()
