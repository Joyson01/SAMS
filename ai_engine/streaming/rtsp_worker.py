import io
import logging
import threading
import time
import urllib.request
from typing import List, Optional, Tuple, Union
import cv2
import numpy as np
import socket
from urllib.parse import urlparse

logger = logging.getLogger("sams.rtsp_worker")


def is_network_endpoint_reachable(url: str, timeout_sec: float = 1.0) -> bool:
    """Fast TCP socket probe to verify if IP:Port is reachable before OpenCV blocks on network handshake."""
    try:
        url_str = str(url).strip()
        if url_str.isdigit() or not (url_str.startswith("http://") or url_str.startswith("https://") or url_str.startswith("rtsp://") or url_str.startswith("rtsps://")):
            return True
        parsed = urlparse(url_str)
        host = parsed.hostname
        if not host:
            return True
        port = parsed.port
        if not port:
            port = 554 if parsed.scheme in ["rtsp", "rtsps"] else 443 if parsed.scheme == "https" else 80
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except Exception:
        return False


def get_candidate_stream_urls(base_url: str) -> List[str]:
    """
    Generates candidate stream endpoints for IP cameras, HTTP streams, and RTSP feeds.
    For example: 'http://192.168.1.100:8080/' expands to include '/video', '/videofeed', '/mjpeg', '/shot.jpg'.
    """
    base_url = str(base_url).strip()
    if not base_url:
        return ["0"]
    if base_url.isdigit():
        return [base_url]

    candidates: List[str] = [base_url]

    # Convert rtsp:// to http:// candidates if port is 8080 (standard Android IP Webcam app)
    if base_url.startswith("rtsp://") or base_url.startswith("rtsps://"):
        http_equiv = base_url.replace("rtsp://", "http://").replace("rtsps://", "https://")
        parts = http_equiv.split("/")
        if len(parts) >= 3:
            root_http = f"{parts[0]}//{parts[2]}"
            candidates.append(f"{root_http}/video")
            candidates.append(f"{root_http}/videofeed")
            candidates.append(f"{root_http}/mjpeg")
            candidates.append(f"{root_http}/shot.jpg")

    clean_base = base_url.rstrip("/")

    if clean_base.startswith("http://") or clean_base.startswith("https://"):
        # If user passed root IP camera url, prioritize direct stream endpoints
        if not any(clean_base.endswith(ext) for ext in ["/video", "/videofeed", "/mjpeg", "/video.mjpg", "/mjpegfeed"]):
            candidates.insert(0, f"{clean_base}/video")
            candidates.append(f"{clean_base}/videofeed")
            candidates.append(f"{clean_base}/mjpeg")
            candidates.append(f"{clean_base}/video.mjpg")
            candidates.append(f"{clean_base}/shot.jpg")
            # Also add RTSP endpoints commonly provided by IP Webcam app
            rtsp_base = clean_base.replace("http://", "rtsp://").replace("https://", "rtsp://")
            candidates.append(f"{rtsp_base}/h264_opus.sdp")
            candidates.append(f"{rtsp_base}/h264.sdp")

    # Remove duplicates preserving order
    seen = set()
    result = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            result.append(c)

    return result


