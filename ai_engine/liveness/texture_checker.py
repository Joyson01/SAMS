from typing import Any, Dict, Optional, Tuple
import cv2
import numpy as np

from ai_engine.base import BoundingBox
from ai_engine.liveness.base import AttackType, BaseLivenessDetector, LivenessResult


class TextureLivenessDetector(BaseLivenessDetector):
    """Passive anti-spoofing detector analyzing 2D Fourier power spectrum, frequency peaks, and skin chromaticity."""

    def __init__(
        self,
        liveness_threshold: float = 0.70,
        max_moiré_thresh: float = 12.0,
        max_skin_chroma_dist: float = 38.0,
    ):
        self.liveness_threshold = liveness_threshold
        self.max_moiré_thresh = max_moiré_thresh
        self.max_skin_chroma_dist = max_skin_chroma_dist

    def predict(
        self,
        image: np.ndarray,
        bbox: BoundingBox,
        landmarks: Optional[np.ndarray] = None,
    ) -> LivenessResult:
        """Evaluates face crop for print and screen replay artifacts."""
        h_img, w_img = image.shape[:2]
        x1, y1, x2, y2 = bbox.to_int_xyxy()

        x1_c = max(0, min(w_img - 1, x1))
        y1_c = max(0, min(h_img - 1, y1))
        x2_c = max(0, min(w_img, x2))
        y2_c = max(0, min(h_img, y2))

        crop = image[y1_c:y2_c, x1_c:x2_c]
        if crop.size == 0 or crop.shape[0] < 30 or crop.shape[1] < 30:
            return LivenessResult(
                is_live=False,
                liveness_score=0.0,
                attack_type=AttackType.UNKNOWN_SPOOF,
                confidence_pct=0.0,
                rejection_reason="Face crop too small for liveness assessment.",
            )

        crop_std = cv2.resize(crop, (128, 128))

        # 1. 2D Fast Fourier Transform (FFT) Power Spectrum
        gray = cv2.cvtColor(crop_std, cv2.COLOR_BGR2GRAY)
        f_transform = np.fft.fft2(gray.astype(np.float32))
        f_shift = np.fft.fftshift(f_transform)
        magnitude_spectrum = np.abs(f_shift)

        # Center mask (low frequencies)
        rows, cols = gray.shape
        crow, ccol = rows // 2, cols // 2
        radius = 20
        y, x = np.ogrid[:rows, :cols]
        mask_center = (x - ccol) ** 2 + (y - crow) ** 2 <= radius ** 2

        high_freq_spectrum = magnitude_spectrum.copy()
        high_freq_spectrum[mask_center] = 0
        total_energy = np.sum(magnitude_spectrum) + 1e-6
        high_freq_energy_ratio = float(np.sum(high_freq_spectrum) / total_energy)

        # Screen Moiré Lattice: standard deviation of radial high-frequency peaks
        moiré_score = float(np.std(high_freq_spectrum) / (np.mean(high_freq_spectrum) + 1e-6))

        # 2. Chromaticity in YCrCb Color Space
        ycrcb = cv2.cvtColor(crop_std, cv2.COLOR_BGR2YCrCb)
        cr = ycrcb[:, :, 1].astype(np.float32)
        cb = ycrcb[:, :, 2].astype(np.float32)

        cr_mean = float(np.mean(cr))
        cb_mean = float(np.mean(cb))
        cr_std = float(np.std(cr))
        cb_std = float(np.std(cb))

        # Distance from authentic live human skin centroid (Cr ≈ 148, Cb ≈ 110)
        skin_chroma_dist = float(np.sqrt((cr_mean - 148.0) ** 2 + (cb_mean - 110.0) ** 2))

        # 3. Decision Logic & Spoof Classification
        attack_type = AttackType.GENUINE
        rejection_reason = None
        base_score = 0.94

        if moiré_score > self.max_moiré_thresh:
            attack_type = AttackType.SCREEN_REPLAY_2D
            base_score = min(base_score, 0.35)
            rejection_reason = f"Screen replay moiré lattice detected (score {moiré_score:.1f} > {self.max_moiré_thresh:.1f})."
        elif (cr_std < 2.5 and cb_std < 2.5) or skin_chroma_dist > self.max_skin_chroma_dist:
            attack_type = AttackType.PRINT_PHOTO_2D
            base_score = min(base_score, 0.38)
            rejection_reason = "2D print photo / unnatural chromatic reflectance detected."
        elif high_freq_energy_ratio > 0.88:
            attack_type = AttackType.RIGID_CUTOUT
            base_score = min(base_score, 0.40)
            rejection_reason = "High frequency paper print edge noise detected."

        # Penalty for borderline chromaticity
        if attack_type == AttackType.GENUINE and skin_chroma_dist > 25.0:
            base_score -= (skin_chroma_dist - 25.0) * 0.01

        liveness_score = float(np.clip(base_score, 0.0, 1.0))
        is_live = liveness_score >= self.liveness_threshold

        details: Dict[str, Any] = {
            "moiré_score": round(moiré_score, 2),
            "high_freq_energy_ratio": round(high_freq_energy_ratio, 4),
            "skin_chroma_dist": round(skin_chroma_dist, 2),
            "cr_mean": round(cr_mean, 1),
            "cb_mean": round(cb_mean, 1),
            "cr_std": round(cr_std, 1),
            "cb_std": round(cb_std, 1),
        }

        return LivenessResult(
            is_live=is_live,
            liveness_score=round(liveness_score, 3),
            attack_type=attack_type if not is_live else AttackType.GENUINE,
            confidence_pct=round(liveness_score * 100.0, 1),
            details=details,
            rejection_reason=rejection_reason if not is_live else None,
        )

