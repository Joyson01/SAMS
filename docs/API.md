# RESTful API & WebSocket Reference

## Smart Attendance Management System (SAMS)

---

## 1. Global API Standards

- **Base URL:** `/api/v1` (with `/api` alias for backwards compatibility)
- **Protocol:** HTTP/1.1, HTTP/2 & WebSockets (WSS/WS)
- **Data Format:** `application/json` & `multipart/form-data` (file uploads)
- **Error Response Standard (RFC 7807 Problem Details):**

```json
{
  "status_code": 400,
  "detail": "Please select an attendance session before recognizing photo.",
  "error_code": "SESSION_REQUIRED"
}
```

---

## 2. Health & Diagnostics

### System Health
- **Endpoint:** `GET /health` or `GET /api/v1/health`
- **Response (200 OK):**
```json
{
  "status": "healthy",
  "database": "connected",
  "ai_engine": "ready",
  "version": "1.0.0"
}
```

---

## 3. Student Management & Biometric Enrollment

### 3.1 List Students
- **Endpoint:** `GET /api/v1/students`
- **Query Parameters:** `search`, `department`, `class_name`, `page`, `page_size`
- **Response (200 OK):** List of student objects.

### 3.2 Create Student
- **Endpoint:** `POST /api/v1/students`
- **Request Body:**
```json
{
  "student_code": "DEMO001",
  "roll_number": "CS2026-001",
  "first_name": "Aarav",
  "last_name": "Patel",
  "email": "aarav.patel@demo-campus.edu",
  "department": "Computer Science",
  "class_name": "CSE-4A",
  "section": "A"
}
```

### 3.3 Enroll Face Sample
- **Endpoint:** `POST /api/v1/students/{student_id}/enroll`
- **Content-Type:** `multipart/form-data`
- **Parameters:** `file` (Image file), `pose_type` (e.g. `FRONT`)
- **Response (200 OK):** Evaluated face quality metrics, embedding extraction confirmation.

---

## 4. Attendance Sessions & Photo Recognition

### 4.1 Create Attendance Session
- **Endpoint:** `POST /api/v1/attendance/sessions`
- **Request Body:**
```json
{
  "class_name": "CSE-4A",
  "subject": "Artificial Intelligence & Machine Learning",
  "room": "Room 204",
  "scheduled_date": "2026-08-31",
  "start_time": "09:00:00",
  "end_time": "10:00:00",
  "attendance_mode": "AI_FACE_RECOGNITION"
}
```

### 4.2 Photo Capture / Image Recognition
- **Endpoint:** `POST /api/v1/attendance/recognize-image` (or `POST /api/attendance/recognize-image`)
- **Content-Type:** `multipart/form-data`
- **Parameters:** `image` or `file`, `session_id`
- **Response (200 OK):**
```json
{
  "success": true,
  "faces_detected": 1,
  "students_recognized": 1,
  "attendance_marked": 1,
  "duplicates_skipped": 0,
  "unknown_faces": 0,
  "results": [
    {
      "student_id": "3a7b9c1d-...",
      "name": "Aarav Patel",
      "student_code": "DEMO001",
      "roll_number": "CS2026-001",
      "confidence": 0.8924,
      "status": "VERIFIED",
      "attendance_marked": true,
      "already_present": false,
      "bbox": { "x1": 120, "y1": 80, "x2": 260, "y2": 240, "width": 140, "height": 160 }
    }
  ],
  "annotated_image_url": "/outputs/capture_a1b2c3d4_detected.jpg",
  "processing_time_ms": 78.4
}
```

---

## 5. Media Attendance (Images & Recorded Videos)

### 5.1 Analyze Classroom Group Image
- **Endpoint:** `POST /api/v1/media-attendance/image`
- **Content-Type:** `multipart/form-data`
- **Parameters:** `file`, `session_id`, `min_confidence` (default: 0.65)
- **Response (200 OK):** Immediate multi-face bounding boxes, matched identities, and committed attendance.

### 5.2 Upload Recorded Video Lecture
- **Endpoint:** `POST /api/v1/media-attendance/video`
- **Content-Type:** `multipart/form-data`
- **Parameters:** `file`, `session_id`, `frame_interval` (default: 15 frames)
- **Response (202 Accepted):** Returns background `job_id` for tracking.

### 5.3 Poll Job Status & Results
- **Endpoint:** `GET /api/v1/media-attendance/jobs/{job_id}`
- **Endpoint:** `GET /api/v1/media-attendance/jobs/{job_id}/results`

---

## 6. Live Stream & WebSocket API

### 6.1 WebSocket Video Stream Recognition
- **WebSocket Endpoint:** `ws://<host>:8000/api/v1/stream/ws`
- **Client Protocol:**
  - Send JSON control: `{"type": "sync_gallery"}`
  - Send binary JPEG frames
- **Server Broadcasts (JSON Telemetry):**
```json
{
  "type": "telemetry",
  "fps": 24.5,
  "faces_detected": 2,
  "recognized_count": 2,
  "faces": [
    {
      "track_id": 1,
      "name": "Aarav Patel",
      "student_code": "DEMO001",
      "confidence": 0.91,
      "decision": "KNOWN",
      "bbox": [140, 90, 280, 250]
    }
  ]
}
```

---

## 7. Camera Management

- **List Cameras:** `GET /api/v1/cameras`
- **Register Camera:** `POST /api/v1/cameras` (supports `WEBCAM`, `RTSP`, `IP_CAMERA`)
- **Test Stream Connectivity:** `POST /api/v1/cameras/{id}/test`

---

## 8. Academic Curriculum & Timetable

- **Subjects:** `GET /api/v1/subjects`, `POST /api/v1/subjects`
- **Classes & Sections:** `GET /api/v1/classes`, `POST /api/v1/classes`
- **Timetable Schedule:** `GET /api/v1/classes/{id}/timetable`, `POST /api/v1/classes/{id}/timetable`

---

## 9. Reports & Exports

- **Session Report:** `GET /api/v1/reports/sessions/{session_id}`
- **Daily Summary:** `GET /api/v1/reports/daily?date=2026-08-31`
- **Export CSV/Excel:** `GET /api/v1/reports/export?session_id={session_id}&format=csv`