class RTSPStreamWorker:
    """High-performance threaded video stream worker supporting:
    - Mobile Phone IP Camera apps (HTTP / MJPEG / snapshot)
    - Hardware Webcams (numeric index)
    - RTSP / CCTV Surveillance Cameras
    - Video files
    
    Features:
    - Dedicated capture thread maintaining a zero-latency latest-frame atomic buffer.
    - Automatic URL endpoint resolution for IP cameras.
    - Automatic reconnection with exponential backoff on stream interruptions.
    - Snapshot capture capability.
    - Real-time telemetry: FPS, frames captured, dropped frames.
    """

    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        name: str = "Camera",
        target_fps: int = 15,
        reconnect_interval_sec: float = 2.0,
        max_reconnect_interval_sec: float = 30.0,
    ):
        self.camera_id = camera_id
        self.stream_url = stream_url
        self.name = name
        self.target_fps = target_fps
        self.reconnect_interval_sec = reconnect_interval_sec
        self.max_reconnect_interval_sec = max_reconnect_interval_sec

        # Threading state
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # Frame Buffer
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_frame_time: float = 0.0
        self._is_connected: bool = False
        self._last_error: Optional[str] = None
        self._active_stream_url: str = stream_url

        # Telemetry metrics
        self.frames_captured: int = 0
        self.frames_dropped: int = 0
        self.fps: float = 0.0
        self.last_reconnect_time: float = 0.0

    def start(self) -> bool:
        """Starts background stream capture thread."""
        if self._running:
            return True

        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, name=f"CameraWorker-{self.camera_id}", daemon=True)
        self._thread.start()
        logger.info(f"Started video stream worker for '{self.name}' ({self.camera_id}) -> {self.stream_url}")
        return True

    def stop(self) -> None:
        """Stops background stream capture thread and releases video source."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        self._is_connected = False
        logger.info(f"Stopped video stream worker for '{self.name}' ({self.camera_id})")

    def get_latest_frame(self) -> Tuple[Optional[np.ndarray], float]:
        """Retrieves latest frame without blocking capture thread.
        
        Returns:
            Tuple[Optional[np.ndarray], float]: (frame_bgr, timestamp)
        """
        with self._lock:
            if self._latest_frame is None:
                return None, 0.0
            return self._latest_frame.copy(), self._latest_frame_time

    def capture_snapshot(self) -> Optional[np.ndarray]:
        """Captures the freshest high-quality frame directly from worker buffer or on-demand poll."""
        frame, _ = self.get_latest_frame()
        if frame is not None:
            return frame

        # Fallback: attempt direct single-frame read
        for url in get_candidate_stream_urls(self.stream_url):
            try:
                if url.endswith(".jpg") or url.endswith(".jpeg"):
                    req = urllib.request.Request(url, headers={"User-Agent": "JOJIPA-SAMS/1.0"})
                    with urllib.request.urlopen(req, timeout=3.0) as resp:
                        img_data = resp.read()
                        arr = np.frombuffer(img_data, np.uint8)
                        snap = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        if snap is not None:
                            return snap
                else:
                    u: Union[int, str] = int(url) if str(url).isdigit() else str(url)
                    cap = cv2.VideoCapture(u)
                    if cap.isOpened():
                        ret, f = cap.read()
                        cap.release()
                        if ret and f is not None:
                            return f
            except Exception:
                continue

        return None

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def active_stream_url(self) -> str:
        return self._active_stream_url

    @property
    def status_summary(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "stream_url": self.stream_url,
            "active_stream_url": self._active_stream_url,
            "is_connected": self._is_connected,
            "fps": round(self.fps, 1),
            "frames_captured": self.frames_captured,
            "frames_dropped": self.frames_dropped,
            "last_error": self._last_error,
        }

    def _capture_loop(self) -> None:
        """Dedicated thread continuously pulling latest frames and reconnecting on error."""
        reconnect_delay = self.reconnect_interval_sec
        candidates = get_candidate_stream_urls(self.stream_url)

        while self._running:
            cap: Optional[cv2.VideoCapture] = None
            successful_url: Optional[str] = None

            try:
                # Try candidates in order
                for candidate in candidates:
                    if not self._running:
                        break
                    try:
                        if not is_network_endpoint_reachable(candidate, timeout_sec=0.8):
                            continue
                        url: Union[int, str] = int(candidate) if candidate.isdigit() else candidate
                        temp_cap = cv2.VideoCapture(url)
                        if temp_cap.isOpened():
                            ret, test_f = temp_cap.read()
                            if ret and test_f is not None:
                                cap = temp_cap
                                successful_url = candidate
                                self._active_stream_url = candidate
                                break
                            else:
                                temp_cap.release()
                        else:
                            temp_cap.release()
                    except Exception as try_err:
                        logger.debug(f"Candidate {candidate} connection notice: {try_err}")
                        continue

                if cap is None or not cap.isOpened():
                    raise RuntimeError(f"Could not open stream for '{self.name}' across candidates: {candidates}")

                # Configure low-latency buffer settings
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                self._is_connected = True
                self._last_error = None
                reconnect_delay = self.reconnect_interval_sec
                logger.info(f"Stream connected successfully for camera '{self.name}' via {successful_url}")

                fps_counter = 0
                fps_start = time.perf_counter()

                while self._running:
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        logger.warning(f"Stream frame read failed for camera '{self.name}'")
                        break

                    now = time.perf_counter()

                    with self._lock:
                        if self._latest_frame is not None:
                            self.frames_dropped += 1
                        self._latest_frame = frame
                        self._latest_frame_time = now
                        self.frames_captured += 1

                    fps_counter += 1
                    if now - fps_start >= 1.0:
                        self.fps = fps_counter / (now - fps_start)
                        fps_counter = 0
                        fps_start = now

                    # Sleep tiny fraction to respect target FPS if needed
                    if self.target_fps > 0:
                        time.sleep(max(0.001, (1.0 / self.target_fps) - 0.01))

            except Exception as e:
                self._last_error = str(e)
                logger.warning(f"Stream error on camera '{self.name}': {e}")
            finally:
                self._is_connected = False
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass

            if self._running:
                logger.info(f"Reconnecting camera '{self.name}' in {reconnect_delay:.1f}s...")
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, self.max_reconnect_interval_sec)
