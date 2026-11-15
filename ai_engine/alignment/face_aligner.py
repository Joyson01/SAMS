import cv2
import numpy as np

# Standard 5-point ArcFace landmark coordinates for 112x112 canonical crop
ARCFACE_REFERENCE_5PTS = np.array(
    [
        [38.2946, 51.6963],  # Left Eye
        [73.5318, 51.5014],  # Right Eye
        [56.0252, 71.7366],  # Nose Tip
        [41.5493, 92.3655],  # Left Mouth Corner
        [70.7299, 92.2041],  # Right Mouth Corner
    ],
    dtype=np.float32,
)


def estimate_similarity_transform(src_pts: np.ndarray, dst_pts: np.ndarray) -> np.ndarray:
    """Computes similarity transform matrix (Scale + Rotation + Translation) using Umeyama algorithm."""
    src_pts = np.asarray(src_pts, dtype=np.float64)
    dst_pts = np.asarray(dst_pts, dtype=np.float64)

    num = src_pts.shape[0]
    dim = src_pts.shape[1]

    src_mean = src_pts.mean(axis=0)
    dst_mean = dst_pts.mean(axis=0)

    src_centered = src_pts - src_mean
    dst_centered = dst_pts - dst_mean

    src_var = np.var(src_pts, axis=0).sum()

    # Covariance matrix
    cov = np.dot(dst_centered.T, src_centered) / num

    # SVD
    u, d, vt = np.linalg.svd(cov)
    s = np.eye(dim, dtype=np.float64)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s[dim - 1, dim - 1] = -1

    r = np.dot(u, np.dot(s, vt))
    scale = 1.0 / src_var * np.trace(np.dot(np.diag(d), s))

    t = dst_mean - scale * np.dot(r, src_mean)

    m = np.zeros((2, 3), dtype=np.float32)
    m[0:2, 0:2] = scale * r
    m[0:2, 2] = t
    return m


class FaceAligner:
    """Performs 5-point similarity transformation alignment to generate 112x112 canonical crops."""

    def __init__(self, crop_size: int = 112):
        self.crop_size = crop_size
        if crop_size == 112:
            self.ref_pts = ARCFACE_REFERENCE_5PTS
        else:
            scale = crop_size / 112.0
            self.ref_pts = ARCFACE_REFERENCE_5PTS * scale

    def align(self, image: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
        """Aligns and crops the face region into a canonical 112x112 image."""
        pts = np.asarray(landmarks, dtype=np.float32)
        if pts.shape != (5, 2):
            raise ValueError(f"Expected 5x2 landmarks shape, got {pts.shape}")

        # Compute affine similarity matrix
        transform_matrix = estimate_similarity_transform(pts, self.ref_pts)

        # Warp image
        aligned = cv2.warpAffine(
            image,
            transform_matrix,
            (self.crop_size, self.crop_size),
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )
        return aligned

