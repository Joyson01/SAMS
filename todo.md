You are working inside my existing repository:

JOJIPA-SAMS — Smart Attendance Management System

IMPORTANT:
DO NOT create a new project.
DO NOT replace the existing architecture.
DO NOT rewrite working modules unnecessarily.
DO NOT remove existing features.
FIRST inspect the entire repository, README.md, backend, frontend, database models, APIs, AI engine, tests, and documentation.

The existing project already contains:

- React 18 + TypeScript + Vite frontend
- FastAPI backend
- SQLAlchemy
- InsightFace / SCRFD / ArcFace
- Face embeddings
- ByteTrack / Kalman tracking
- Liveness / anti-spoofing
- Webcam attendance
- Mobile IP camera
- RTSP/CCTV
- Image attendance
- Video attendance
- Timetable
- Reports
- Audit logs
- Attendance database
- Existing tests

Your job is to EVOLVE the existing project into a significantly more innovative:

# AI-Powered Smart Attendance & Academic Presence Intelligence System

The final application should feel like a production-grade university attendance platform, not a basic CRUD attendance application.

==================================================

1. # FIRST: REPOSITORY AUDIT

Before modifying anything:

1. Read README.md completely.
2. Inspect the project tree.
3. Inspect all existing frontend routes/pages/components.
4. Inspect all FastAPI routers.
5. Inspect SQLAlchemy models and migrations.
6. Inspect the existing AI recognition pipeline.
7. Inspect existing attendance/session logic.
8. Inspect timetable implementation.
9. Inspect authentication and roles.
10. Inspect existing tests.
11. Identify what is already implemented versus missing.
12. Reuse existing components/services wherever possible.

Create an internal implementation plan based on the actual repository.

Do NOT assume that something is missing merely because it is not described below.

================================================== 2. CORE PRODUCT VISION
==================================================

Transform SAMS from:

"Face Recognition Attendance"

into:

"Classroom Presence Intelligence"

The system should combine:

FACE RECOGNITION

- FACE EMBEDDINGS
- LIVENESS / ANTI-SPOOFING
- FACE TRACKING
- TIMETABLE CONTEXT
- CLASSROOM CONTEXT
- ATTENDANCE HISTORY
- CONFIDENCE SCORING
- ANOMALY DETECTION
- ATTENDANCE RISK PREDICTION

The AI should assist faculty rather than blindly marking everyone.

The workflow should become:

Timetable
→ Current Session
→ Eligible Students
→ Camera / Photo
→ Face Detection
→ Tracking
→ Quality Check
→ Liveness
→ Face Embedding
→ Identity Matching
→ Confidence Evaluation
→ Temporal/Visual Evidence
→ Attendance Candidate
→ Faculty Review
→ Attendance Confirmation
→ Analytics
→ Risk Prediction
→ Alerts

================================================== 3. INTELLIGENT TIMETABLE SYSTEM
==================================================

Upgrade the timetable into the central context engine.

The system should understand:

- Academic year
- Semester
- Department
- Program
- Class
- Division/Section
- Subject
- Faculty
- Classroom
- Day
- Start time
- End time
- Lecture type
- Lab batch
- Academic calendar
- Holidays

Add:

"Current Session"

The application should automatically determine what class is currently active based on:

current time

- day
- faculty
- room/class context

Example:

Monday 10:00 AM
Room 204
Faculty A

Automatically resolve:

TY B.Tech CSE
Artificial Intelligence
Faculty A
Room 204

Then restrict face matching to only the students eligible for that session.

This is extremely important.

Do not perform unnecessary global gallery matching if the current class roster is known.

================================================== 4. NEW SMART ATTENDANCE WORKFLOW
==================================================

Create an optimized faculty workflow:

FACULTY LOGIN
↓
TODAY'S TIMETABLE
↓
CURRENT / UPCOMING CLASS
↓
START ATTENDANCE
↓
CAMERA / PHOTO
↓
AI PROCESSING
↓
LIVE ATTENDANCE BOARD
↓
FACULTY REVIEW
↓
CONFIRM ATTENDANCE
↓
SESSION LOCK
↓
ANALYTICS

The faculty should NOT have to manually select class, semester and subject every time when the timetable already determines it.

Still provide a manual override for exceptional cases.

