from datetime import datetime, timedelta, timezone
import secrets
import socket
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import cv2
import numpy as np
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.streaming.rtsp_worker import RTSPStreamWorker
from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import Camera, MobilePairingSession
from backend.app.schemas.camera import (
    CameraCreate,
    CameraResponse,
    CameraTestResult,
    CameraUpdate,
    MobilePairingResponse,
    ONVIFDiscoveredCamera,
    ONVIFDiscoveryResponse,
)

# Global in-memory registry of active RTSP stream workers
_active_camera_workers: Dict[str, RTSPStreamWorker] = {}

# Global in-memory atomic cache of latest frame per camera (for preview and AI ingestion)
_latest_frame_cache: Dict[str, Tuple[np.ndarray, float]] = {}
_frame_lock = threading.Lock()

# Global registry of active laptop stream WebSocket subscribers per camera
_camera_subscribers: Dict[str, set] = {}
_subscriber_lock = threading.Lock()

# Throttling configuration for DB heartbeats
_last_db_heartbeat: Dict[str, float] = {}
_HEARTBEAT_DB_INTERVAL_SEC = 2.0


class CameraNotFoundError(SAMSException):
    def __init__(self, camera_id: str):
        super().__init__(
            status_code=404,
            error_code="CAMERA_NOT_FOUND",
            message=f"Camera with ID '{camera_id}' was not found.",
            details={"camera_id": camera_id},
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CameraService:
    """Service managing camera registry, live streaming workers, health computation, and diagnostics."""

    @classmethod
    async def create_camera(cls, db: AsyncSession, camera_in: CameraCreate) -> CameraResponse:
        """Registers a new camera device."""
        camera = Camera(
            name=camera_in.name,
            location=camera_in.location,
            source_type=camera_in.source_type,
            device_id=camera_in.device_id,
            stream_url=camera_in.stream_url,
            target_fps=camera_in.target_fps,
            resolution=camera_in.resolution,
            assigned_class=camera_in.assigned_class,
            detection_zone=camera_in.detection_zone,
            status="OFFLINE",
            is_active=camera_in.is_active,
        )
        db.add(camera)
        await db.commit()
        await db.refresh(camera)
        logger.info(f"Registered camera '{camera.name}' at {camera.location} (ID: {camera.id}, Type: {camera.source_type})")
        return cls._serialize_camera(camera)

    @classmethod
    async def get_camera_by_id(cls, db: AsyncSession, camera_id: str) -> CameraResponse:
        """Retrieves single camera by ID."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)
        return cls._serialize_camera(camera)

    @classmethod
    async def list_cameras(
        cls,
        db: AsyncSession,
        location: Optional[str] = None,
        is_active: Optional[bool] = None,
        assigned_class: Optional[str] = None,
    ) -> List[CameraResponse]:
        """Lists registered camera devices with optional filtering."""
        query = select(Camera)
        filters = []
        if location:
            filters.append(Camera.location.ilike(f"%{location}%"))
        if is_active is not None:
            filters.append(Camera.is_active == is_active)
        if assigned_class:
            filters.append(Camera.assigned_class == assigned_class)

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(Camera.created_at.desc())
        result = await db.execute(query)
        cameras = result.scalars().all()
        return [cls._serialize_camera(c) for c in cameras]

    @classmethod
    async def update_camera(cls, db: AsyncSession, camera_id: str, update_in: CameraUpdate) -> CameraResponse:
        """Updates camera settings."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)

        update_dict = update_in.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(camera, field, value)

        await db.commit()
        await db.refresh(camera)
        logger.info(f"Updated camera '{camera.name}' (ID: {camera.id})")
        return cls._serialize_camera(camera)

    @classmethod
    def add_subscriber(cls, camera_id: str, ws: Any) -> None:
        with _subscriber_lock:
            if camera_id not in _camera_subscribers:
                _camera_subscribers[camera_id] = set()
            _camera_subscribers[camera_id].add(ws)

    @classmethod
    def remove_subscriber(cls, camera_id: str, ws: Any) -> None:
        with _subscriber_lock:
            if camera_id in _camera_subscribers:
                _camera_subscribers[camera_id].discard(ws)
                if not _camera_subscribers[camera_id]:
                    _camera_subscribers.pop(camera_id, None)

    @classmethod
    async def broadcast_frame(cls, camera_id: str, frame_bytes: bytes) -> None:
        subscribers = []
        with _subscriber_lock:
            if camera_id in _camera_subscribers:
                subscribers = list(_camera_subscribers[camera_id])
        for ws in subscribers:
            try:
                await ws.send_bytes(frame_bytes)
            except Exception:
                cls.remove_subscriber(camera_id, ws)

    @classmethod
    async def broadcast_status(cls, camera_id: str, status_msg: Dict[str, Any]) -> None:
        import json
        subscribers = []
        with _subscriber_lock:
            if camera_id in _camera_subscribers:
                subscribers = list(_camera_subscribers[camera_id])
        for ws in subscribers:
            try:
                await ws.send_text(json.dumps(status_msg))
            except Exception:
                cls.remove_subscriber(camera_id, ws)

    @classmethod
    async def set_camera_offline(cls, db: AsyncSession, camera_id: str, status_label: str = "DISCONNECTED") -> None:
        """Sets camera status to DISCONNECTED/OFFLINE and notifies subscribers."""
        camera = await db.get(Camera, camera_id)
        if camera:
            camera.status = status_label
            await db.commit()
        await cls.broadcast_status(camera_id, {"type": "status", "status": status_label, "camera_id": camera_id})

    @classmethod
    async def record_frame_received(cls, db: AsyncSession, camera_id: str, frame: Optional[np.ndarray] = None) -> None:
        """Updates camera last_frame_at, caches the latest image buffer, and sets live status."""
        now = _utc_now()
        now_ts = time.perf_counter()

        if frame is not None:
            ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                with _frame_lock:
                    _latest_frame_cache[camera_id] = (jpeg.tobytes(), now_ts)

        last_db_ts = _last_db_heartbeat.get(camera_id, 0.0)
        if now_ts - last_db_ts >= _HEARTBEAT_DB_INTERVAL_SEC:
            camera = await db.get(Camera, camera_id)
            if camera:
                camera.last_frame_at = now
                camera.last_heartbeat = now
                camera.status = "STREAMING"
                await db.commit()
                _last_db_heartbeat[camera_id] = now_ts

    @classmethod
    def get_cached_jpeg(cls, camera_id: str) -> Optional[bytes]:
        """Retrieves latest frame as JPEG bytes directly from memory without re-encoding."""
        with _frame_lock:
            cached = _latest_frame_cache.get(camera_id)
            if cached is not None:
                return cached[0]

        worker = _active_camera_workers.get(camera_id)
        if worker and worker.is_connected:
            frame, _ = worker.get_latest_frame()
            if frame is not None:
                ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ret:
                    return jpeg.tobytes()
        return None

    @classmethod
    def get_cached_frame(cls, camera_id: str) -> Optional[np.ndarray]:
        """Retrieves the latest decoded frame from in-memory cache or active RTSP worker."""
        # Check active worker first if RTSP
        worker = _active_camera_workers.get(camera_id)
        if worker and worker.is_connected:
            frame, _ = worker.get_latest_frame()
            if frame is not None:
                return frame

        # Check in-memory frame cache (stored as compressed JPEG to save ~98% memory)
        with _frame_lock:
            cached = _latest_frame_cache.get(camera_id)
            if cached is not None:
                nparr = np.frombuffer(cached[0], np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return None

    @classmethod
    async def delete_camera(cls, db: AsyncSession, camera_id: str) -> bool:
        """Deletes a camera device, cleans pairing sessions, and shuts down its stream worker if active."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)

        # Stop worker if active
        cls.stop_camera_worker(camera_id)

        # Clear frame cache
        with _frame_lock:
            _latest_frame_cache.pop(camera_id, None)

        await db.delete(camera)
        await db.commit()
        logger.info(f"Deleted camera '{camera.name}' (ID: {camera_id})")
        return True

    @classmethod
    def test_camera_connection(cls, stream_url: Optional[str] = None, device_id: Optional[str] = None) -> CameraTestResult:
        """Performs a real diagnostic sequence on a video source:
        connection -> stream -> frame decoding -> resolution -> FPS -> face detector verification -> latency."""
        start_time = time.perf_counter()
        source = stream_url or device_id or "0"
        from ai_engine.streaming.rtsp_worker import get_candidate_stream_urls, is_network_endpoint_reachable

        candidates = get_candidate_stream_urls(str(source))
        last_err = None

        for cand in candidates:
            try:
                # Fast TCP probe to avoid long blocking if network IP is unreachable
                if not is_network_endpoint_reachable(cand, timeout_sec=0.8):
                    continue

                url: int | str = int(cand) if str(cand).isdigit() else str(cand)
                cap = cv2.VideoCapture(url)
                if not cap.isOpened():
                    cap.release()
                    continue

                ret, frame = cap.read()
                measured_fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
                cap.release()

                if ret and frame is not None and frame.size > 0:
                    latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
                    h, w = frame.shape[:2]
                    res_str = f"{w}x{h}"

                    # Test face detector verification
                    detector_ok = True
                    try:
                        from backend.app.services.face_recognition_service import get_face_app
                        app = get_face_app()
                        app.get(frame)
                    except Exception as det_exc:
                        logger.warning(f"Detector diagnostic notice: {det_exc}")
                        detector_ok = False

                    return CameraTestResult(
                        success=True,
                        status="CAMERA READY",
                        message=f"Camera healthy ({cand}): receiving {res_str} video stream at {measured_fps:.0f} FPS",
                        connection=True,
                        stream=True,
                        frames=True,
                        detector=detector_ok,
                        resolution=res_str,
                        fps=round(float(measured_fps), 1),
                        latency_ms=latency_ms,
                    )
            except Exception as e:
                last_err = str(e)
                continue

        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return CameraTestResult(
            success=False,
            status="CAMERA ERROR",
            message=f"Could not connect to camera source '{source}'. Verify IP Camera app is running on mobile device or RTSP stream is accessible.",
            connection=False,
            stream=False,
            frames=False,
            detector=False,
            latency_ms=latency_ms,
        )

    @classmethod
    def capture_camera_frame(cls, camera_id: str, camera_obj: Optional[Camera] = None) -> Optional[np.ndarray]:
        """Captures the freshest high-quality frame from active worker or directly from stream URL."""
        worker = _active_camera_workers.get(camera_id)
        if worker:
            snap = worker.capture_snapshot()
            if snap is not None:
                return snap

        frame = cls.get_cached_frame(camera_id)
        if frame is not None:
            return frame

        if camera_obj and camera_obj.stream_url:
            import urllib.request
            from ai_engine.streaming.rtsp_worker import get_candidate_stream_urls, is_network_endpoint_reachable
            for url in get_candidate_stream_urls(camera_obj.stream_url):
                try:
                    if not is_network_endpoint_reachable(url, timeout_sec=0.8):
                        continue
                    if url.endswith(".jpg") or url.endswith(".jpeg"):
                        req = urllib.request.Request(url, headers={"User-Agent": "JOJIPA-SAMS/1.0"})
                        with urllib.request.urlopen(req, timeout=2.0) as resp:
                            img_data = resp.read()
                            arr = np.frombuffer(img_data, np.uint8)
                            snap = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                            if snap is not None:
                                return snap
                    else:
                        u = int(url) if str(url).isdigit() else str(url)
                        cap = cv2.VideoCapture(u)
                        if cap.isOpened():
                            ret, f = cap.read()
                            cap.release()
                            if ret and f is not None:
                                return f
                except Exception:
                    continue
        return None

    @classmethod
    async def create_or_renew_mobile_pairing(
        cls,
        db: AsyncSession,
        camera_id: Optional[str] = None,
        camera_name: str = "Mobile Phone Camera",
        location: str = "Classroom",
        assigned_class: Optional[str] = None,
    ) -> MobilePairingResponse:
        """Generates a secure temporary mobile pairing token without creating duplicate camera records."""
        token = secrets.token_urlsafe(24)
        expires_at = _utc_now() + timedelta(hours=24)

        # 1. Reuse existing camera if ID provided
        camera: Optional[Camera] = None
        if camera_id:
            camera = await db.get(Camera, camera_id)

        # 2. If no camera_id, check if a MOBILE camera with same name and location already exists
        if not camera:
            query = select(Camera).where(
                Camera.source_type == "MOBILE",
                Camera.name == camera_name,
                Camera.location == location,
            )
            res = await db.execute(query)
            camera = res.scalars().first()

        # 3. If still no camera, create a single new Camera record
        if not camera:
            camera = Camera(
                name=camera_name,
                location=location,
                source_type="MOBILE",
                stream_url=None,
                status="OFFLINE",
                target_fps=15,
                resolution="1280x720",
                assigned_class=assigned_class,
                is_active=True,
            )
            db.add(camera)
            await db.flush()
        else:
            if assigned_class:
                camera.assigned_class = assigned_class

        # Create new MobilePairingSession
        pairing_session = MobilePairingSession(
            camera_id=camera.id,
            token=token,
            status="PENDING",
            expires_at=expires_at,
        )
        db.add(pairing_session)
        await db.commit()
        await db.refresh(camera)

        pairing_path = f"/mobile-camera?camera_id={camera.id}&token={token}"

        return MobilePairingResponse(
            token=token,
            camera_id=camera.id,
            camera_name=camera.name,
            location=camera.location,
            source_type=camera.source_type,
            pairing_url=pairing_path,
            expires_at=expires_at,
            status="PENDING",
        )

    @classmethod
    async def validate_pairing_session(cls, db: AsyncSession, token: str) -> Optional[Tuple[Camera, MobilePairingSession]]:
        """Validates a mobile pairing token and returns the camera and session entities."""
        query = select(MobilePairingSession).where(MobilePairingSession.token == token)
        res = await db.execute(query)
        session = res.scalars().first()

        if not session:
            return None

        expires = session.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)

        if session.status == "REVOKED" or expires < _utc_now():
            session.status = "EXPIRED"
            await db.commit()
            return None

        camera = await db.get(Camera, session.camera_id)
        if not camera or not camera.is_active:
            return None

        if session.status == "PENDING":
            session.status = "CONNECTED"
            session.connected_at = _utc_now()
            camera.status = "CONNECTED"
            await db.commit()

        return camera, session

    @classmethod
    async def revoke_pairing(cls, db: AsyncSession, camera_id: str) -> bool:
        """Revokes all active pairing sessions for a mobile camera."""
        query = select(MobilePairingSession).where(
            MobilePairingSession.camera_id == camera_id,
            MobilePairingSession.status.in_(["PENDING", "CONNECTED"]),
        )
        res = await db.execute(query)
        sessions = res.scalars().all()
        now = _utc_now()

        for s in sessions:
            s.status = "REVOKED"
            s.disconnected_at = now

        camera = await db.get(Camera, camera_id)
        if camera:
            camera.status = "OFFLINE"

        await db.commit()
        return True

    @classmethod
    def start_camera_worker(cls, camera_id: str, stream_url: str, name: str = "Camera") -> bool:
        """Starts a background RTSPStreamWorker for the given camera."""
        if camera_id in _active_camera_workers:
            return True

        worker = RTSPStreamWorker(
            camera_id=camera_id,
            stream_url=stream_url,
            name=name,
        )
        worker.start()
        _active_camera_workers[camera_id] = worker
        return True

    @classmethod
    def stop_camera_worker(cls, camera_id: str) -> bool:
        """Stops background RTSP worker."""
        if camera_id in _active_camera_workers:
            worker = _active_camera_workers.pop(camera_id)
            worker.stop()
            return True
        return False

    @classmethod
    def get_camera_worker(cls, camera_id: str) -> Optional[RTSPStreamWorker]:
        return _active_camera_workers.get(camera_id)

    @classmethod
    def discover_onvif_cameras(cls, timeout_sec: float = 1.5) -> ONVIFDiscoveryResponse:
        """Probes local network for ONVIF IP camera devices using WS-Discovery UDP multicast."""
        discovered: List[ONVIFDiscoveredCamera] = []

        # WS-Discovery probe payload
        probe_msg = (
            '<?xml version="1.0" encoding="utf-8"?>'
            '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" '
            'xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
            'xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery">'
            '<soap:Header>'
            '<wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>'
            f'<wsa:MessageID>urn:uuid:{secrets.token_hex(16)}</wsa:MessageID>'
            '<wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>'
            '</soap:Header>'
            '<soap:Body>'
            '<wsd:Probe>'
            '<wsd:Types>dn:NetworkVideoTransmitter</wsd:Types>'
            '</wsd:Probe>'
            '</soap:Body>'
            '</soap:Envelope>'
        )

        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.settimeout(timeout_sec)
            sock.sendto(probe_msg.encode("utf-8"), ("239.255.255.250", 3702))

            start = time.perf_counter()
            seen_ips = set()

            while (time.perf_counter() - start) < timeout_sec:
                try:
                    data, (addr, port) = sock.recvfrom(4096)
                    if addr not in seen_ips:
                        seen_ips.add(addr)
                        discovered.append(
                            ONVIFDiscoveredCamera(
                                name=f"ONVIF Camera ({addr})",
                                ip=addr,
                                port=port,
                                manufacturer="Generic ONVIF",
                                model="IP Camera",
                                rtsp_url_hint=f"rtsp://{addr}:554/live/ch0",
                                is_reachable=True,
                            )
                        )
                except socket.timeout:
                    break
        except Exception as exc:
            logger.warning(f"ONVIF WS-Discovery notice: {exc}")
        finally:
            if sock:
                sock.close()

        return ONVIFDiscoveryResponse(
            cameras=discovered,
            scanned_subnet="Local LAN Subnet (239.255.255.250:3702)",
            total_found=len(discovered),
        )

    @classmethod
    def _serialize_camera(cls, camera: Camera) -> CameraResponse:
        now = _utc_now()
        worker = _active_camera_workers.get(camera.id)

        # Calculate actual health state based on real frame reception and worker state
        last_frame = camera.last_frame_at or camera.last_heartbeat
        if last_frame:
            if last_frame.tzinfo is None:
                last_frame = last_frame.replace(tzinfo=timezone.utc)
            elapsed_sec = (now - last_frame).total_seconds()
        else:
            elapsed_sec = None

        if worker and worker.is_connected:
            computed_status = "STREAMING"
            is_conn = True
            live_fps = worker.fps
        elif elapsed_sec is not None and elapsed_sec <= 6.0:
            computed_status = "STREAMING"
            is_conn = True
            live_fps = float(camera.target_fps)
        elif elapsed_sec is not None and elapsed_sec <= 25.0:
            computed_status = "NO_FRAME"
            is_conn = True
            live_fps = 0.0
        elif camera.is_active:
            computed_status = camera.status if camera.status in ["CONNECTED", "RECONNECTING"] else "OFFLINE"
            is_conn = computed_status == "CONNECTED"
            live_fps = 0.0
        else:
            computed_status = "OFFLINE"
            is_conn = False
            live_fps = 0.0

        return CameraResponse(
            id=camera.id,
            name=camera.name,
            location=camera.location,
            source_type=camera.source_type,
            device_id=camera.device_id,
            stream_url=camera.stream_url,
            status=computed_status,
            is_active=camera.is_active,
            target_fps=camera.target_fps,
            resolution=camera.resolution,
            assigned_class=camera.assigned_class,
            detection_zone=camera.detection_zone,
            is_connected=is_conn,
            fps=round(live_fps, 1),
            seconds_since_last_frame=round(elapsed_sec, 1) if elapsed_sec is not None else None,
            last_heartbeat=camera.last_heartbeat,
            last_frame_at=camera.last_frame_at,
            created_at=camera.created_at,
            updated_at=camera.updated_at,
        )
