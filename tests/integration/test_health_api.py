import pytest


@pytest.mark.asyncio
async def test_root_endpoint(client):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert ("AttedDEL" in data["name"] or "SAMS" in data["name"])
    assert data["version"] == "1.0.0"
    assert "/api/v1/health" in data["health_url"]


@pytest.mark.asyncio
async def test_top_level_health_endpoint(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "database" in data
    assert "status" in data["database"]


@pytest.mark.asyncio
async def test_api_v1_health_endpoint(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "database" in data
    assert "system_info" in data
    assert data["database"]["status"] in ["connected", "disconnected"]


@pytest.mark.asyncio
async def test_api_v1_ping_endpoint(client):
    response = await client.get("/api/v1/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["message"] == "pong"