================================================== 5. "CAPTURE FEW PHOTOS" FEATURE
==================================================

Make photo-based attendance a first-class feature.

Faculty should be able to:

- Capture photo 1
- Capture photo 2
- Capture photo 3

or upload classroom photos.

The system combines detections across all images.

Example:

Photo 1 → 32 students detected
Photo 2 → 41 students detected
Photo 3 → 45 students detected

After merging identities:

45 unique students recognized
7 students absent
2 uncertain

Display:

PRESENT: 45
ABSENT: 7
REVIEW: 2
UNKNOWN: 1

Do NOT count the same student multiple times across photographs.

================================================== 6. SMART ATTENDANCE CONFIDENCE
==================================================

Create an explicit confidence model.

Each recognition should contain:

- Student
- Similarity score
- Detection confidence
- Face quality
- Liveness result
- Number of supporting frames/images
- Temporal consistency
- Final confidence
- Decision

Possible states:

PRESENT
REVIEW REQUIRED
UNKNOWN
REJECTED

Example:

Rahul
Similarity: 0.91
Face Quality: Good
Liveness: Passed
Evidence: 4 frames
Final Confidence: 96%
Status: PRESENT

Priya
Similarity: 0.62
Face Quality: Fair
Liveness: Passed
Evidence: 1 frame
Final Confidence: 61%
Status: REVIEW REQUIRED

Do not automatically mark low-confidence identities as present.

================================================== 7. ATTENDANCE EVIDENCE
==================================================

Make every attendance record explainable.

For each AI-generated attendance record maintain metadata such as:

- session_id
- student_id
- timestamp
- source
- similarity score
- confidence
- detection quality
- liveness result
- track ID if applicable
- number of observations
- AI/manual decision
- reviewer
- review timestamp

Faculty should be able to understand WHY the AI marked someone present.

================================================== 8. ANTI-SPOOFING
==================================================

Use the existing liveness/anti-spoofing implementation.

Improve integration into the attendance decision pipeline.

A face should not become a valid attendance candidate merely because it matches an embedding.

Decision should consider:

Identity

- Face quality
- Liveness
- Temporal evidence

If the existing anti-spoofing implementation is limited, structure the system so a stronger model can be plugged in later.

Do not fake liveness results.

For demo mode, clearly label simulated/demo results.

================================================== 9. ATTENDANCE INTELLIGENCE DASHBOARD
==================================================

Upgrade the dashboard substantially.

Create a modern institutional dashboard containing:

TODAY:

- Total classes
- Classes completed
- Classes pending
- Students present
- Students absent
- Average attendance
- Low attendance count
- AI recognition accuracy/quality metrics
- Sessions requiring review

Charts:

- Attendance trend
- Department comparison
- Class comparison
- Subject-wise attendance
- Daily attendance
- Weekly attendance
- Monthly attendance

Add "Attention Required":

- Students below 75%
- Students approaching 75%
- Frequent absentees
- Attendance anomalies
- Sessions with many unknown faces
- Sessions requiring faculty review

================================================== 10. ATTENDANCE RISK PREDICTION
==================================================

Add an innovative "Attendance Risk Intelligence" feature.

For every student/subject calculate:

Current attendance %

- Classes attended
- Classes conducted
- Recent absence pattern
- Remaining classes

Estimate whether the student is likely to fall below the institution's threshold.

Example UI:

ATTENDANCE RISK

Rahul Sharma
Current: 78%
Projected: 71%
Risk: HIGH
Estimated threshold breach: 3 classes

Another:

Priya Patel
Current: 84%
Projected: 81%
Risk: LOW

Use transparent calculations.

Do NOT claim machine-learning prediction if it is only a deterministic statistical calculation.

Call it "Projected Attendance" or "Risk Score" unless a real ML model exists.

================================================== 11. SMART 75% DEFaULTER SYSTEM
==================================================

Create configurable attendance thresholds.

Default:

75%

But administrators should be able to configure:

- Minimum attendance percentage
- Warning threshold
- Critical threshold

Example:

> = 85% → Safe
> 75–84% → Watch
> 65–74% → Warning
> <65% → Critical

Automatically generate:

- Defaulter list
- Warning list
- Critical list

================================================== 12. ATTENDANCE ANOMALY DETECTION
==================================================

