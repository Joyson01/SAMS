# Phone attendance pilot

**On a phone:** Open SAMS over trusted HTTPS and sign in with a staff account. Tap **Take attendance**, choose today's class, then tap **Scan class** or **Take photo**. Use **Review roster** to correct a mark and **Finish attendance** to save. Use **Start an unscheduled class** to choose a class and subject manually.

**With a laptop:** Open the same session in **Take attendance**, then choose **Pair phone**. Scan the QR code with the phone's camera and use the capture page while you review the roster on the laptop. The pairing link expires after 15 minutes and can submit captures only to the session that created it. Keep the capture tab open. If you reload it, scan the code again.

## Run and test

1. Follow the repository setup instructions in [the README](../README.md). Create the pilot database and a staff account using the administrator setup described there.
2. Configure a private pilot instance with a strong `SECRET_KEY`. Set up a timetable or create an unscheduled session. Add the pilot roster and enroll volunteer faces using the existing enrollment screen.
3. Use a trusted HTTPS hostname reachable from both devices. Open the hostname on the laptop before generating the QR code so the link uses the same address. The phone must be able to reach it over Wi-Fi or another permitted network path.
4. Try group photo, live scan, manual corrections, and finalization. Live scan waits for the same unambiguous match in two usable frames before marking a student; a deliberate group photo is evaluated once. Check which faces are missed under different lighting and distances before relying on automatic marks.

This pilot uses shared authorized-staff access within the pilot instance because the current data model has no lecturer-to-class assignment table. Keep only the pilot roster in that instance until assignments are modeled. Manual roster edits and finalization require a signed-in staff account; a paired phone can only capture into its one active session. The capture path keeps frames and annotations out of persistent media storage and writes attendance records to the configured database. It uses similarity matching, treats close competing matches conservatively, and records that liveness was unchecked. Similarity is not a probability and face matching alone is not spoof resistance.

The roster is the saved state. A live result described as “seen once” is temporary evidence and is not attendance until the UI reports a new mark. Retrying a photo is safe: the database permits one record per student per session, and manual corrections are not overwritten by later camera frames. If sign-in expires, sign in again and reopen the active session. If a pairing code expires or the phone is reloaded, generate and scan a new code. If the camera disconnects, stop and restart scan; **Take photo** and manual attendance remain available.

There is no offline attendance queue in this pilot. The phone must reach the server while capturing or editing. An interrupted upload is not saved; retry after the connection returns and verify the roster count before finalizing.

For local development, install frontend dependencies with `npm install` in `frontend`, then use `npm run dev` with the backend on port 8000. The Vite certificate is for development. On a real phone use a trusted certificate for live camera access.

## Short classroom pilot

Use consenting volunteers and representative enrollment samples. For each class, record:

- time from opening the class to saved attendance;
- enrolled students missed by automatic capture;
- incorrect or ambiguous matches shown for lecturer review;
- manual present/absent corrections and refreshed enrollments;
- phone model, browser, distance, lighting, and approximate group size.

Compare the saved roster with a manually checked reference. Tune thresholds only from representative validation data, keep false matches and misses separate, and do not publish an accuracy claim from the bundled sample images. Repeat on at least one slower phone and one laptop-paired session. Real classroom accuracy, real-device camera permission behavior, and network recovery remain physical pilot checks.

Focused API checks

```bash
pytest -q tests/unit/test_phone_capture_service.py tests/integration/test_phone_attendance.py tests/unit/test_attendance_service.py tests/unit/test_attendance_presence_tracking.py tests/unit/test_attendance_academic_workflow.py
npm --prefix frontend run build
```
