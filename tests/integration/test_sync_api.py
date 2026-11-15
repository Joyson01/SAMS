import uuid
import pytest


@pytest.mark.asyncio
async def test_sync_api_unauthorized(client):
    """Verifies that unauthenticated access to sync endpoints is rejected."""
    resp = await client.get("/api/v1/sync/status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_sync_api_endpoints(staff_client):
    # 1. Query Sync Status
    status_resp = await staff_client.get("/api/v1/sync/status")
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert "pending_count" in data
    assert "synced_count" in data

    # 2. Query Pull Delta
    pull_resp = await staff_client.get("/api/v1/sync/pull")
    assert pull_resp.status_code == 200
    assert "students" in pull_resp.json()
    assert "sessions" in pull_resp.json()

    # 3. Test Push Batch
    evt_uuid = str(uuid.uuid4())
    push_payload = {
        "client_id": "rpi-camera-node-02",
        "events": [
            {
                "event_uuid": evt_uuid,
                "event_type": "RECOGNITION_TELEMETRY",
                "payload": {"fps": 15.2, "faces_detected": 2},
            }
        ],
    }
    push_resp = await staff_client.post("/api/v1/sync/push", json=push_payload)
    assert push_resp.status_code == 200
    assert push_resp.json()["synced_count"] == 1

    # 4. Test Trigger Sync Flush
    trigger_resp = await staff_client.post("/api/v1/sync/trigger")
    assert trigger_resp.status_code == 200
    assert trigger_resp.json()["status"] == "success"