Introduce an "Attendance Integrity" module.

Detect suspicious or unusual patterns such as:

- Same student appearing in multiple simultaneous sessions
- Multiple attendance submissions for the same session
- Unusually large manual attendance modifications
- Large percentage of unknown faces
- Abnormally low recognition confidence
- Attendance modified after session closure
- Attendance created outside scheduled session time
- Same student repeatedly appearing only briefly
- Unusual attendance spikes

Do not automatically accuse a student of misconduct.

Use neutral language:

"Anomaly Detected"
"Requires Review"

================================================== 13. FACULTY ATTENDANCE REVIEW
==================================================

Create a professional review interface.

After AI processing:

┌─────────────────────────────────────────┐
│ Artificial Intelligence — Room 204 │
│ Monday 10:00–11:00 │
├─────────────────────────────────────────┤
│ Present 45 │
│ Absent 7 │
│ Review 2 │
│ Unknown 1 │
├─────────────────────────────────────────┤
│ Student Confidence Status │
│ Rahul 96% Present │
│ Ankit 94% Present │
│ Priya 61% Review │
└─────────────────────────────────────────┘

Allow faculty to:

- Confirm
- Change Present → Absent
- Change Absent → Present
- Resolve Review
- Ignore unknown face

Every manual modification must enter the audit log.

================================================== 14. SESSION LIFECYCLE
==================================================

Implement a proper attendance session lifecycle:

SCHEDULED
↓
READY
↓
ACTIVE
↓
PROCESSING
↓
REVIEW_REQUIRED
↓
CONFIRMED
↓
LOCKED

Optional:

CANCELLED

After LOCKED:

- Faculty cannot silently modify records.
- Any correction requires explicit authorized override.
- Log who changed what and why.

================================================== 15. ATTENDANCE SOURCES
==================================================

Maintain support for the existing sources:

1. Webcam
2. Mobile camera
3. RTSP/CCTV
4. Group photograph
5. Recorded video

Every attendance record must identify its source.

Example:

source = webcam
source = mobile_ip
source = rtsp
source = image
source = video

Do not break existing ingestion systems.

================================================== 16. STUDENT FACE ENROLLMENT
==================================================

Improve enrollment UX.

Enrollment workflow:

Student
↓
Capture 3–5 images
↓
Quality validation
↓
Face detection
↓
Embedding extraction
↓
Embedding normalization
↓
Multiple embedding storage
↓
Enrollment verification

Reject:

- No face
- Multiple faces
- Excessive blur
- Extreme pose
- Poor lighting

Show useful feedback.

Example:

"Face too small"
"Move closer"
"Improve lighting"
"Only one face should be visible"

Do not store raw images unnecessarily.

================================================== 17. EMBEDDING ARCHITECTURE
==================================================

Preserve the existing InsightFace / ArcFace implementation.

Support:

- Multiple embeddings per student
- Normalized vectors
- Efficient similarity search
- Class/session scoped matching
- Embedding versioning

Do not hard-code thresholds throughout the code.

Move recognition thresholds into configuration.

Example:

KNOWN_THRESHOLD
REVIEW_THRESHOLD
LIVENESS_THRESHOLD
QUALITY_THRESHOLD

Document that thresholds must be calibrated against representative institutional data.

Do not claim that 0.65 is universally correct.

================================================== 18. PRIVACY & SECURITY
==================================================

Treat biometric data as sensitive.

Implement or strengthen:

- Role-based access control
- Secure authentication
- Password hashing
- JWT/session security
- Audit logging
- Restricted biometric access
- No biometric data in frontend logs
- No embedding exposure through public APIs
- Upload validation
- File type validation
- Maximum upload size
- Secure deletion
- Environment-based secrets

Clearly separate:

Raw image data
Biometric embeddings
Attendance records
Audit records

Do not log face embeddings.

================================================== 19. ADMIN PORTAL
==================================================

Admin should have:

Dashboard
Students
Faculty
Departments
Programs
Classes
Subjects
Classrooms
Timetable
Face Enrollment
Attendance Sessions
Reports
Defaulters
Analytics
Anomalies
Audit Logs
System Settings

================================================== 20. FACULTY PORTAL
==================================================

Faculty should have:

