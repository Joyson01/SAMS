import cv2
import numpy as np
import pytest

from ai_engine.base import BoundingBox
from ai_engine.quality.quality_analyzer import FaceQualityAnalyzer


def test_quality_analyzer_sharp_image():
    analyzer = FaceQualityAnalyzer(min_sharpness=50.0)
    # Create synthetic sharp face image (gradient with high frequency edges)
    img = np.zeros((120, 120, 3), dtype=np.uint8)
    cv2.circle(img, (60, 60), 30, (200, 200, 200), -1)
    cv2.rectangle(img, (20, 20), (100, 100), (255, 255, 255), 2)

    bbox = BoundingBox(10, 10, 110, 110, 0.95)
    metrics = analyzer.analyze(img, bbox)

    assert metrics.is_valid is True
    assert metrics.sharpness >= 50.0
    assert metrics.face_width == 100
    assert metrics.face_height == 100


def test_quality_analyzer_blurry_rejection():
    analyzer = FaceQualityAnalyzer(min_sharpness=50.0)
    # Create image with contrast (circles/features) then heavily blur it
    img = np.zeros((120, 120, 3), dtype=np.uint8)
    cv2.circle(img, (60, 60), 30, (220, 220, 220), -1)
    cv2.rectangle(img, (20, 20), (100, 100), (200, 200, 200), -1)
    img = cv2.GaussianBlur(img, (35, 35), 0)

    bbox = BoundingBox(10, 10, 110, 110, 0.95)
    metrics = analyzer.analyze(img, bbox)

    assert metrics.is_valid is False
    assert "blurry" in metrics.rejection_reason.lower()


def test_quality_analyzer_dark_rejection():
    analyzer = FaceQualityAnalyzer(min_brightness=40.0)
    # Very dark image
    img = np.ones((120, 120, 3), dtype=np.uint8) * 15

    bbox = BoundingBox(10, 10, 110, 110, 0.95)
    metrics = analyzer.analyze(img, bbox)

    assert metrics.is_valid is False
    assert "dark" in metrics.rejection_reason.lower()


def test_quality_analyzer_too_small():
    analyzer = FaceQualityAnalyzer(min_face_size=60)
    img = np.ones((100, 100, 3), dtype=np.uint8) * 150

    # Face is only 30x30 pixels
    bbox = BoundingBox(10, 10, 40, 40, 0.95)
    metrics = analyzer.analyze(img, bbox)

    assert metrics.is_valid is False
    assert "small" in metrics.rejection_reason.lower()

