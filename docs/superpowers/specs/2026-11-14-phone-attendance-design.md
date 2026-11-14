# Phone attendance for SAMS

Lecturers should be able to take attendance with a phone alone. A laptop can also open the same session and act as the review screen while the phone captures. This release covers phone capture and leaves CCTV outside its scope.

## Approaches considered

- **Laptop-led pairing.** Reuses existing QR pairing but requires a laptop to get started.
- **Phone-first attendance with optional pairing.** The lecturer signs in, runs the session, and can review it on the phone. A laptop can open the same session or pair a phone from its dashboard. This supports both workflows the user requested and keeps the attendance records in one session.

## Session workflow

1. **Open class.** After sign-in, show today's classes and a **Resume attendance** button when a session is already active. Tapping a scheduled class opens its attendance. Preserve the existing class and subject picker for an unscheduled class.
2. **Capture.** Show two actions, **Scan class** and **Take photo**. Both use the phone's rear camera and update one roster. Show the present count and how many students still need review. Give immediate feedback when a capture marks a student present or finds no usable match. Leave uncertain matches for the lecturer and make manual marking available from the roster.
3. **Review and finish.** Show the students who still need attention first. Let the lecturer correct any mark and show how many unmarked students will be recorded absent before confirmation. Show a clear saved state once attendance is finalized.

Laptop pairing is an optional **Pair phone** action in the laptop's open session. Its short-lived QR link opens the phone capture screen for that class. The laptop shows the same persisted roster. Manual marks and finalization require the signed-in workspace.

## Implementation decisions

Use the existing React workspace, FastAPI attendance services, and roster. Use the existing authentication branch as the proposed base, then verify its protections. Serve the phone workspace over HTTPS. Reuse the photo and live recognition paths where they enforce the same roster, session state, and duplicate-handling rules. Require and validate paired access against the camera and session on the server, and reject writes after finalization. Give authorized staff accounts shared access to the pilot class only. Process phone frames and annotations in memory for the pilot and use consenting volunteers for device testing. Keep recognition results needed for attendance review.

## Acceptance

From a phone alone, sign in, open a session, capture a group photo, scan live, correct a mark, and finalize. From a laptop, open a session and pair a phone for capture. Verify that both devices show the same roster, that repeated sightings produce one record per student, and that expired, missing, or mismatched pairing credentials and closed sessions cannot submit captures. Check that a capture racing with finalization cannot change a finalized record. Check camera permission, interrupted capture, and recovery on a real phone.