Dashboard
Today's Timetable
Current Session
Take Attendance
Live Attendance
Photo Attendance
Attendance History
Subject Analytics
Student Attendance
Review Queue

================================================== 21. STUDENT PORTAL
==================================================

Students should have:

Dashboard
Overall Attendance
Subject-wise Attendance
Attendance Calendar
Attendance History
Projected Attendance
Risk Status

Example:

Operating Systems
82%
Safe

Artificial Intelligence
73%
Warning

Database Systems
91%
Safe

================================================== 22. REPORTING
==================================================

Implement professional reports:

- Daily attendance
- Weekly attendance
- Monthly attendance
- Subject-wise
- Class-wise
- Department-wise
- Faculty-wise
- Student-wise
- Defaulter
- Low attendance
- Attendance anomaly
- Session summary

Support CSV export and existing report functionality.

If practical, add PDF-ready print layouts without breaking existing exports.

================================================== 23. UI/UX REDESIGN
==================================================

The UI should feel like a modern AI SaaS product.

Use:

- Clean dashboard
- Strong visual hierarchy
- Responsive design
- Professional typography
- Consistent cards
- Status badges
- Charts
- Tables
- Search/filter
- Empty states
- Loading states
- Error states
- Toast notifications
- Confirmation dialogs

Use the existing Tailwind/Lucide stack unless there is a strong reason not to.

Do not introduce unnecessary UI libraries.

The main attendance page should make the AI process visually understandable:

CAPTURE
→ DETECT
→ RECOGNIZE
→ VERIFY
→ REVIEW
→ CONFIRM

================================================== 24. REAL-TIME PROCESSING UX
==================================================

For live attendance show:

Camera feed

- Bounding boxes
- Student names
- Confidence
- Recognition state

Example:

[FACE BOX]
Rahul Sharma
96%
PRESENT

[FACE BOX]
Unknown
—
REVIEW

Show real-time counters:

Detected: 47
Recognized: 45
Review: 2
Unknown: 1

Do not expose unnecessary technical model details to normal faculty users.

Provide advanced technical information in an expandable diagnostics panel.

================================================== 25. DEMO MODE
==================================================

The project must remain easy to demonstrate without requiring expensive CCTV hardware.

Create a robust demo mode if appropriate.

Demo should support:

- Seeded fictional students
- Sample timetable
- Sample attendance sessions
- Sample recognition results
- Sample analytics
- Sample risk predictions

Clearly label simulated/demo AI outputs.

Never fabricate real biometric recognition results in production mode.

================================================== 26. DATABASE
==================================================

Inspect existing schema first.

Extend existing models instead of creating duplicate models.

Where appropriate, support entities such as:

User
Student
Faculty
Department
Program
Class
Subject
Classroom
TimetableEntry
AcademicSession
AttendanceRecord
FaceEmbedding
RecognitionEvent
AttendanceReview
AttendanceAnomaly
AuditLog
Notification
SystemSetting

Use migrations.

Do not destroy existing development data unless absolutely necessary.

================================================== 27. API DESIGN
==================================================

Preserve existing API compatibility.

Add APIs where required, for example:

/sessions/current
/sessions/{id}/start
/sessions/{id}/process
/sessions/{id}/review
/sessions/{id}/confirm
/sessions/{id}/lock

/attendance/summary
/attendance/risk
/attendance/defaulters
/attendance/anomalies

/timetable/today
/timetable/current

/recognition/batch
/recognition/confidence

/enrollment/quality

Use proper Pydantic schemas.

Return clean typed responses.

================================================== 28. FRONTEND TYPES
==================================================

Keep TypeScript strict.

Create/update types for:

AcademicSession
TimetableEntry
RecognitionResult
RecognitionCandidate
AttendanceRecord
AttendanceSummary
AttendanceRisk
AttendanceAnomaly
AttendanceReview
FaceEnrollment
DashboardMetrics

Avoid any where possible.

================================================== 29. TESTING
==================================================

IMPORTANT:

Do not break existing tests.

Run:

pytest

Then frontend:

npm run build

If the repository uses pnpm, use the existing package manager.

Add tests for the new functionality.

At minimum test:

- Current timetable resolution
- Session creation
- Eligible student filtering
- Multi-photo deduplication
- Recognition confidence states
- Attendance creation
- Duplicate prevention
- Session locking
- Manual correction audit
- 75% defaulter calculation
- Projected attendance
- Risk classification
- Anomaly detection
- Role permissions

