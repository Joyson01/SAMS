import io
from pathlib import Path
import cv2
import numpy as np
import pytest

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.mark.asyncio
async def test_recognition_api_thresholds_endpoints(client):
    # 1. Get current thresholds
    get_resp = await client.get("/api/v1/recognition/thresholds")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert "known_threshold" in data
    assert "uncertain_threshold" in data
    assert "margin_threshold" in data

    # 2. Update thresholds
    update_payload = {
        "known_threshold": 0.62,
        "uncertain_threshold": 0.42,
        "margin_threshold": 0.06,
    }
    put_resp = await client.put("/api/v1/recognition/thresholds", json=update_payload)
    assert put_resp.status_code == 200
    assert put_resp.json()["known_threshold"] == 0.62


@pytest.mark.asyncio
async def test_recognition_api_process_image(client):
    test_img_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
    if not test_img_path.exists():
        pytest.skip("Test image not found")

    with open(test_img_path, "rb") as f:
        img_bytes = f.read()

    files = {"file": ("sample_student.jpg", img_bytes, "image/jpeg")}
    resp = await client.post("/api/v1/recognition/process?top_k=3", files=files)
    assert resp.status_code == 200
    res_data = resp.json()

    assert res_data["total_faces_detected"] >= 1
    assert len(res_data["faces"]) >= 1
    assert "latency_breakdown_ms" in res_data
    assert res_data["latency_breakdown_ms"]["total_pipeline_ms"] > 0

    face = res_data["faces"][0]
    assert face["decision"] in ["KNOWN", "UNKNOWN", "UNCERTAIN"]
    assert len(face["bbox"]) == 5  # [x1, y1, x2, y2, score]


@pytest.mark.asyncio
async def test_recognition_api_sync_gallery(client):
    resp = await client.post("/api/v1/recognition/sync-gallery")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "synced_templates_count" in data


@pytest.mark.asyncio
async def test_recognition_api_tracked_stream_and_reset(client):
    test_img_path = WORKSPACE_ROOT / "tests" / "fixtures" / "sample_student.jpg"
    if not test_img_path.exists():
        pytest.skip("Test image not found")

    with open(test_img_path, "rb") as f:
        img_bytes = f.read()

    # Call with session_id and camera_id to engage ByteFaceTracker and TrackIdentityCache
    files = {"file": ("sample_student.jpg", img_bytes, "image/jpeg")}
    url = "/api/v1/recognition/process?top_k=3&session_id=stream_test_sess&camera_id=cam_01"
    resp = await client.post(url, files=files)
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["total_faces_detected"] >= 1
    assert "latency_breakdown_ms" in res_data
    assert "tracking_ms" in res_data["latency_breakdown_ms"]
    assert "arcface_calls" in res_data["latency_breakdown_ms"]

    face = res_data["faces"][0]
    assert face["track_id"] is not None
    assert face["status"] in ["VERIFIED", "VERIFYING", "UNKNOWN", "QUALITY_REJECTED"]

    # Test stream reset endpoint
    reset_resp = await client.post("/api/v1/recognition/stream/reset?session_id=stream_test_sess&camera_id=cam_01")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["status"] == "success"
    assert reset_resp.json()["reset"] is True

