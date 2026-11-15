# Reviewed photo attendance for AttedDEL

Status: implementation approved by the user on 2026-11-15. Target is backend/ and frontend/, selected under the user’s delegated choice.

## Review findings requiring resolution

The current branch is codex/new. Its README and scripts/start-local.sh launch a separate lightweight attendance_app package, not backend/ and frontend/. The user's attached stack explicitly targets the latter, but implementing it will not affect the currently documented launch. Confirm which application should receive the work before finalizing this design. This document currently describes the FastAPI/React backend/frontend target.

If that target is retained, extend the review panel to existing photo actions in AttendancePage and MediaAttendancePage as well as LiveDashboardPage, so shipped desktop photo interfaces no longer save before review. Keep immediate-write routes only for legacy API compatibility.

Batch eligibility must also govern the session roster, counts and auto-absence at closure; otherwise students excluded from recognition could be incorrectly marked absent. Include those shared session-service changes and tests in the batch proposal.

Migration verification must cover bootstrap-created development databases and migration-managed databases. Existing bootstrap uses create_all and compatibility ALTER TABLE operations; inspect and reconcile relevant Alembic schema drift before applying the proposed student batch migration. Do not modify a live database during implementation without an explicit migration run request.

## Intent and scope

A teacher captures or uploads one to three classroom photos for an ACTIVE attendance session, reviews identified faces, and explicitly confirms attendance. Students need enrolled face profiles. Unknown faces must never produce attendance records. Existing video and phone capture workflows remain available; this project improves the photo workflow and its shared marking safeguards.

Use the existing FastAPI, async SQLAlchemy, InsightFace/ONNX, OpenCV, React/TypeScript and Tailwind stack. Do not add heavyweight dependencies or change UNIQUE(session_id, student_id). Do not promise complete recognition of distant, obscured or blurred faces, or photo liveness verification.

## Approaches

1. Extend the immediate-write endpoints alone: smallest change, but fails the required review-before-save workflow.
2. Add dedicated preview/confirm orchestration, reusing detection, embedding, matching and attendance primitives: selected photo-first approach. It isolates photo settings from live video while allowing legacy endpoints to retain their contracts.
3. Rewrite every photo/video/phone workflow together: broader consistency, but unnecessary scope and regression risk for this request.

## Current code and conflicts

Photo APIs currently use separate marking paths, including a direct adapter hard-coded to data/sams_dev.db. The new path must use the configured SQLAlchemy database. Existing source and unique-constraint columns require no migration.

The current session has a timetable_entry_id; the timetable can specify batch_id or a legacy batch label. Students currently have class_name but no batch membership. Proposed schema addition: nullable Student.batch_id referencing Batch, exposed through existing student create/edit schemas and UI, with an Alembic migration. Existing students stay unassigned until staff assigns them. Class-wide sessions include active students in the class; batch sessions include only active students explicitly assigned to that batch. Never infer batches from roll numbers or section. Resolve legacy timetable batch labels only within the session class, treating ALL/blank as class-wide; reject unresolved or inconsistent batch/class metadata rather than broadening the roster. This proposal needs the user's approval.

The existing lateness calculation interprets scheduled date/time as UTC. Preserve that convention in this change and document it; campus-local scheduling correction is separate work. Use session.late_threshold_minutes, including a valid zero, rather than introducing a competing global threshold.

## Detection and matching

Add validated PHOTO_DET_SIZE=1280, PHOTO_TILE_SIZE=640, PHOTO_TILE_OVERLAP=0.20, PHOTO_MARGIN=0.05, FACE_RECOGNITION_THRESHOLD=0.58 and UNCERTAIN_LOWER_THRESHOLD=0.40 settings. Photo minimum face dimensions are 35 pixels. Leave live-video defaults unchanged. Run a full-image pass and overlapping, edge-covering tiles for large images; translate boxes and landmarks to original-image coordinates and merge with NMS before extracting embeddings. Serialize access where the underlying detector is mutable; do not change its shared input size during another request. Exact resource bounds and NMS IoU are implementation choices with focused tests.

Build a gallery from valid FaceProfile vectors belonging to the eligible roster, using multiple profiles per student and best similarity per identity. No global fallback. Compare unrounded scores. VERIFIED requires top1 >= 0.58 and top1-top2 >= 0.05; with only one enrolled identity there is no runner-up ambiguity. NEEDS_REVIEW covers scores >= 0.40 below the verified threshold or failed margin. UNKNOWN covers scores < 0.40, missing valid embeddings, and no eligible gallery. Preserve quality flags and do not auto-select unusable faces.

Within each photo, keep the highest-scoring claim to an identity; demote other claims to NEEDS_REVIEW with a duplicate flag. Across photos, show all faces but consolidate default student selections using the best score. Teacher selections cannot assign two distinct faces within one photo to the same student; confirmation deduplicates the student across photos.

