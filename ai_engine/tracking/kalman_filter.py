import numpy as np
from scipy.linalg import block_diag


class KalmanBoxTracker:
    """Kalman Filter for tracking bounding boxes in image space.

    State space vector (7-dim):
        [x, y, s, r, dx, dy, ds]
        where (x, y) is box center, s is area/scale, r is aspect ratio (w/h),
        and (dx, dy, ds) are the respective velocities.
    """

    count = 0

    def __init__(self, bbox_xyxy: np.ndarray):
        """Initializes a tracker from an initial bounding box [x1, y1, x2, y2]."""
        KalmanBoxTracker.count += 1
        self.id = KalmanBoxTracker.count

        # 7-state Kalman filter
        self.dim_z = 4  # [x, y, s, r]
        self.dim_x = 7  # [x, y, s, r, dx, dy, ds]

        # State transition matrix F
        self.F = np.eye(self.dim_x, dtype=np.float32)
        for i in range(3):
            self.F[i, i + 4] = 1.0  # constant velocity model

        # Measurement matrix H
        self.H = np.eye(self.dim_z, self.dim_x, dtype=np.float32)

        # Covariance matrix P
        self.P = np.eye(self.dim_x, dtype=np.float32) * 10.0
        self.P[4:, 4:] *= 100.0  # high uncertainty for initial velocities

        # Measurement noise R
        self.R = np.eye(self.dim_z, dtype=np.float32)
        self.R[2:, 2:] *= 10.0

        # Process noise Q
        self.Q = np.eye(self.dim_x, dtype=np.float32)
        self.Q[4:, 4:] *= 0.01

        # Initial state x
        self.x = np.zeros((self.dim_x, 1), dtype=np.float32)
        self.x[:4] = self._convert_bbox_to_z(bbox_xyxy)

        self.time_since_update = 0
        self.history = []
        self.hits = 1
        self.hit_streak = 1
        self.age = 1

    @staticmethod
    def _convert_bbox_to_z(bbox_xyxy: np.ndarray) -> np.ndarray:
        """Converts [x1, y1, x2, y2] to [x_center, y_center, area, aspect_ratio]."""
        x1, y1, x2, y2 = bbox_xyxy[:4]
        w = max(1e-3, float(x2 - x1))
        h = max(1e-3, float(y2 - y1))
        x_center = x1 + w / 2.0
        y_center = y1 + h / 2.0
        area = w * h
        aspect_ratio = w / h
        return np.array([[x_center], [y_center], [area], [aspect_ratio]], dtype=np.float32)

    @staticmethod
    def _convert_x_to_bbox(x: np.ndarray) -> np.ndarray:
        """Converts state [x_center, y_center, area, aspect_ratio] to [x1, y1, x2, y2]."""
        x_center = float(x[0, 0])
        y_center = float(x[1, 0])
        area = max(1.0, float(x[2, 0]))
        aspect_ratio = max(1e-2, float(x[3, 0]))

        w = np.sqrt(area * aspect_ratio)
        h = area / max(1e-3, w)

        x1 = x_center - w / 2.0
        y1 = y_center - h / 2.0
        x2 = x_center + w / 2.0
        y2 = y_center + h / 2.0
        return np.array([x1, y1, x2, y2], dtype=np.float32)

    def predict(self) -> np.ndarray:
        """Advances state vector and returns predicted bounding box [x1, y1, x2, y2]."""
        if (self.x[2, 0] + self.x[6, 0]) <= 0:
            self.x[6, 0] = 0.0

        # State projection: x = F * x
        self.x = np.dot(self.F, self.x)
        # Covariance projection: P = F * P * F^T + Q
        self.P = np.dot(np.dot(self.F, self.P), self.F.T) + self.Q

        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1

        predicted_box = self._convert_x_to_bbox(self.x)
        self.history.append(predicted_box)
        return predicted_box

    def update(self, bbox_xyxy: np.ndarray) -> None:
        """Updates tracker state with observed measurement [x1, y1, x2, y2]."""
        self.time_since_update = 0
        self.history = []
        self.hits += 1
        self.hit_streak += 1

        # Measurement residual: y = z - H * x
        z = self._convert_bbox_to_z(bbox_xyxy)
        y = z - np.dot(self.H, self.x)

        # Innovation covariance: S = H * P * H^T + R
        S = np.dot(np.dot(self.H, self.P), self.H.T) + self.R
        # Kalman gain: K = P * H^T * S^-1
        K = np.dot(np.dot(self.P, self.H.T), np.linalg.inv(S))

        # Updated state: x = x + K * y
        self.x = self.x + np.dot(K, y)
        # Updated covariance: P = (I - K * H) * P
        I = np.eye(self.dim_x, dtype=np.float32)
        self.P = np.dot(I - np.dot(K, self.H), self.P)

    def get_state(self) -> np.ndarray:
        """Returns current bounding box estimate [x1, y1, x2, y2]."""
        return self._convert_x_to_bbox(self.x)

