# Anonymous Detection Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Offer anonymous face boxes and counts, retaining the small back-row face in the supplied example.
**Architecture:** A dedicated detection service and authenticated endpoint feed a separate upload page. No identity pipeline or attendance operations are used.
**Tech Stack:** FastAPI, Pillow, existing SCRFD detection, React and TypeScript.
**Spec:** docs/anonymous-detection-design.md (approved by user).

## Global Constraints
- Keep recognition settings and behavior unchanged.
- Return no identities, embeddings, landmarks or student candidates.
- Keep personal example images out of Git.
- Report detection limitations; never promise every occupant is counted.

## Review Focus
- Invalid, oversized and rotated images: validate before inference and preserve display coordinates.
- Small faces: retain them with a visual-review flag.
- In-flight uploads: prevent overlapping requests and stale displayed results.
- Restricted roles: retain existing staff authentication.
- Privacy: verify no student/profile/attendance SQL or recognition calls.

### Task 1: Anonymous API
Files: backend/app/services/anonymous_detection.py, backend/app/api/v1/anonymous_detection.py, backend/app/api/v1/router.py, tests/integration/test_anonymous_detection.py.
Interface: POST /api/v1/detection/photo multipart file; returns mode, frame_width, frame_height, face_count, latency_ms, faces[{bbox,detection_score,small_face}].
- [x] Write and run failing endpoint tests for real input, no identity access, invalid/oversized files, orientation and authentication.
- [x] Implement bounded decoding and a separate detector instance with a 16-pixel size floor; mark faces under 35 pixels for review.
- [x] Run the tests and the supplied example; require the back-row box to be retained.

### Task 2: Anonymous upload page
Files: frontend/src/features/detection/AnonymousDetectionPage.tsx, frontend/src/App.tsx, frontend/src/components/Sidebar.tsx, frontend/src/components/Header.tsx.
Interface: consumes Task 1 response and overlays boxes in the oriented source dimensions.
- [x] Add the dedicated page and staff navigation, with upload progress, errors, empty results and small-face notice.
- [x] Run frontend build and browser checks for successful upload, failure, mobile layout and absence of recognition requests.
- [x] Review changes and record verification in this document.

## Execution notes
Ruling: implement in the existing feature checkout to preserve ongoing uncommitted UI work and the running user workspace. Do not commit unrelated changes.
Ruling: user approved implementation with “Go ahead”; execute inline without another approval round.

## Verification
- Endpoint tests initially failed because the route was absent; missing-page browser check reproduced the absent UI.
- Final targeted run: 14 tests passed (anonymous endpoint tests and existing photo detection tests). An existing pytest-asyncio fixture-scope deprecation warning remains.
- `npm run build` passed; `git diff --check` passed.
- Browser upload of the supplied example returned six boxes, including the back-row face. No recognition/student/attendance requests were made by this page. Failed upload cleared previous boxes. Mobile viewport at 375 pixels had no horizontal overflow.
- Independent review identified animated-image mismatch; a failing APNG test reproduced it and the decoder now rejects animations.
- Personal images and browser screenshots remain outside Git. Existing unrelated working-tree edits were preserved.
