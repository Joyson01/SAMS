import io

import pytest
from openpyxl import Workbook


HEADER = "student_code,roll_number,first_name,last_name,email,department,class_name\n"
ROW = "CS001,001,Demo,Student,demo@example.com,CS,CS-A\n"


@pytest.mark.asyncio
async def test_import_preview_validation_and_safe_retry(staff_client):
    client = staff_client
    section = await client.post("/api/v1/classes", json={"name": "CS-A", "department": "CS"})
    assert section.status_code == 201

    async def upload(csv, *, dry_run):
        response = await client.post(
            "/api/v1/students/import-roster", params={"dry_run": dry_run},
            files={"file": ("roster.csv", csv, "text/csv")},
        )
        assert response.status_code == 200, response.text
        return response.json()

    preview = await upload(HEADER + ROW, dry_run=True)
    assert preview == {"ready": 1, "imported": 0, "errors": []}
    invalid = await upload(HEADER + ROW + ROW, dry_run=False)
    assert invalid["imported"] == 0
    assert invalid["errors"][0]["row"] == 3
    assert (await client.get("/api/v1/students")).json()["total"] == 0

    imported = await upload(HEADER + ROW, dry_run=False)
    assert imported == {"ready": 1, "imported": 1, "errors": []}
    retry = await upload(HEADER + ROW, dry_run=False)
    assert retry["imported"] == 0 and retry["errors"][0]["row"] == 2
    assert (await client.get("/api/v1/students")).json()["total"] == 1



@pytest.mark.asyncio
async def test_excel_roster_uses_first_sheet_and_rejects_formulas(staff_client):
    client = staff_client
    assert (await client.post("/api/v1/classes", json={"name": "CS-A", "department": "CS"})).status_code == 201
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADER.strip().split(","))
    sheet.append(ROW.strip().split(","))

    async def upload():
        data = io.BytesIO()
        workbook.save(data)
        return await client.post("/api/v1/students/import-roster", files={
            "file": ("students.xlsx", data.getvalue()),
        })

    response = await upload()
    assert response.status_code == 200, response.text
    assert response.json() == {"ready": 1, "imported": 0, "errors": []}
    sheet["B2"] = "=1+1"
    assert (await upload()).status_code == 422
