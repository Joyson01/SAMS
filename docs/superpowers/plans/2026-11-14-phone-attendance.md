# Phone Attendance Implementation Plan

**Goal:** Run attendance from a phone and pair a capture-only phone to a laptop session.

**Architecture:** Add a session-scoped capture API that uses existing face recognition and attendance records. Use a responsive signed-in workspace and a capture-only QR route.

**Spec:** docs/superpowers/specs/2026-11-14-phone-attendance-design.md

- [x] Test capture access, roster filtering, duplicate records, manual marks, and completed sessions. Add transient image capture and signed pairing for a single session.
- [x] Build the phone workspace with today's timetable, capture feedback, manual review, and confirmation. Link the same workspace from laptop attendance and provide QR pairing.
- [x] Run focused API tests and the frontend production build. Document HTTPS, access, and remaining real-device checks.