## API and confirmation evidence

POST /api/v1/media-attendance/image/preview accepts session_id plus 1–3 images. Require authenticated staff and ACTIVE status (400 otherwise). Validate actual JPEG/PNG/WebP format, decoding, byte limit of 15 MiB per image and a bounded decoded pixel count; handle EXIF rotation. Return image identifiers, annotated base64 images, face boxes, stable face_ref values, bucket, candidate identities/similarities, quality flags and eligible enrolled-student choices. Preview performs no database writes, including no job/audit rows.

Use expiring signed evidence in face_ref through existing token/signing infrastructure. Bind evidence to the authenticated user, session, image digest, face index, bucket and eligible candidate information; include no raw images or embeddings. Suggested lifetime: 15 minutes, using a distinct token purpose to prevent access-token confusion. An expired preview requires re-preview. Signed evidence avoids a new database table or process-local cache and works across workers.

POST /api/v1/media-attendance/image/confirm accepts session_id and approved {student_id, face_ref} items. Validate the entire request before writing: signature, expiry, purpose, user/session binding, distinct faces, current class/batch eligibility, current enrollment and non-UNKNOWN bucket. VERIFIED items approve their identified student; NEEDS_REVIEW permits staff selection of a currently enrolled eligible student, recording the override. Reject UNKNOWN even if supplied a student ID. Reject invalid batches atomically, with no partial records.

Return marked/recovered and already-present/protected counts plus resulting student statuses. Reconfirming valid evidence must not duplicate attendance. Empty selection is rejected with a useful validation error.

## Safe marking and compatibility

Put batch photo marking in AttendanceService using one transaction for all records and the audit entry. Reuse the existing session-locking strategy so closing a session and confirming serialize; recheck ACTIVE after locking. Do not call a per-record commit method in a loop. Retain uniqueness and handle concurrent confirmations safely on SQLite and PostgreSQL.

New/recovered records use source PHOTO, PRESENT or LATE, acting user and evidence metadata. Record liveness_checked=false. Recover ABSENT/NOT_DETECTED/REVIEW_REQUIRED as appropriate; preserve manual exclusions and all MANUAL_* statuses, EXCUSED and manually sourced records. Preserve already PRESENT/LATE records. Explicit manual correction remains available through existing manual APIs. Audit each successful confirm action with user, session, source and counts, including repeated confirmations marking zero new students.

Keep legacy image endpoint URLs, aliases and response shapes. They remain immediate-write for backward compatibility, but use photo matching eligibility and safe marking, automatically submitting only VERIFIED faces. Lower caller thresholds must not bypass the verification floor; uncertain/unknown faces are returned without marking. Reuse compatibility serializers where possible. Do not refactor video/phone behavior as part of this work.

## Teacher interface

Add a reusable Photo Attendance panel to the live attendance experience for ACTIVE sessions. Separate mobile camera capture from a multi-file picker so teachers can take or choose up to three pictures. Preview before saving, show each annotated photo with green/amber/red boxes, and list Verified, Needs review and Unknown faces. Verified selections may be unchecked; review selections use an enrolled roster dropdown or rejection; unknowns have no marking control. Consolidate repeated identities across photos and explain duplicate selections.

Confirm & Mark Present sends approved face references, reports actual PRESENT/LATE/protected results, then refreshes the live roster. Provide loading, empty, validation, expired-preview and server-error states; disable duplicate submissions and discard stale results when the session/files change. New interfaces use explicit TypeScript types with no any. Retain a rejection/manual workflow rather than requiring every face to be recognized.

## Implementation sequence and validation

After design approval, write the implementation plan. Follow the requested phases: detection, matching, safe marking, API, backend tests, frontend, final verification/documentation. Summarize files and verification after each phase.

Use mocked detections/embeddings for deterministic tests: tile coordinate restoration/NMS/edge coverage; boundaries 0.39/0.40/0.57/0.58 and margin equality; duplicate competition; cross-photo merging; empty/class/batch rosters; unknown rejection; forged/expired/cross-user/cross-session face references; preview database immutability; non-ACTIVE 400; protected/manual records; absence recovery; zero-minute lateness; atomic invalid batches; idempotent and concurrent confirms; and closure races. Preserve existing endpoint contract tests.

Run pytest tests/unit/ and integration tests with the repository's configured test environment, appropriate black/flake8 checks for changed Python files, and npm run build in frontend. Report unavailable services/model-dependent checks and existing failures separately. Mocked tests cannot establish real classroom accuracy; validate with consented classroom photos before relying on deployment results.

Update README with photo setup, enrollment and batch assignment, review/confirm usage, limits, and teacher tips: front of room, face height, good lighting, two or three photos. Deliver changed files, commands, manual test steps and remaining limitations. No deployment or push is included.
