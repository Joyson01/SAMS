import json
from pathlib import Path
from unittest.mock import AsyncMock
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.main import app

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


def test_websocket_stream_preview_unauthorized():
    """Security check: unauthenticated WebSocket connection without staff auth is rejected with 1008."""
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/api/v1/stream/ws/preview"):
            pass
    assert exc_info.value.code == 1008


def test_websocket_stream_preview(monkeypatch):
    """Authenticated staff WebSocket live preview stream."""
    monkeypatch.setattr("backend.app.api.v1.stream.authenticate_staff_socket", AsyncMock())
    client = TestClient(app)
    with client.websocket_connect("/api/v1/stream/ws/preview", subprotocols=["sams-auth"]) as websocket:
        # 1. Test reset message
        websocket.send_text(json.dumps({"type": "reset"}))
        resp_reset = websocket.receive_json()
        assert resp_reset["type"] == "reset_ack"

        # 2. Test sync gallery message
        websocket.send_text(json.dumps({"type": "sync_gallery"}))
        resp_sync = websocket.receive_json()
        assert resp_sync["type"] == "sync_ack"
        assert "count" in resp_sync

        # 3. Send image frame (bytes)
        img_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
        if img_path.exists():
            with open(img_path, "rb") as f:
                img_bytes = f.read()

            websocket.send_bytes(img_bytes)
            telemetry = websocket.receive_json()

            assert telemetry["type"] == "telemetry"
            assert "fps" in telemetry
            assert "latencies_ms" in telemetry
            assert "faces" in telemetry
            assert telemetry["faces_count"] >= 1
            assert len(telemetry["faces"]) >= 1

            first_face = telemetry["faces"][0]
            assert "track_id" in first_face
            assert "bbox" in first_face
            assert len(first_face["bbox"]) == 5
            assert first_face["decision"] in ["KNOWN", "UNKNOWN", "UNCERTAIN"]

