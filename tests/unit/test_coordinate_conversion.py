"""
Unit tests for coordinate transformation mathematics between camera frame and display canvas.
Validates aspect-ratio preservation, letterboxing/pillarboxing (contain), crop compensation (cover),
and horizontal mirroring across standard resolutions (1280x720, 1920x1080, 640x480).
"""

from typing import Tuple
import pytest


def map_video_coords_to_canvas(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    v_width: float,
    v_height: float,
    c_width: float,
    c_height: float,
    fit_mode: str = "cover",
    is_mirrored: bool = False,
) -> Tuple[float, float, float, float]:
    """
    Python implementation of the frontend canvas coordinate transformation.
    Returns (bx, by, bw, bh) in canvas display pixel space.
    """
    v_aspect = v_width / v_height
    c_aspect = c_width / c_height

    if fit_mode == "cover":
        if v_aspect > c_aspect:
            render_h = c_height
            render_w = c_height * v_aspect
            offset_x = (c_width - render_w) / 2.0
            offset_y = 0.0
        else:
            render_w = c_width
            render_h = c_width / v_aspect
            offset_x = 0.0
            offset_y = (c_height - render_h) / 2.0
    else:  # contain
        if v_aspect > c_aspect:
            render_w = c_width
            render_h = c_width / v_aspect
            offset_x = 0.0
            offset_y = (c_height - render_h) / 2.0
        else:
            render_h = c_height
            render_w = c_height * v_aspect
            offset_x = (c_width - render_w) / 2.0
            offset_y = 0.0

    scale_x = render_w / v_width
    scale_y = render_h / v_height

    bx = offset_x + (x1 * scale_x)
    by = offset_y + (y1 * scale_y)
    bw = (x2 - x1) * scale_x
    bh = (y2 - y1) * scale_y

    if is_mirrored:
        bx = offset_x + render_w - (x2 * scale_x)

    return bx, by, bw, bh


def test_1280x720_exact_16_9_cover_mapping():
    """When video and container have identical aspect ratio (16:9), offset is 0 and scale is uniform."""
    v_w, v_h = 1280.0, 720.0
    c_w, c_h = 960.0, 540.0  # 16:9 container

    # Center face: 200x200 at [540, 260, 740, 460]
    bx, by, bw, bh = map_video_coords_to_canvas(
        540.0, 260.0, 740.0, 460.0,
        v_w, v_h, c_w, c_h,
        fit_mode="cover", is_mirrored=False
    )

    scale = 960.0 / 1280.0  # 0.75
    assert bw == pytest.approx(200.0 * scale)
    assert bh == pytest.approx(200.0 * scale)
    assert bx == pytest.approx(540.0 * scale)
    assert by == pytest.approx(260.0 * scale)


def test_640x480_in_16_9_cover_crops_top_bottom():
    """
    4:3 video (aspect ~1.33) in a 16:9 container (aspect ~1.78) with 'cover'.
    Since v_aspect < c_aspect, video fills width and crops top/bottom with negative offset_y.
    """
    v_w, v_h = 640.0, 480.0
    c_w, c_h = 800.0, 450.0  # 16:9 container

    bx, by, bw, bh = map_video_coords_to_canvas(
        220.0, 140.0, 420.0, 340.0,
        v_w, v_h, c_w, c_h,
        fit_mode="cover", is_mirrored=False
    )

    # render_w = 800.0, render_h = 800 / (4/3) = 600.0
    # offset_y = (450 - 600) / 2 = -75.0
    scale = 800.0 / 640.0  # 1.25
    assert bw == pytest.approx(200.0 * scale)
    assert bh == pytest.approx(200.0 * scale)
    assert bx == pytest.approx(220.0 * scale)
    assert by == pytest.approx(140.0 * scale - 75.0)


def test_1280x720_in_4_3_contain_pillarbox():
    """
    16:9 video in 4:3 container with 'contain'.
    v_aspect > c_aspect, so video letterboxes top and bottom (positive offset_y).
    """
    v_w, v_h = 1280.0, 720.0
    c_w, c_h = 800.0, 600.0  # 4:3 container

    bx, by, bw, bh = map_video_coords_to_canvas(
        100.0, 100.0, 300.0, 300.0,
        v_w, v_h, c_w, c_h,
        fit_mode="contain", is_mirrored=False
    )

    # render_w = 800, render_h = 800 / (16/9) = 450.0
    # offset_y = (600 - 450) / 2 = 75.0
    scale = 800.0 / 1280.0  # 0.625
    assert bw == pytest.approx(200.0 * scale)
    assert bh == pytest.approx(200.0 * scale)
    assert bx == pytest.approx(100.0 * scale)
    assert by == pytest.approx(100.0 * scale + 75.0)


def test_horizontal_mirroring_inverts_x_correctly():
    """
    When webcam is mirrored (transform -scale-x-100), a face on the right of the frame (x=1000..1200)
    must appear on the left in the mirrored canvas, perfectly aligned with the mirrored video.
    """
    v_w, v_h = 1280.0, 720.0
    c_w, c_h = 1280.0, 720.0

    # Face near right edge [1000, 100, 1200, 300]
    bx, by, bw, bh = map_video_coords_to_canvas(
        1000.0, 100.0, 1200.0, 300.0,
        v_w, v_h, c_w, c_h,
        fit_mode="cover", is_mirrored=True
    )

    # Mirrored bx = 1280 - 1200 = 80.0
    assert bx == pytest.approx(80.0)
    assert bw == pytest.approx(200.0)
    assert by == pytest.approx(100.0)
    assert bh == pytest.approx(200.0)


def test_coordinate_mapping_never_produces_negative_dimensions():
    """Ensures box width and height are always strictly positive."""
    v_w, v_h = 1920.0, 1080.0
    c_w, c_h = 854.0, 480.0

    bx, by, bw, bh = map_video_coords_to_canvas(
        500.0, 200.0, 700.0, 400.0,
        v_w, v_h, c_w, c_h,
        fit_mode="cover", is_mirrored=False
    )
    assert bw > 0
    assert bh > 0
