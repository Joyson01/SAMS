# API route inventory

Generated from the current FastAPI OpenAPI schema. Schema presence alone is not proof that every route was exercised. See FINAL_REPORT.md for verified commands.

| Method | Path | Summary |
|---|---|---|
| POST | `/api/v1/attendance/manual` | Record Manual Attendance or Excused Absence |
| POST | `/api/v1/attendance/recognize-frame` | Recognize Faces and Mark Attendance from Camera Frame |
| POST | `/api/v1/attendance/recognize-image` | Recognize Faces and Mark Attendance from Captured/Uploaded Photo |
| PUT | `/api/v1/attendance/records/{record_id}/override` | Manual Attendance Override |
| GET | `/api/v1/attendance/sessions` | List Attendance Sessions |
| POST | `/api/v1/attendance/sessions` | Create Attendance Session |
| GET | `/api/v1/attendance/sessions/{session_id}` | Get Session Details |
| POST | `/api/v1/attendance/sessions/{session_id}/batch-mark` | Batch Mark Attendance |
| PUT | `/api/v1/attendance/sessions/{session_id}/close` | Close Session & Mark Absentees |
| POST | `/api/v1/attendance/sessions/{session_id}/mark` | Mark Student Attendance |
| GET | `/api/v1/attendance/sessions/{session_id}/presence` | Get Live Presence Status for Session |
| GET | `/api/v1/attendance/sessions/{session_id}/records` | Get Session Attendance Records |
| GET | `/api/v1/attendance/sessions/{session_id}/roster` | Get Complete Live Class Roster for Session |
| PUT | `/api/v1/attendance/sessions/{session_id}/start` | Start Session |
| GET | `/api/v1/attendance/students/{student_id}` | Get Student Attendance History |
| GET | `/api/v1/audit-logs` | List Audit Logs |
| POST | `/api/v1/auth/bootstrap-admin` | Bootstrap Admin |
| POST | `/api/v1/auth/login` | Login and receive access/refresh tokens |
| POST | `/api/v1/auth/logout` | Revoke the current session |
| GET | `/api/v1/auth/me` | Get current authenticated user profile |
| GET | `/api/v1/auth/my-attendance` | My Attendance |
| POST | `/api/v1/auth/refresh` | Rotate a refresh token |
| POST | `/api/v1/auth/register` | Register a student or administrator-created account |
| GET | `/api/v1/auth/setup-status` | Setup Status |
| GET | `/api/v1/auth/users` | List Users |
| POST | `/api/v1/auth/users` | Create User |
| PATCH | `/api/v1/auth/users/{user_id}` | Update User |
| PUT | `/api/v1/auth/users/{user_id}/student` | Link Student |
| GET | `/api/v1/cameras` | List Cameras |
| POST | `/api/v1/cameras` | Register Camera |
| GET | `/api/v1/cameras/discover-onvif` | Discover ONVIF IP Cameras |
| POST | `/api/v1/cameras/mobile-frame` | Process Mobile Camera Frame |
| GET | `/api/v1/cameras/mobile-pairing` | Generate Mobile Camera Pairing Token (GET) |
| POST | `/api/v1/cameras/mobile-pairing` | Generate Mobile Camera Pairing Token (POST) |
| GET | `/api/v1/cameras/pairing-session/{token}` | Validate Mobile Pairing Session |
| POST | `/api/v1/cameras/test-connection` | Test Camera Connectivity |
| DELETE | `/api/v1/cameras/{camera_id}` | Delete Camera |
| GET | `/api/v1/cameras/{camera_id}` | Get Camera Details |
| PUT | `/api/v1/cameras/{camera_id}` | Update Camera |
| POST | `/api/v1/cameras/{camera_id}/capture` | Capture Frame From Camera |
| GET | `/api/v1/cameras/{camera_id}/frame` | Get Camera Latest Frame |
| GET | `/api/v1/cameras/{camera_id}/mjpeg` | Get Live MJPEG Video Stream |
| GET | `/api/v1/cameras/{camera_id}/preview` | Get Camera Latest Frame Snapshot |
| POST | `/api/v1/cameras/{camera_id}/start` | Start Camera Worker |
| POST | `/api/v1/cameras/{camera_id}/stop` | Stop Camera Worker |
| GET | `/api/v1/cameras/{camera_id}/test` | Test Registered Camera Feed (GET) |
| POST | `/api/v1/cameras/{camera_id}/test` | Test Registered Camera Feed (POST) |
| GET | `/api/v1/classes` | List Classes |
| POST | `/api/v1/classes` | Create Class Section |
| GET | `/api/v1/classes/timetable/current` | Get Current Active Timetable Entry |
| GET | `/api/v1/classes/timetable/entries` | List All Timetable Entries |
| DELETE | `/api/v1/classes/timetable/entries/{entry_id}` | Delete Timetable Slot |
| PUT | `/api/v1/classes/timetable/entries/{entry_id}` | Update Timetable Slot / Map Subject |
| DELETE | `/api/v1/classes/{class_id}` | Delete Class |
| GET | `/api/v1/classes/{class_id}` | Get Class Details |
| PUT | `/api/v1/classes/{class_id}` | Update Class |
| GET | `/api/v1/classes/{class_id}/batches` | List Batches |
| POST | `/api/v1/classes/{class_id}/batches` | Create Batch |
| DELETE | `/api/v1/classes/{class_id}/batches/{batch_id}` | Delete Batch |
| PUT | `/api/v1/classes/{class_id}/batches/{batch_id}` | Update Batch |
| GET | `/api/v1/classes/{class_id}/subjects` | Class Subjects |
| GET | `/api/v1/classes/{class_id}/timetable` | Get Class Timetable |
| POST | `/api/v1/classes/{class_id}/timetable` | Add Timetable Slot |
| GET | `/api/v1/dashboard/summary` | Consolidated Dashboard Summary |
| GET | `/api/v1/health` | System and Database Health Check |
| POST | `/api/v1/media-attendance/analyze-image` | Diagnostic Face Detection & Recognition on Image |
| POST | `/api/v1/media-attendance/image` | Analyze Static Image for Attendance |
| POST | `/api/v1/media-attendance/image-attendance` | Analyze Static Image for Attendance (Alias) |
| GET | `/api/v1/media-attendance/image/batches` | Batches |
| POST | `/api/v1/media-attendance/image/confirm` | Confirm |
| POST | `/api/v1/media-attendance/image/preview` | Preview |
| GET | `/api/v1/media-attendance/jobs` | List Media Processing Jobs |
| DELETE | `/api/v1/media-attendance/jobs/{job_id}` | Delete Media Job and Storage File |
| GET | `/api/v1/media-attendance/jobs/{job_id}` | Get Media Job Status & Summary |
| POST | `/api/v1/media-attendance/jobs/{job_id}/cancel` | Cancel Running Video Processing Job |
| GET | `/api/v1/media-attendance/jobs/{job_id}/results` | Get Detailed Processing Results for Media Job |
| GET | `/api/v1/media-attendance/session-validation/{session_id}` | Validate Session & Enrolled Student Biometrics |
| POST | `/api/v1/media-attendance/video` | Upload Video for Attendance Processing |
| POST | `/api/v1/media-attendance/video-attendance` | Upload Video for Attendance Processing (Alias) |
| POST | `/api/v1/phone-attendance/{session_id}/capture` | Capture |
| POST | `/api/v1/phone-attendance/{session_id}/pair` | Pair Phone |
| GET | `/api/v1/ping` | Quick Liveness Probe |
| POST | `/api/v1/recognition/analyze-frame` | Analyze Frame |
| GET | `/api/v1/recognition/config` | Get Full AI Recognition Configuration |
| POST | `/api/v1/recognition/config` | Update AI Recognition Configuration (POST) |
| PUT | `/api/v1/recognition/config` | Update AI Recognition Configuration |
| POST | `/api/v1/recognition/debug/detect` | Debug Face Detection Endpoint |
| POST | `/api/v1/recognition/detect` | Detect Faces and Analyze Quality in Frame |
| POST | `/api/v1/recognition/process` | Process Image Frame for Face Recognition |
| POST | `/api/v1/recognition/stream/reset` | Reset Stream Tracking & Identity Cache |
| POST | `/api/v1/recognition/sync-gallery` | Synchronize In-Memory Vector Gallery with Database |
| GET | `/api/v1/recognition/thresholds` | Get Active Similarity Thresholds |
| POST | `/api/v1/recognition/thresholds` | Update Similarity Thresholds (POST) |
| PUT | `/api/v1/recognition/thresholds` | Update Similarity Thresholds |
| GET | `/api/v1/reports/analytics` | Get Institutional Attendance Analytics |
| GET | `/api/v1/reports/export/csv` | Export Attendance Records to CSV |
| GET | `/api/v1/reports/summary` | Get Institutional Attendance Analytics Summary Alias |
| GET | `/api/v1/students` | List Students with Search and Filters |
| POST | `/api/v1/students` | Register a New Student |
| GET | `/api/v1/students/stats` | Student Metrics Summary |
| DELETE | `/api/v1/students/{student_id}` | Delete Student |
| GET | `/api/v1/students/{student_id}` | Get Student Details |
| PUT | `/api/v1/students/{student_id}` | Update Student Profile |
| POST | `/api/v1/students/{student_id}/enroll` | Capture & Enroll Face Sample |
| POST | `/api/v1/students/{student_id}/enroll/check` | Check Enrollment |
| GET | `/api/v1/students/{student_id}/enroll/status` | Get Enrollment Status |
| GET | `/api/v1/subjects` | List Subjects |
| POST | `/api/v1/subjects` | Create Subject |
| DELETE | `/api/v1/subjects/{subject_id}` | Delete / Deactivate Subject |
| GET | `/api/v1/subjects/{subject_id}` | Get Subject Details |
| PUT | `/api/v1/subjects/{subject_id}` | Update Subject |
| GET | `/api/v1/sync/pull` | Pull Incremental Delta Updates |
| POST | `/api/v1/sync/push` | Push Batch Events from Edge |
| GET | `/api/v1/sync/status` | Get Sync Queue Status |
| POST | `/api/v1/sync/trigger` | Trigger Sync Flush |
