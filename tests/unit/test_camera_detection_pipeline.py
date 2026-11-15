import io
import cv2
import numpy as np
import pytest
from httpx import AsyncClient, ASGITransport

from ai_engine.detection.scrfd import SCRFDFaceDetector
from backend.app.main import app


@pytest.fixture
def detector():
    return SCRFDFaceDetector(det_size=(640, 640), det_thresh=0.50)


def test_detector_initialization_and_model_loading(detector):
    """Verifies that SCRFD ONNX models load properly into memory."""
    assert detector._app is not None
    assert detector.det_thresh == 0.50


def test_detector_one_face_image(detector):
    """Verifies that single frontal face returns exactly one bounding box."""
    img = cv2.imread("tests/fixtures/sample_student.jpg")
    assert img is not None, "Failed to load tests/fixtures/sample_student.jpg"
    faces = detector.detect(img)
    assert len(faces) == 1
    assert faces[0].det_score >= 0.70
    assert faces[0].bbox.area > 5000.0


def test_detector_multi_face_image(detector):
    """Verifies that multiple faces are accurately detected simultaneously."""
    img = cv2.imread("tests/fixtures/test_grp.jpg")
    if img is not None:
        faces = detector.detect(img)
        assert len(faces) > 1, f"Expected multiple faces, found {len(faces)}"


def test_detector_no_face_blank_image(detector):
    """Verifies that blank image returns 0 detections without crashing."""
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    faces = detector.detect(blank)
    assert len(faces) == 0


def test_detector_empty_and_corrupt_inputs(detector):
    """Verifies error handling on None or zero-size image buffers."""
    assert detector.detect(None) == []
    assert detector.detect(np.array([])) == []


@pytest.mark.asyncio
async def test_api_detect_endpoint_requires_auth(client):
    """Verifies that unauthenticated calls to /api/v1/recognition/detect return 401."""
    with open("tests/fixtures/sample_student.jpg", "rb") as f:
        res = await client.post(
            "/api/v1/recognition/detect",
            files={"file": ("frame.jpg", f, "image/jpeg")},
        )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_api_detect_endpoint_valid_image(staff_client):
    """Tests POST /api/v1/recognition/detect with real image upload."""
    with open("tests/fixtures/sample_student.jpg", "rb") as f:
        res = await staff_client.post(
            "/api/v1/recognition/detect",
            files={"file": ("frame.jpg", f, "image/jpeg")},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total_faces"] == 1
    assert len(data["faces"]) == 1
    assert data["faces"][0]["is_valid"] is True
    assert len(data["faces"][0]["box"]) == 4


@pytest.mark.asyncio
async def test_api_debug_detect_endpoint(staff_client):
    """Tests POST /api/v1/recognition/debug/detect development endpoint."""
    with open("tests/fixtures/sample_student.jpg", "rb") as f:
        res = await staff_client.post(
            "/api/v1/recognition/debug/detect",
            files={"file": ("frame.jpg", f, "image/jpeg")},
        )
    assert res.status_code == 200
    data = res.json()
    assert "faces" in data
    assert len(data["faces"]) == 1
    assert data["faces"][0]["confidence"] >= 0.70


@pytest.mark.asyncio
async def test_api_detect_endpoint_rejects_empty_frame(staff_client):
    """Tests that empty file returns 400 Bad Request."""
    res = await staff_client.post(
        "/api/v1/recognition/detect",
        files={"file": ("frame.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400

