from backend.app.core.security import require_roles
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import cv2
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from backend.app.core.security import authenticate_staff_socket, get_current_user
from fastapi.responses import StreamingResponse
import numpy as np
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import AsyncSessionLocal, get_db
from backend.app.models.entities import Camera
from backend.app.schemas.camera import (
    CameraCreate,
    CameraResponse,
    CameraTestResult,
    CameraUpdate,
    MobilePairingResponse,
    ONVIFDiscoveryResponse,
)
from backend.app.services.camera_service import CameraNotFoundError, CameraService

router = APIRouter(prefix="/cameras", tags=["Camera Management"])


@router.post(
    "",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Camera",
    description="Registers a new camera device (Hardware Webcam, Mobile, CCTV / RTSP, or Video File).",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def create_camera(
    camera_in: CameraCreate,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.create_camera(db, camera_in)


@router.get(
    "",
    response_model=List[CameraResponse],
    summary="List Cameras",
    description="Lists all registered cameras with filtering by location, active status, or assigned class.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def list_cameras(
    location: Optional[str] = Query(None, description="Filter by location/room"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    assigned_class: Optional[str] = Query(None, description="Filter by assigned class"),
    db: AsyncSession = Depends(get_db),
) -> List[CameraResponse]:
    return await CameraService.list_cameras(db, location=location, is_active=is_active, assigned_class=assigned_class)


@router.get(
    "/discover-onvif",
    response_model=ONVIFDiscoveryResponse,
    summary="Discover ONVIF IP Cameras",
    description="Probes the local area network subnet for discoverable ONVIF IP cameras using WS-Discovery.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def discover_onvif(
    timeout: float = Query(1.5, ge=0.5, le=5.0, description="Probe timeout in seconds"),
) -> ONVIFDiscoveryResponse:
    return CameraService.discover_onvif_cameras(timeout_sec=timeout)


@router.post(
    "/mobile-pairing",
    response_model=MobilePairingResponse,
    summary="Generate Mobile Camera Pairing Token (POST)",
    description="Generates or renews a QR pairing session for smartphone video streaming.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
@router.get(
    "/mobile-pairing",
    response_model=MobilePairingResponse,
    summary="Generate Mobile Camera Pairing Token (GET)",
    description="Generates or renews a QR pairing session for smartphone video streaming.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def create_mobile_pairing(
    camera_id: Optional[str] = Query(None, description="Existing camera ID to renew pairing for"),
    camera_name: str = Query("Mobile Phone Camera", description="Display name for newly created mobile camera"),
    location: str = Query("Classroom", description="Physical location or room name"),
    assigned_class: Optional[str] = Query(None, description="Class assigned to this camera"),
    db: AsyncSession = Depends(get_db),
) -> MobilePairingResponse:
    return await CameraService.create_or_renew_mobile_pairing(
        db=db,
        camera_id=camera_id,
        camera_name=camera_name,
        location=location,
        assigned_class=assigned_class,
    )


@router.get(
    "/pairing-session/{token}",
    summary="Validate Mobile Pairing Session",
    description="Verifies a mobile QR pairing token and returns camera metadata for the smartphone capture station.",
)
async def get_pairing_session(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await CameraService.validate_pairing_session(db, token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pairing session is invalid, expired, or was revoked by administrator.",
        )
    camera, session = result
    return {
        "valid": True,
        "camera_id": camera.id,
        "camera_name": camera.name,
        "location": camera.location,
        "assigned_class": camera.assigned_class,
        "target_fps": camera.target_fps,
        "resolution": camera.resolution,
        "session_status": session.status,
    }


@router.get(
    "/{camera_id}",
    response_model=CameraResponse,
    summary="Get Camera Details",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def get_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.get_camera_by_id(db, camera_id)


@router.put(
    "/{camera_id}",
    response_model=CameraResponse,
    summary="Update Camera",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def update_camera(
    camera_id: str,
    update_in: CameraUpdate,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.update_camera(db, camera_id, update_in)


@router.delete(
    "/{camera_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Camera",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def delete_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    await CameraService.delete_camera(db, camera_id)
    return None


@router.get(
    "/{camera_id}/test",
    response_model=CameraTestResult,
    summary="Test Registered Camera Feed (GET)",
    description="Runs a real diagnostic test on a registered camera by its ID.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
@router.post(
    "/{camera_id}/test",
    response_model=CameraTestResult,
    summary="Test Registered Camera Feed (POST)",
    description="Runs a real diagnostic test on a registered camera by its ID.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def test_registered_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
) -> CameraTestResult:
    cam_model = await db.get(Camera, camera_id)
    if not cam_model:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return await asyncio.to_thread(CameraService.test_camera_connection, stream_url=cam_model.stream_url, device_id=cam_model.device_id)


class CameraTestInput(BaseModel):
    stream_url: Optional[str] = None
    device_id: Optional[str] = None


@router.post(
    "/test-connection",
    response_model=CameraTestResult,
    summary="Test Camera Connectivity",
    description="Performs an immediate real camera handshake test and returns measured latency, FPS, resolution, and detector validation.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def test_connection(
    payload: Optional[CameraTestInput] = Body(default=None),
) -> CameraTestResult:
    stream_url = payload.stream_url if payload else None
    device_id = payload.device_id if payload else None
    return await asyncio.to_thread(CameraService.test_camera_connection, stream_url=stream_url, device_id=device_id)


@router.post(
    "/{camera_id}/start",
    summary="Start Camera Worker",
    description="Starts the background RTSP capture worker for continuous frame ingestion.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def start_camera_worker(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    camera = await CameraService.get_camera_by_id(db, camera_id)
    if not camera.stream_url:
        raise HTTPException(status_code=400, detail="Camera has no stream_url configured.")
    CameraService.start_camera_worker(camera.id, camera.stream_url, name=camera.name)
    return {"status": "started", "camera_id": camera_id}


@router.post(
    "/{camera_id}/stop",
    summary="Stop Camera Worker",
    description="Stops background RTSP capture worker.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def stop_camera_worker(camera_id: str):
    CameraService.stop_camera_worker(camera_id)
    return {"status": "stopped", "camera_id": camera_id}


@router.get(
    "/{camera_id}/frame",
    summary="Get Camera Latest Frame",
    description="Returns the latest decoded image frame as a JPEG image for browser preview.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
@router.get(
    "/{camera_id}/preview",
    summary="Get Camera Latest Frame Snapshot",
    description="Returns the latest decoded image frame as a JPEG buffer for web preview.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def get_camera_frame(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    # Try zero-copy compressed JPEG cache first
    cached_jpeg = CameraService.get_cached_jpeg(camera_id)
    if cached_jpeg is not None:
        return Response(content=cached_jpeg, media_type="image/jpeg")

    cam_model = await db.get(Camera, camera_id)
    frame = await asyncio.to_thread(CameraService.capture_camera_frame, camera_id, camera_obj=cam_model)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No live video frame currently available for this camera. Verify camera stream is running.",
        )
    ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to encode JPEG preview.")
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")


@router.post(
    "/{camera_id}/capture",
    summary="Capture Frame From Camera",
    description="Captures the latest high-resolution frame from the camera stream, saves it to outputs/, and returns the image URL.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def capture_camera_frame_endpoint(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from pathlib import Path
    cam_model = await db.get(Camera, camera_id)
    if not cam_model:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")

    frame = await asyncio.to_thread(CameraService.capture_camera_frame, camera_id, camera_obj=cam_model)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not capture frame from camera '{cam_model.name}'. Ensure IP Camera or stream is accessible at '{cam_model.stream_url}'.",
        )

    h, w = frame.shape[:2]
    out_id = uuid.uuid4().hex[:8]
    filename = f"capture_{out_id}.jpg"
    
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    outputs_dir = project_root / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    out_path = outputs_dir / filename
    cv2.imwrite(str(out_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])

    return {
        "success": True,
        "camera_id": camera_id,
        "camera_name": cam_model.name,
        "frame_url": f"/outputs/{filename}",
        "width": w,
        "height": h,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/{camera_id}/mjpeg",
    summary="Get Live MJPEG Video Stream",
    description="Streams real-time multipart/x-mixed-replace JPEG frames for live browser CCTV/RTSP viewing.",
    dependencies=[Depends(require_roles("ADMIN", "FACULTY", "OPERATOR"))],
)
async def get_camera_mjpeg_stream(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    async def mjpeg_generator():
        # Yield initial frame to immediately establish HTTP multipart streaming connection
        cached_bytes = CameraService.get_cached_jpeg(camera_id)
        if cached_bytes is None:
            blank = np.zeros((360, 480, 3), dtype=np.uint8)
            ret, jpeg = cv2.imencode(".jpg", blank, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
            cached_bytes = jpeg.tobytes() if ret else None

        if cached_bytes:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + cached_bytes + b"\r\n"
            )

        while True:
            jpeg_bytes = CameraService.get_cached_jpeg(camera_id)
            if jpeg_bytes is not None:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
            await asyncio.sleep(0.066)  # ~15 FPS

    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.websocket("/{camera_id}/mobile-uplink")
async def mobile_camera_websocket_uplink(
    websocket: WebSocket,
    camera_id: str,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
):
    """Real-time binary frame ingestion transport over WebSocket from phone browser."""
    await websocket.accept()
    import json

    # Validate pairing and set camera streaming
    async with AsyncSessionLocal() as db:
        valid = await CameraService.validate_pairing_session(db, token) if token else None
        if not valid or valid[0].id != camera_id or session_id:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Use a valid camera pairing link. For attendance, pair from the open session.",
            }))
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        valid[0].status = "STREAMING"
        await db.commit()

    db_session = AsyncSessionLocal()
    try:
        while True:
            # Receive binary frame payload (JPEG buffer)
            frame_bytes = await websocket.receive_bytes()
            nparr = np.frombuffer(frame_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                continue

            await CameraService.record_frame_received(db_session, camera_id, frame=image)
            # Broadcast frame to connected desktop viewers in real time
            await CameraService.broadcast_frame(camera_id, frame_bytes)

    except WebSocketDisconnect:
        pass
    finally:
        try:
            await db_session.commit()
        except Exception:
            await db_session.rollback()
        await db_session.close()
        async with AsyncSessionLocal() as db:
            await CameraService.set_camera_offline(db, camera_id, status_label="DISCONNECTED")


@router.websocket("/{camera_id}/laptop-stream")
async def laptop_camera_websocket_downlink(
    websocket: WebSocket,
    camera_id: str,
):
    """Real-time binary frame stream delivery over WebSocket to laptop Live Attendance/Preview."""
    try:
        async with AsyncSessionLocal() as db:
            await authenticate_staff_socket(websocket, db)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept(subprotocol="sams-auth")
    CameraService.add_subscriber(camera_id, websocket)

    # If cached frame exists, send immediately
    cached = CameraService.get_cached_frame(camera_id)
    if cached is not None:
        ret, jpeg = cv2.imencode(".jpg", cached, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ret:
            try:
                await websocket.send_bytes(jpeg.tobytes())
            except Exception:
                pass

    try:
        while True:
            # Keepalive listener
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        CameraService.remove_subscriber(camera_id, websocket)


@router.post(
    "/mobile-frame",
    summary="Process Mobile Camera Frame",
    description="Receives frames from a paired mobile phone camera for preview.",
)
async def process_mobile_frame(
    camera_id: str = Form(..., description="Paired camera identifier"),
    session_id: Optional[str] = Form(None, description="Optional active attendance session ID"),
    token: Optional[str] = Form(None, description="Temporary security token"),
    file: UploadFile = File(..., description="JPEG frame buffer"),
    db: AsyncSession = Depends(get_db),
):
    valid = await CameraService.validate_pairing_session(db, token) if token else None
    if not valid or valid[0].id != camera_id or session_id:
        raise HTTPException(
            status_code=403,
            detail="Use a valid camera pairing link. For attendance, pair from the open session.",
        )

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode mobile camera frame buffer.")

    # Record real frame activity and cache latest frame for preview
    await CameraService.record_frame_received(db, camera_id, frame=image)
    # Also broadcast frame to connected laptop viewers
    await CameraService.broadcast_frame(camera_id, contents)

    return {"camera_id": camera_id, "faces_detected": 0, "results": [], "attendance_marked": []}
