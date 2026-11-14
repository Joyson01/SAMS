# Phone attendance pilot

**On a phone:** Open SAMS over trusted HTTPS and sign in with a staff account. Tap **Take attendance**, choose today's class, then tap **Scan class** or **Take photo**. Use **Review roster** to correct a mark and **Finish attendance** to save. Use **Start an unscheduled class** to choose a class and subject manually.

**With a laptop:** Open the same session in **Take attendance**, then choose **Pair phone**. Scan the QR code with the phone's camera and use the capture page while you review the roster on the laptop. The pairing link expires after 15 minutes and can submit captures only to the session that created it. Keep the capture tab open. If you reload it, scan the code again.

## Run and test

1. Follow the repository setup instructions in [the README](../README.md). Create the pilot database and a staff account using the administrator setup described there.
2. Configure a private pilot instance with a strong `SECRET_KEY`. Set up a timetable or create an unscheduled session. Add the pilot roster and enroll volunteer faces using the existing enrollment screen.
3. Use a trusted HTTPS hostname reachable from both devices. Open the hostname on the laptop before generating the QR code so the link uses the same address. The phone must be able to reach it over Wi-Fi or another permitted network path.
4. Try group photo, live scan, manual corrections, and finalization. Check which faces are missed under different lighting and distances before relying on automatic marks.

This pilot uses shared staff access within the pilot instance. Keep only the pilot roster in that instance. The new capture path keeps frames and annotations out of persistent media storage and writes attendance records to the configured database. Live scan periodically sends individual frames. The first version uses similarity matching and lecturer review. It records that liveness was unchecked.

For local development, install frontend dependencies with `npm install` in `frontend`, then use `npm run dev` with the backend on port 8000. The Vite certificate is for development. On a real phone use a trusted certificate for live camera access.

Focused API checks

```bash
pytest -q tests/integration/test_phone_attendance.py tests/unit/test_attendance_service.py tests/unit/test_attendance_presence_tracking.py tests/unit/test_attendance_academic_workflow.py
npm --prefix frontend run build
```
