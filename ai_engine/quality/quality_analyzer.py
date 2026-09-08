from typing import Optional
import cv2
import numpy as np
from ai_engine.base import BoundingBox, QualityMetrics


class FaceQualityAnalyzer:
    """Evaluates face image quality (sharpness, illumination, resolution, contrast)."""

    def __init__(
        self,
        min_face_size: int = 60,
        min_face_size: int = 40,
        min_sharpness: float = 50.0,
        min_brightness: float = 40.0,
        max_brightness: float = 230.0,
        min_contrast: float = 15.0,
    ):
        self.min_face_size = min_face_size
        self.min_sharpness = min_sharpness
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.min_contrast = min_contrast

    def set_thresholds(
        self,
        min_face_size: Optional[int] = None,
        min_sharpness: Optional[float] = None,
        min_brightness: Optional[float] = None,
        max_brightness: Optional[float] = None,
        min_contrast: Optional[float] = None,
    ) -> None:
        """Dynamically update quality evaluation thresholds."""
        if min_face_size is not None:
            self.min_face_size = min_face_size
        if min_sharpness is not None:
            self.min_sharpness = min_sharpness
        if min_brightness is not None:
            self.min_brightness = min_brightness
        if max_brightness is not None:
            self.max_brightness = max_brightness
        if min_contrast is not None:
            self.min_contrast = min_contrast

    def analyze(self, image: np.ndarray, bbox: BoundingBox) -> QualityMetrics:
        """Computes quality metrics for the cropped face region."""
        h_img, w_img = image.shape[:2]
        x1, y1, x2, y2 = bbox.to_int_xyxy()

        # Clamp bounding box inside image boundaries
        x1_c = max(0, min(w_img - 1, x1))
        y1_c = max(0, min(h_img - 1, y1))
        x2_c = max(0, min(w_img, x2))
        y2_c = max(0, min(h_img, y2))

        face_w = x2_c - x1_c
        face_h = y2_c - y1_c

        # 1. Size Check
        if face_w < self.min_face_size or face_h < self.min_face_size:
            return QualityMetrics(
                sharpness=0.0,
                brightness=0.0,
                face_width=face_w,
                face_height=face_h,
                is_valid=False,
                rejection_reason=f"Face is too small ({face_w}x{face_h}px < {self.min_face_size}px). Move closer.",
            )

        face_crop = image[y1_c:y2_c, x1_c:x2_c]
        if face_crop.size == 0:
            return QualityMetrics(
                sharpness=0.0,
                brightness=0.0,
                face_width=0,
                face_height=0,
                is_valid=False,
                rejection_reason="Invalid crop coordinates.",
            )

        # Convert to Grayscale
        if len(face_crop.shape) == 3:
            gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = face_crop

        # 2. Brightness / Illumination Distribution
        brightness = float(np.mean(gray))

        # 3. Contrast
        contrast = float(np.std(gray))

        # 4. Sharpness / Blur Metric (Laplacian variance)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        sharpness = float(laplacian.var())

        # Check Brightness First
        if brightness < self.min_brightness:
            return QualityMetrics(
                sharpness=round(sharpness, 2),
                brightness=round(brightness, 2),
                face_width=face_w,
                face_height=face_h,
                is_valid=False,
                rejection_reason=f"Lighting is too dark (Brightness {brightness:.1f} < {self.min_brightness:.1f}). Face a light source.",
            )

        if brightness > self.max_brightness:
            return QualityMetrics(
                sharpness=round(sharpness, 2),
                brightness=round(brightness, 2),
                face_width=face_w,
                face_height=face_h,
                is_valid=False,
                rejection_reason="Lighting is overexposed / too bright. Reduce direct glare.",
            )

        if contrast < self.min_contrast:
            return QualityMetrics(
                sharpness=round(sharpness, 2),
                brightness=round(brightness, 2),
                face_width=face_w,
                face_height=face_h,
                is_valid=False,
                rejection_reason="Image contrast is too low.",
            )

        # Check Sharpness
        if sharpness < self.min_sharpness:
            return QualityMetrics(
                sharpness=round(sharpness, 2),
                brightness=round(brightness, 2),
                face_width=face_w,
                face_height=face_h,
                is_valid=False,
                rejection_reason=f"Image is too blurry (Sharpness {sharpness:.1f} < {self.min_sharpness:.1f}). Hold steady.",
            )

        return QualityMetrics(
            sharpness=round(sharpness, 2),
            brightness=round(brightness, 2),
            face_width=face_w,
            face_height=face_h,
            is_valid=True,
            rejection_reason=None,
        )

