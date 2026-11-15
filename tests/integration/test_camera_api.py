import pytest


@pytest.mark.asyncio
async def test_camera_api_unauthorized(client):
    """Verifies that unauthenticated access to camera management endpoints is rejected."""
    resp = await client.get("/api/v1/cameras")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_camera_api_endpoints(staff_client):
    # 1. Register a Camera
    create_payload = {
        "name": "Classroom-3B Dome Camera",
        "location": "Block-C Room 302",
        "source_type": "RTSP",
        "stream_url": "rtsp://192.168.1.150:554/ch0",
        "target_fps": 15,
        "resolution": "1920x1080",
        "is_active": True,
    }
    create_resp = await staff_client.post("/api/v1/cameras", json=create_payload)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["name"] == "Classroom-3B Dome Camera"
    camera_id = data["id"]

    # 2. List Cameras
    list_resp = await staff_client.get("/api/v1/cameras?location=Block-C")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # 3. Get Camera Details
    get_resp = await staff_client.get(f"/api/v1/cameras/{camera_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == camera_id

    # 4. Update Camera
    update_resp = await staff_client.put(f"/api/v1/cameras/{camera_id}", json={"name": "Classroom-3B PTZ Pro"})
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Classroom-3B PTZ Pro"

    # 5. Test Camera Connection Diagnostic
    test_resp = await staff_client.post("/api/v1/cameras/test-connection", json={"stream_url": "rtsp://invalid-test-url:554/live"})
    assert test_resp.status_code == 200
    assert "success" in test_resp.json()

    # 6. Test Mobile Pairing Flow
    pairing_resp = await staff_client.post("/api/v1/cameras/mobile-pairing", params={"camera_id": camera_id})
    assert pairing_resp.status_code == 200
    token = pairing_resp.json()["token"]

    # 7. Validate Pairing Session
    val_resp = await staff_client.get(f"/api/v1/cameras/pairing-session/{token}")
    assert val_resp.status_code == 200
    assert val_resp.json()["valid"] is True

    # 8. Discover ONVIF
    onvif_resp = await staff_client.get("/api/v1/cameras/discover-onvif?timeout=0.5")
    assert onvif_resp.status_code == 200
    assert "cameras" in onvif_resp.json()

    # 9. Test Frame Ingestion Endpoint
    import numpy as np
    import cv2
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    files = {"file": ("frame.jpg", buf.tobytes(), "image/jpeg")}
    data = {"camera_id": camera_id, "token": token}
    frame_resp = await staff_client.post("/api/v1/cameras/mobile-frame", data=data, files=files)
    assert frame_resp.status_code == 200
    assert frame_resp.json()["camera_id"] == camera_id

    # 10. Delete Camera
    del_resp = await staff_client.delete(f"/api/v1/cameras/{camera_id}")
    assert del_resp.status_code == 204


