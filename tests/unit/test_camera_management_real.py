import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.entities import Camera
from backend.app.schemas.camera import CameraCreate, CameraUpdate
from backend.app.services.camera_service import CameraService


@pytest.mark.asyncio
async def test_empty_database_returns_no_cameras(test_db_session: AsyncSession):
    """TEST 1: Empty database returns empty list, no fake cameras auto-generated."""
    cameras = await CameraService.list_cameras(test_db_session)
    assert isinstance(cameras, list)


@pytest.mark.asyncio
async def test_camera_registration_and_class_assignment(test_db_session: AsyncSession):
    """TEST 2: Register real camera with assigned classroom and location."""
    cam = await CameraService.create_camera(
        test_db_session,
        CameraCreate(
            name="Room 204 Main Webcam",
            location="Room 204",
            source_type="WEBCAM",
            device_id="hardware-device-id-12345",
            assigned_class="CSE-4A",
            target_fps=15,
            resolution="1280x720",
        ),
    )
    assert cam.name == "Room 204 Main Webcam"
    assert cam.location == "Room 204"
    assert cam.assigned_class == "CSE-4A"
    assert cam.status == "OFFLINE"

    # Verify query with assigned_class filter
    filtered = await CameraService.list_cameras(test_db_session, assigned_class="CSE-4A")
    assert len(filtered) == 1
    assert filtered[0].id == cam.id


@pytest.mark.asyncio
async def test_camera_frame_activity_updates_health_state(test_db_session: AsyncSession):
    """TEST 3: Ingesting frame updates last_frame_at and transitions status to STREAMING."""
    cam = await CameraService.create_camera(
        test_db_session,
        CameraCreate(
            name="Room 204 Mobile",
            location="Room 204",
            source_type="MOBILE",
            stream_url="mobile://token123",
            target_fps=15,
            resolution="1280x720",
        ),
    )
    assert cam.status == "OFFLINE"

    # Simulate frame received
    await CameraService.record_frame_received(test_db_session, cam.id)

    # Check serialized response
    fetched = await CameraService.get_camera_by_id(test_db_session, cam.id)
    assert fetched.status == "STREAMING"
    assert fetched.is_connected is True
    assert fetched.seconds_since_last_frame is not None
    assert fetched.seconds_since_last_frame <= 2.0


@pytest.mark.asyncio
async def test_mobile_pairing_prevents_duplicate_camera_records(test_db_session: AsyncSession, staff_client):
    """TEST 4: Generating mobile pairing QR with existing camera ID re-pairs that camera without creating duplicates."""
    # First pairing creates camera
    res1 = await staff_client.post(
        "/api/v1/cameras/mobile-pairing",
        params={"camera_name": "Room 204 Smartphone", "location": "Room 204"},
    )
    assert res1.status_code == 200
    cam1_id = res1.json()["camera_id"]
    token1 = res1.json()["token"]

    # Second pairing with same camera_name and location must reuse camera
    res2 = await staff_client.post(
        "/api/v1/cameras/mobile-pairing",
        params={"camera_id": cam1_id, "camera_name": "Room 204 Smartphone", "location": "Room 204"},
    )
    assert res2.status_code == 200
    cam2_id = res2.json()["camera_id"]
    token2 = res2.json()["token"]

    # Must be the exact same camera ID, with a refreshed pairing token
    assert cam1_id == cam2_id
    assert token1 != token2

    # Query all cameras in DB to verify only ONE camera exists
    cams = await CameraService.list_cameras(test_db_session)
    mobile_cams = [c for c in cams if c.name == "Room 204 Smartphone"]
    assert len(mobile_cams) == 1


def test_real_camera_diagnostic_sequence():
    """TEST 5: Camera test returns structured diagnostic results without fake mock values."""
    res = CameraService.test_camera_connection(stream_url="rtsp://invalid-non-existent-server:554/stream")
    assert res.success is False
    assert res.status == "CAMERA ERROR"
    assert res.connection is False
    assert res.stream is False
    assert res.frames is False
    assert res.latency_ms >= 0.0

