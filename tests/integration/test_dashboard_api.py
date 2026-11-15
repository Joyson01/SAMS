import pytest


@pytest.mark.asyncio
async def test_dashboard_api_unauthorized(client):
    """Verifies that unauthenticated access to dashboard endpoints is rejected."""
    res = await client.get("/api/v1/dashboard/summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_api_get_summary(staff_client):
    res = await staff_client.get("/api/v1/dashboard/summary")
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "total_students" in data["summary"]
    assert "present_today" in data["summary"]
    assert "upcoming_sessions" in data
    assert "today_sessions" in data
    assert "attendance_trend" in data
    assert "cameras" in data
    assert "recent_activities" in data
    assert "exceptions" in data
