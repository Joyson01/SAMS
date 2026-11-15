# Phone Attendance Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the priority guided-capture, reliable-recognition, and "Find who's left" improvements on the existing phone-attendance pilot.

**Architecture:** Keep the existing session-scoped FastAPI capture endpoint and responsive React workspace. Add a small recognition-evidence service that classifies image quality, treats close competing matches as review candidates, and requires repeated live-frame evidence before an automatic mark; keep one-shot group photos explicit and preserve manual records. Return structured, non-probabilistic feedback for the phone UI and enrich roster review without introducing a parallel attendance store.

**Tech Stack:** FastAPI, SQLAlchemy asyncio, NumPy/Pillow/OpenCV-compatible recognition results, React, TypeScript, Tailwind CSS, pytest, Vite

**Spec:** `docs/superpowers/specs/2026-11-14-phone-attendance-design.md` plus the 2026-11-15 attached product brief

## Global Constraints

- CCTV remains outside scope.
- Match only active students enrolled in the selected class using the configured database.
- Never overwrite a manual correction from automated capture.
- Do not label similarity as probability or claim spoof resistance; record liveness as unchecked.
- Keep capture images transient and enforce existing byte, pixel, and inference-concurrency limits.
- Pairing remains short-lived, session-scoped, capture-only, and absent from persistent URLs after page load.
- Physical-device and classroom accuracy claims require real-device testing and representative validation data.

## Review Focus

- Two students with close match scores must create review feedback, not an automatic present mark.
- A live detection seen in only one usable frame must stay pending; consistent evidence across usable frames may mark it.
- A manual absent/present correction must remain unchanged when later captures recognize that student.
- Retried and concurrent captures must still produce at most one record per student and no write after finalization.
- Low-light, blur, tiny-face, no-face, busy-scanner, expired-login, and disconnected-camera outcomes need actionable plain-language feedback.

---

### Task 1: Recognition evidence and capture-quality contract

**Files:**
- Create: `backend/app/services/phone_capture_service.py`
- Modify: `backend/app/api/v1/phone_attendance.py`
- Test: `tests/unit/test_phone_capture_service.py`
- Test: `tests/integration/test_phone_attendance.py`

**Interfaces:**
- Consumes: recognition detections containing `student_id`, `similarity`, and `is_recognized`; capture mode and scanner ID headers.
- Produces: structured capture response with `marked`, `pending`, `review`, `faces`, `quality`, and `message_code`; session-scoped live evidence keyed by non-secret scanner ID.

- [ ] Write failing unit tests for embedding normalization, blur/dark/tiny-face feedback, ambiguity classification, and multi-frame live evidence.
- [ ] Run the focused tests and confirm the new contract is absent.
- [ ] Implement pure quality/evidence helpers with bounded in-memory evidence expiry and conservative ambiguity margins.
- [ ] Integrate helpers into capture while preserving roster scope, row locking, uniqueness, manual records, and pairing revalidation.
- [ ] Add integration tests for one-frame pending, repeated-frame marking, one-shot photo marking, ambiguity review, manual preservation, retry, and finalized-session rejection.
- [ ] Run focused unit and integration tests.

### Task 2: Guided capture and unresolved-student review

**Files:**
- Modify: `frontend/src/features/attendance/PhoneAttendancePage.tsx`
- Test: `frontend/src/features/attendance/PhoneAttendancePage.test.tsx` if the repository test harness supports component tests; otherwise verify with build plus browser smoke.

**Interfaces:**
- Consumes: Task 1 structured capture response and existing roster response.
- Produces: rear-camera live/photo capture with quality guidance, pending/review feedback, optional vibration, scanner ID, search, unresolved-first filtering, and explicit save consequences.

- [ ] Add response types and display states for newly marked, pending evidence, ambiguous review, and capture-quality guidance.
- [ ] Pass `X-Capture-Mode` and ephemeral `X-Scanner-ID`; vibrate only for newly persisted attendance where supported.
- [ ] Keep uploads serialized, camera tracks stopped, aborts clean, and camera/HTTPS/session errors in plain language.
- [ ] Add unresolved/all roster tabs, name-or-roll search, clear counts, quick manual present/absent correction, and an easy return to rescan.
- [ ] Run TypeScript and production build; exercise phone and laptop layouts with mocked APIs.

### Task 3: Enrollment, documentation, and end-to-end verification

**Files:**
- Modify only the existing enrollment UI/API files identified during implementation if they lack multi-sample quality feedback or safe refresh behavior.
- Modify: `docs/PHONE_ATTENDANCE.md`
- Modify: `docs/superpowers/plans/2026-11-15-phone-attendance-reliability.md`

**Interfaces:**
- Consumes: existing FaceProfile enrollment and Task 1 validation helpers where compatible.
- Produces: documented safe refresh workflow, trusted HTTPS setup, offline limitations, and a measurable classroom pilot procedure.

- [ ] Inspect enrollment and add focused tests only for concrete unsafe or missing behavior found.
- [ ] Implement immediate retake guidance and explicit identity-safe refresh without learning from uncertain attendance matches, if not already present.
- [ ] Document trusted HTTPS, real-phone access, saved-versus-pending behavior, offline limits, liveness semantics, and pairing recovery.
- [ ] Add a pilot checklist measuring completion time, missed students, incorrect matches, ambiguity reviews, and manual corrections.
- [ ] Run focused backend tests, relevant enrollment tests, frontend production build, and browser smoke at narrow phone and laptop sizes.
- [ ] Record mocked/model/physical-device verification boundaries and commit the completed changes on `feature/phone-attendance`.
