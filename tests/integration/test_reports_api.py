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

