import pytest
from datetime import datetime, timezone
import numpy as np

from backend.app.schemas.camera import CameraCreate, CameraUpdate
from backend.app.services.camera_service import CameraService, CameraNotFoundError
from backend.app.models.entities import Camera, MobilePairingSession
from sqlalchemy import select


@pytest.mark.asyncio
async def test_webcam_source_lifecycle(test_db_session):
    cam_in = CameraCreate(
        name="Lab-1 Front Webcam",
        location="Room 204",
        source_type="WEBCAM",
        device_id="dev_video_0",
        target_fps=15,
        resolution="1280x720",
        assigned_class="CSE-4A",
    )
    cam = await CameraService.create_camera(test_db_session, cam_in)
    assert cam.source_type == "WEBCAM"
    assert cam.device_id == "dev_video_0"
    assert cam.status == "OFFLINE"

    # Simulate frame received
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    await CameraService.record_frame_received(test_db_session, cam.id, frame=dummy_frame)

    # Check updated live status
    updated = await CameraService.get_camera_by_id(test_db_session, cam.id)
    assert updated.status == "STREAMING"
    assert updated.is_connected is True

    # Retrieve cached frame
    cached = CameraService.get_cached_frame(cam.id)
    assert cached is not None
    assert cached.shape == (480, 640, 3)

    # Clean up
    await CameraService.delete_camera(test_db_session, cam.id)


@pytest.mark.asyncio
async def test_mobile_pairing_and_duplicate_prevention(test_db_session):
    # 1. First QR generation -> creates 1 Camera record + 1 PairingSession
    pairing1 = await CameraService.create_or_renew_mobile_pairing(
        db=test_db_session,
        camera_name="Smartphone A",
        location="Room 201",
        assigned_class="CSE-4A",
    )
    assert pairing1.token is not None
    assert pairing1.source_type == "MOBILE"
    cam_id_1 = pairing1.camera_id

    # 2. Second QR generation for the same name and location -> MUST NOT duplicate camera record
    pairing2 = await CameraService.create_or_renew_mobile_pairing(
        db=test_db_session,
        camera_name="Smartphone A",
        location="Room 201",
        assigned_class="CSE-4A",
    )
    assert pairing2.camera_id == cam_id_1  # Reuses same camera ID!

    # Verify only 1 camera in database
    res = await test_db_session.execute(select(Camera).where(Camera.name == "Smartphone A"))
    matching_cams = res.scalars().all()
    assert len(matching_cams) == 1

    # 3. Validate pairing token
    validation = await CameraService.validate_pairing_session(test_db_session, pairing2.token)
    assert validation is not None
    cam_ent, sess_ent = validation
    assert cam_ent.id == cam_id_1
    assert sess_ent.status == "CONNECTED"

    # 4. Revoke pairing
    revoked = await CameraService.revoke_pairing(test_db_session, cam_id_1)
    assert revoked is True

    # 5. Verify validation fails after revocation
    val_after_revoke = await CameraService.validate_pairing_session(test_db_session, pairing2.token)
    assert val_after_revoke is None

    await CameraService.delete_camera(test_db_session, cam_id_1)


@pytest.mark.asyncio
async def test_rtsp_cctv_and_diagnostics(test_db_session):
    cam_in = CameraCreate(
        name="Hallway CCTV",
        location="Block 3",
        source_type="RTSP",
        stream_url="rtsp://192.168.1.50:554/live",
        target_fps=20,
        resolution="1920x1080",
    )
    cam = await CameraService.create_camera(test_db_session, cam_in)
    assert cam.source_type == "RTSP"
    assert cam.stream_url == "rtsp://192.168.1.50:554/live"

    # Diagnostic test with unreachable address
    diag = CameraService.test_camera_connection("rtsp://127.0.0.1:59999/live")
    assert diag.success is False
    assert diag.connection is False
    assert diag.status == "CAMERA ERROR"

    # Diagnostic test with dummy synthetic frame via VideoCapture index -1 or invalid
    diag_invalid = CameraService.test_camera_connection("invalid_protocol://bad")
    assert diag_invalid.success is False

    await CameraService.delete_camera(test_db_session, cam.id)


@pytest.mark.asyncio
async def test_multi_camera_independence(test_db_session):
    cam1 = await CameraService.create_camera(
        test_db_session,
        CameraCreate(name="Cam 1", location="Room A", source_type="WEBCAM"),
    )
    cam2 = await CameraService.create_camera(
        test_db_session,
        CameraCreate(name="Cam 2", location="Room B", source_type="RTSP", stream_url="rtsp://10.0.0.1"),
    )

    # Frame on Cam 1 only
    frame = np.ones((100, 100, 3), dtype=np.uint8)
    await CameraService.record_frame_received(test_db_session, cam1.id, frame=frame)

    c1 = await CameraService.get_camera_by_id(test_db_session, cam1.id)
    c2 = await CameraService.get_camera_by_id(test_db_session, cam2.id)

    assert c1.status == "STREAMING"
    assert c2.status == "OFFLINE"

    await CameraService.delete_camera(test_db_session, cam1.id)
    await CameraService.delete_camera(test_db_session, cam2.id)
