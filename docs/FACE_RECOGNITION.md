# Computer Vision & Face Recognition Pipeline

The **Smart Attendance Management System (SAMS)** incorporates a multi-stage, real-time computer vision pipeline engineered for multi-person classroom attendance, occlusion robustness, spoofing detection, and high-accuracy biometric verification.

---

## 🏗️ Architectural Flow

```
+-----------------------------------------------------------------------+
|                              INPUT SOURCE                             |
|       (Webcam Stream / RTSP CCTV / Mobile IP Camera / Uploaded Video) |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 1: FRAME ACQUISITION                        |
|        - EXIF Orientation Normalization                               |
|        - Format standardisation (OpenCV BGR ndarray)                  |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 2: FACE DETECTION (SCRFD)                   |
|        - InsightFace SCRFD-10G Single-Shot Face Detector              |
|        - 5-Point Facial Landmark Localization (Eyes, Nose, Mouth)     |
|        - Confidence filtering (threshold >= 0.60)                     |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 3: QUALITY & POSE VALIDATION                |
|        - Minimum Bounding Box Scale Check (>= 60x60 px)               |
|        - Laplacian Variance Blur & Sharpness Analysis                 |
|        - 3D Head Pose Estimation (Yaw, Pitch, Roll <= 35°)            |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 4: ANTI-SPOOFING LIVENESS                   |
|        - Frequency Texture FFT Spectrum Analysis                      |
|        - HSV Skin Chrominance Distribution Checking                   |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 5: 2D AFFINE ALIGNMENT                      |
|        - Similarity Transform to 112x112 px Standard Canonical Face   |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 6: EMBEDDING EXTRACTION                     |
|        - ArcFace (ResNet-50 / buffalo_l) Deep Feature Representation  |
|        - 512-Dimensional Dense Vector Output                          |
|        - L2 Normalization (||v||_2 = 1.0)                             |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 7: VECTOR SIMILARITY MATCHING               |
|        - Cosine Similarity via Dot Product: cos(θ) = v_q · v_e        |
|        - Threshold: >= 0.65 -> KNOWN (Verified Identity)              |
|        - Threshold: 0.40 - 0.64 -> CANDIDATE / UNCERTAIN              |
|        - Threshold: < 0.40 -> UNKNOWN Face                            |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 8: MULTI-FRAME TEMPORAL VOTING              |
|        - ByteTrack Association across consecutive video frames        |
|        - Temporal sliding window consensus (e.g. 3 of 5 frames)       |
+-----------------------------------v-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     STAGE 9: ATTENDANCE COMMIT & DEDUPLICATION        |
|        - Database Unique Constraint: (session_id, student_id)         |
|        - Mark PRESENT once per student session                        |
+-----------------------------------------------------------------------+
```

---

## 🧮 Mathematical Formulation

### 1. L2 Normalization
Given an unnormalized feature vector $\mathbf{x} \in \mathbb{R}^{512}$ extracted from the ArcFace backbone:
$$\mathbf{\hat{x}} = \frac{\mathbf{x}}{\|\mathbf{x}\|_2} = \frac{\mathbf{x}}{\sqrt{\sum_{i=1}^{512} x_i^2}}$$

### 2. Cosine Similarity Matching
Because all gallery embeddings $\mathbf{e}_j$ and query embeddings $\mathbf{\hat{x}}$ are unit vectors ($\|\mathbf{\hat{x}}\|_2 = \|\mathbf{e}_j\|_2 = 1$), the cosine similarity reduces to an ultra-fast dot product:
$$\text{Sim}(\mathbf{\hat{x}}, \mathbf{e}_j) = \mathbf{\hat{x}}^\top \mathbf{e}_j = \sum_{k=1}^{512} \hat{x}_k \cdot e_{j,k}$$

### 3. Decision Boundary
The system classifies detection candidate $i$ as:
$$\text{Identity}(i) = \begin{cases} 
\text{Student } j^* & \text{if } \max_j \text{Sim}(\mathbf{\hat{x}}_i, \mathbf{e}_j) \ge 0.65 \\
\text{UNCERTAIN} & \text{if } 0.40 \le \max_j \text{Sim}(\mathbf{\hat{x}}_i, \mathbf{e}_j) < 0.65 \\
\text{UNKNOWN} & \text{if } \max_j \text{Sim}(\mathbf{\hat{x}}_i, \mathbf{e}_j) < 0.40
\end{cases}$$
where $j^* = \arg\max_j \text{Sim}(\mathbf{\hat{x}}_i, \mathbf{e}_j)$.

---

## 🛡️ Duplicate Prevention Mechanisms

1. **In-Frame Deduplication**: If multiple bounding boxes in the same image match the same student ID, only the highest-confidence candidate is verified; secondary detections are flagged to prevent duplicate counts.
2. **Session-Level Database Constraints**: Enforced by composite unique constraint:
   ```sql
   CONSTRAINT uq_session_student_attendance UNIQUE (session_id, student_id)
   ```
3. **Application-Level State Check**: Prior to inserting, the system checks presence status and updates `last_seen` timestamp and max confidence instead of creating duplicate rows.