Fix regressions instead of weakening tests.

================================================== 30. DOCUMENTATION
==================================================

Update README.md to reflect the enhanced architecture.

Update/create:

docs/ARCHITECTURE.md
docs/FACE_RECOGNITION.md
docs/API.md
docs/DEMO_GUIDE.md
docs/INSTALLATION.md

Add a clear section:

"AI-Powered Classroom Presence Intelligence"

Explain:

Timetable Context
→ Eligible Roster
→ Visual Evidence
→ Recognition
→ Confidence
→ Attendance
→ Analytics
→ Risk Prediction

================================================== 31. PERFORMANCE
==================================================

Do not perform expensive operations unnecessarily.

Optimize:

- Class-scoped gallery matching
- Embedding comparisons
- Batch image processing
- Frame sampling
- Tracking
- Database writes
- WebSocket updates

Avoid blocking the FastAPI event loop with heavy CPU-bound AI work.

Use the existing architecture and background/thread/process mechanisms where appropriate.

================================================== 32. IMPORTANT ENGINEERING RULES
==================================================

1. Inspect before implementing.
2. Reuse existing functionality.
3. Do not duplicate services.
4. Do not create parallel implementations of the same feature.
5. Preserve API compatibility where possible.
6. Preserve existing database data.
7. Use migrations for schema changes.
8. Do not hard-code institution-specific values.
9. Make thresholds configurable.
10. Never claim fake AI accuracy.
11. Never fabricate real recognition.
12. Clearly distinguish demo mode from production mode.
13. Do not expose biometric embeddings.
14. Do not store unnecessary raw face images.
15. Keep the system modular.
16. Keep frontend and backend types synchronized.
17. Add tests for every important business rule.
18. Fix all build/test errors before finishing.

================================================== 33. FINAL ACCEPTANCE CRITERIA
==================================================

The finished system must allow this complete demonstration:

ADMIN
→ Create academic structure
→ Register students
→ Enroll student faces
→ Create timetable
→ Assign faculty/subjects/classrooms

FACULTY
→ Login
→ See today's timetable
→ Open current class
→ Capture 2–5 classroom photos
→ AI detects faces
→ AI recognizes eligible students
→ Liveness/quality checks execute
→ Duplicate students are merged
→ Confidence scores are displayed
→ Low-confidence results enter review
→ Faculty confirms attendance
→ Session becomes locked

SYSTEM
→ Calculates attendance percentage
→ Updates student history
→ Detects students below threshold
→ Calculates projected attendance/risk
→ Detects anomalies
→ Updates dashboard analytics
→ Records audit trail

ADMIN/OFFICE
→ Open reports
→ Generate defaulter list
→ Filter by class/department/subject
→ Export report

STUDENT
→ View attendance
→ View subject-wise percentage
→ View attendance risk
→ View attendance history

================================================== 34. DEVELOPMENT EXECUTION STRATEGY
==================================================

Implement in phases:

PHASE 1
Repository audit + architecture plan

PHASE 2
Timetable/context-aware session engine

PHASE 3
Multi-photo intelligent attendance

PHASE 4
Confidence + review workflow

PHASE 5
Attendance intelligence + risk projection

PHASE 6
Anomaly detection + audit improvements

PHASE 7
Admin/faculty/student dashboard improvements

PHASE 8
Testing + performance + security

PHASE 9
Documentation + demo mode

After each major phase:

- run relevant backend tests
- run frontend typecheck/build
- fix regressions
- verify existing functionality

================================================== 35. DO NOT STOP AT PLANNING
==================================================

Do not merely explain what should be implemented.

After inspecting the repository, ACTUALLY IMPLEMENT the features in the existing project.

When finished:

1. Run backend tests.
2. Run frontend build/typecheck.
3. Fix errors.
4. Verify database migrations.
5. Verify API endpoints.
6. Verify frontend routes.
7. Verify the complete attendance workflow.
8. Update README and documentation.
9. Provide a concise final summary containing:
   - What was changed
   - Files/modules changed
   - New features
   - Tests/build status
   - Any limitations or remaining setup requirements

The final result must be a cohesive evolution of JOJIPA-SAMS, not a separate application.
