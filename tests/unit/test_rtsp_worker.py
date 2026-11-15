import time
from ai_engine.streaming.rtsp_worker import RTSPStreamWorker


def test_rtsp_worker_lifecycle_and_resilience():
    # Initialize worker with dummy test endpoint
    worker = RTSPStreamWorker(
        camera_id="cam-test-01",
        stream_url="rtsp://127.0.0.1:8554/live",
        name="Test RTSP Camera",
        target_fps=15,
        reconnect_interval_sec=0.1,
    )

    assert worker.camera_id == "cam-test-01"
    assert worker.is_connected is False
    assert worker.frames_captured == 0

    # Start worker thread
    started = worker.start()
    assert started is True

    # Give thread brief moment to attempt connection
    time.sleep(0.15)

    summary = worker.status_summary
    assert summary["camera_id"] == "cam-test-01"
    assert "frames_captured" in summary

    # Stop worker
    worker.stop()
    assert worker.is_connected is False

