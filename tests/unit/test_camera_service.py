import pytest

from backend.app.schemas.camera import CameraCreate, CameraUpdate
from backend.app.services.camera_service import CameraNotFoundError, CameraService


@pytest.mark.asyncio
async def test_camera_service_crud_lifecycle(test_db_session):
    # 1. Create Camera
    cam_in = CameraCreate(
        name="Hall-A Front CCTV",
        location="Computer Vision Lab",
        source_type="RTSP",
        stream_url="rtsp://192.168.1.100:554/stream1",
        target_fps=15,
        resolution="1280x720",
    )
    cam = await CameraService.create_camera(test_db_session, cam_in)
    assert cam.name == "Hall-A Front CCTV"
    assert cam.location == "Computer Vision Lab"
    assert cam.source_type == "RTSP"
    camera_id = cam.id

    # 2. Get Camera by ID
    fetched = await CameraService.get_camera_by_id(test_db_session, camera_id)
    assert fetched.id == camera_id
    assert fetched.name == "Hall-A Front CCTV"

    # 3. List Cameras with filter
    cameras = await CameraService.list_cameras(test_db_session, location="Vision Lab")
    assert len(cameras) >= 1

    # 4. Update Camera
    updated = await CameraService.update_camera(
        test_db_session,
        camera_id,
        CameraUpdate(name="Hall-A Front 4K PTZ", target_fps=30),
    )
    assert updated.name == "Hall-A Front 4K PTZ"
    assert updated.target_fps == 30

    # 5. Delete Camera
    deleted = await CameraService.delete_camera(test_db_session, camera_id)
    assert deleted is True

    # 6. Verify 404
    with pytest.raises(CameraNotFoundError):
        await CameraService.get_camera_by_id(test_db_session, camera_id)


def test_camera_connection_diagnostic():
    # Test invalid connection URL
    res = CameraService.test_camera_connection("rtsp://invalid-non-existent-ip:554/live")
    assert res.success is False
    assert "connect" in res.message.lower() or "error" in res.message.lower() or "failed" in res.message.lower()

