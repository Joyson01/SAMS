# SAMS college go-live checklist and staff manual

Use this guide for a supervised classroom pilot. The release needs evidence from a staging installation on the intended campus network and server before it can be approved for routine attendance. Keep a manual roster available throughout the pilot.

## Release checklist

| Gate | Evidence to record |
| --- | --- |
| Release candidate | Commit, Docker image identifiers, configuration owner, staging hostname, test date and named approvers from IT and teaching staff. |
| Deployment | Clean PostgreSQL bootstrap and a separate rehearsal on a restored copy of any existing database. Trusted HTTPS on campus phones and laptops, correct campus time and timetable, and a successful test capture after restart. |
| Access | Administrator can provision users and assignments. Faculty can operate only on assigned classes. A department head sees the intended department, and a linked student account sees its own records. Verify both direct requests and the UI using test accounts from two classes and departments. |
| Data handling | College approval for the use of biometrics and the model weights, a documented retention and deletion process, and manual attendance for students who opt out. Confirm storage, backup and media serving permissions before collecting any classroom photos. |
| Recognition | Held-out results for at least 60 enrolled volunteers and representative classroom conditions. Record precision, recall, unresolved cases and teacher corrections. |
| CPU and concurrency | Preview latency and correctness on the selected CPU at expected class sizes and peak concurrent use. Collect system resource and error metrics alongside latency. |
| Recovery | Encrypted backup created, restored to an isolated environment and verified against known roster, attendance and gallery records. Agree recovery time and acceptable data loss with the college. |
| Teacher sign-off | At least one teacher completes photo capture, roster corrections, session closure and the manual fallback independently on a real device. |

## Staging deployment with Docker, Nginx and PostgreSQL

1. Use the reviewed release commit and keep staging separate from production. The Compose services are `postgres` (PostgreSQL 16 with pgvector), `backend` (FastAPI), and `frontend` (Nginx and the built React UI). Review [the Compose definition](../docker-compose.yml) and [the proxy configuration](../infra/nginx/nginx.conf) before launch.
2. Provision a restricted `.env` from [the example](../.env.example). Set unique `SECRET_KEY` and `POSTGRES_PASSWORD` values. Use URL-safe database credentials or ensure the credentials are encoded in connection strings. Keep debug and authentication bypass disabled. The checked-in Compose file keeps PostgreSQL and FastAPI on the internal Docker network and publishes only Nginx ports. The [Docker build exclusions](../.dockerignore) keep local environment secrets, certificates, data, embeddings and outputs out of the build context. Restrict Nginx ingress to the intended audience.
3. Install a trusted certificate and private key at `infra/certs/cert.pem` and `infra/certs/key.pem`. Verify the campus hostname and certificate chain on real devices, make the private key readable only as needed, and arrange renewal and Nginx reload. Confirm HTTP redirects to HTTPS for app traffic. Test a maximum-size allowed photo upload through Nginx. The Nginx HTTPS configuration allows a 46 MiB body, matching the preview endpoint’s multipart limit for up to three 15 MiB files. End-to-end upload behavior, including large recorded videos through Nginx, still needs testing on the staging stack.
4. The [backend Dockerfile](../infra/docker/Dockerfile.backend) copies the bootstrap scripts. Build the images and verify that the modules import in the actual backend container. The checked-in configuration has been reviewed and the Docker runtime remains unverified. Run the next steps on a separate staging host with a confirmed empty database. The Compose file uses fixed container names and host ports, so a separate project name alone provides insufficient isolation on a shared host.

```bash
docker compose config -q
docker compose build backend frontend
docker compose run --rm --no-deps backend python -c 'import scripts.bootstrap_database, scripts.bootstrap_admin'
docker compose up -d --wait postgres
docker compose run --rm backend python -m scripts.bootstrap_database
docker compose run --rm backend python -m alembic -c backend/alembic.ini current
```

5. Create the initial administrator before opening the host to staff. Use a named administrator identity and a unique password. From an interactive Bash shell, supply the password via a temporary environment variable so the value stays out of shell history. The bootstrap helper can update an existing administrator with a matching username or email, so reserve this procedure for provisioning or an authorized reset.

```bash
(
  read -rs -p 'Initial SAMS administrator password: ' BOOTSTRAP_ADMIN_PASSWORD || exit 1
  printf '\n'
  if [ "${#BOOTSTRAP_ADMIN_PASSWORD}" -lt 16 ]; then
    printf '%s\n' 'Use a unique password of at least 16 characters.' >&2
    exit 1
  fi
  export BOOTSTRAP_ADMIN_PASSWORD
  docker compose run --rm -e BOOTSTRAP_ADMIN_PASSWORD backend python -m scripts.bootstrap_admin \
    --username campus_admin --email admin@example.edu --full-name 'Campus Administrator' --role ADMIN
) && docker compose up -d --wait
docker compose ps
curl --fail --silent --show-error https://attendance.example.edu/health
```

Replace the example identity and hostname. Check the returned JSON for overall `healthy`, a connected PostgreSQL database and AI `ready`. A degraded endpoint can still return HTTP 200. Verify an authenticated preview and confirmation as well as health, and check logs for model-load and gallery-sync errors. Exercise campus mobile browser permissions and live camera traffic through Nginx.

### Existing databases and the historical migration chain

The current empty-database bootstrap builds the model schema, stamps the reviewed baseline and rejects a database that already contains tables or views. Run it before starting the application on an empty database. Use revision `20261125_classmate_chat` as the expected baseline for this release.

The historical revision chain is blocked as a clean install path. It has references to missing `subjects`, `timetable_entries` and `batches` relations, and revision `39ffa3306d5f` uses a constraint ALTER unsupported by SQLite. A running server and an Alembic revision alone do not establish schema parity. For an existing installation, inventory the revision and actual schema on a restored copy and compare constraints, columns, indexes and data with the clean baseline. Approve and rehearse the required migrations or a controlled import before upgrading. Keep production untouched while that path is unresolved. A SQLite-to-PostgreSQL conversion requires a separate data import and reconciliation rehearsal.

### Backups, monitoring and rollback

- Schedule a PostgreSQL logical backup to an access-controlled backup location and copy it to encrypted storage off the host. Include any persistent enrollment or media files required by the installation, and document model and configuration versions. Take application-consistent snapshots during a maintenance window when file and database contents must align. Keep secrets and TLS private keys in the college's approved secrets backup.
- Check exit codes and backup age, and test recovery regularly. An example custom-format staging dump follows. Run it from a restricted backup directory on the host.

```bash
umask 077
sams_dump="sams-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres sh -ec 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$sams_dump"
docker compose exec -T postgres pg_restore --list < "$sams_dump"
```

- Restore into an empty, isolated PostgreSQL database using `pg_restore --exit-on-error`. Verify revision and row counts, teacher assignments, student links, gallery loading, and a known report. Record backup timestamp, restore duration and data recovered.
- Alert on HTTPS and certificate failures, degraded DB or AI status, backup age, 5xx rates, repeated 429s, slow photo previews, CPU, memory and disk saturation. Use `docker compose logs --tail=100 backend frontend postgres` and request IDs to diagnose failures. Restrict log access and avoid recording tokens, photos or full recognition responses.
- Schedule upgrades outside class hours. Record the last working image and pre-upgrade backup. If rollback needs a schema rollback, restore the matching verified backup to an isolated database first and confirm compatibility with the old image. Account for attendance written after the backup before switching to the recovered release.

## CPU and recognition acceptance

**Proposed CPU target** for the pilot is p95 at or below **8 seconds** from photo submission to preview response for a classroom capture containing 60 or more faces on the planned CPU. Record CPU model and core count, memory, runtime provider, gallery size, input resolution and bytes, photo count, response time and conditions. Use actual classroom upload sizes and also test the largest planned batch. Separate cold-start from warmed measurements and record both end-to-end latency and server processing time. Use at least 30 warmed previews per representative input size and report the sample sizes alongside the percentiles. This is an acceptance target whose outcome must be measured on campus hardware.

1. Recruit at least 60 consenting enrolled students for the evaluation. Keep test captures separate from enrollment and any threshold tuning. Make an independent reference roster for each capture and session. Include approved unknown volunteers, enrolled students who are actually absent, and partially occluded faces.
2. Collect held-out photos across straight-on and oblique views, seat distance, front light, low light, backlight and realistic group density. Include at least one 60+ face case, a one-photo case and a multi-photo case. Record phone and camera model, lighting, distance, and face count for each capture.
3. Score machine suggestions before review and the saved roster after review. At student/session level, count correctly matched present students as TP, wrong identities marked present as FP, and actually present enrolled students with no correct match as FN. Count a wrong identity against the actual identity as a miss when that person has no other correct match. Report precision as TP / (TP + FP) and recall as TP / (TP + FN), with denominators, condition breakdowns, ambiguous and unknown counts, overrides and any duplicate marks. Record zero-denominator rates as unavailable. Keep similarity scores distinct from probability.
4. Have the college agree acceptable precision, recall and teacher workload before scoring the held-out set. Review all false marks with teaching staff. Repeat the evaluation after model, threshold or capture changes. Keep individual results and photos in approved restricted storage.

### Load-test rehearsal

Use a private staging database, approved fixtures and real-size images. Seed enough students, profiles and history to match expected campus use. Run a baseline with one teacher, then the expected number of classes starting together, then a short controlled peak above that level. Mix authenticated classroom previews and confirms, active roster reads, live camera frames where used, and reports. Use separate sessions for separate classes and a shared test session for intentional confirmation races. Keep the load generator separate from the CPU under test where possible. Exercise the normal per-client rate limits, including teachers sharing campus NAT, and record 429s separately from application failures. Ramp down if the staging host becomes unstable.

For each run, report peak concurrency, request counts, p50/p95 latency, errors, timeouts, CPU, memory, database connections and latency. Check that preview makes no attendance changes, repeating or racing confirmation gives one record per student and session, manual corrections survive, and writes after session close are rejected. Include restart and interrupted-upload checks and verify rosters against the reference before approving use.

## Teacher manual

1. Sign in on the college HTTPS address. If the expected class is missing, ask the administrator to check your assignment and timetable.
2. In **Attendance Sessions**, open the correct class, subject and time. Start the session if it is scheduled, then select **Take attendance**. Verify the session roster before capture.
3. In the session's **Photo Attendance** panel, tap **Take photo** on a phone, pick image files with **Choose photos**, or select **Use laptop camera** and **Capture photo**. Use one to three clear photos that cover the room with minimal blur and backlighting. Select **Preview photos**.
4. Check every proposed name against the person in the image. Clear an incorrect suggestion, choose a student for a reviewable face only when you can identify them, and leave uncertain faces for manual review. Select **Confirm & Mark Present**. Confirm within 15 minutes of preview. Confirmations after the configured grace period are recorded as late.
5. Check the saved roster. Use **Manual Override** for missed or incorrect marks and enter the reason. Use this route for students without biometric enrollment. Select **End Session** only after review, when students without an attendance mark can safely be recorded absent. Reopen the session details to confirm the final roster. Use **Reports** to view and export assigned-class attendance as CSV, Excel (XLSX), or PDF.
6. For an approved live scan, use **Live Attendance** on the capture device itself, select the active session, and permit the camera. Verify marks in the live roster, correct the results and select **Finish Attendance** when ready. Remote attendance pairing and CCTV routes are retired in this release. Use the reviewed session photo panel when you need to approve candidates before saving.

If the network drops or a response is lost, reopen the session after reconnecting and check the persisted roster before confirming or correcting marks again. Switch to the manual class list if the system or camera is unavailable. Hand off disputed marks through the college's attendance correction process.

## Administrator manual

1. Set up campus classes, subjects, rooms and timetable entries in **Courses & Rooms** and **Timetable**. Verify sections, batches, local times and the selected subject before the first lecture.
2. Create students in **Students**, or choose **Import roster** to preview a CSV or Excel (XLSX) file of up to 500 students. Download the CSV template from the importer, use existing classes, and keep Excel identifiers such as roll numbers and student codes formatted as text. Resolve preview errors before confirming the import. Reconcile roll numbers, student codes, sections and effective class membership against the college record. Check biometric eligibility and the manual workflow before enrolling volunteers through **Enroll Face** or **Re-enroll Face** in the student profile.
3. In **Users**, create individual faculty accounts. Open **Manage**, select the correct **Assigned classes**, and choose **Save classes**. Verify that each teacher sees only their own classes. Create each HOD with the matching department. Provision student accounts and use **Link a student record** with the corresponding roll number and student code. Test an actual student sign-in and profile after linking.
4. Before each pilot, verify the health response, model availability, timetable, staging backup and two sample roles. Use **Audit Logs** for account and administrative activity and **Reports** to check class totals and exports. Review the student request queue in **Users** and reconcile corrections with the teacher. Linked students can submit retroactive leave requests such as **Medical request** and **On-duty request** from **My Attendance** against a recorded absence. The request accepts a text explanation only. Handle supporting documents through the college’s existing process.
5. Keep the release and incident records with the checklist evidence. Deactivate departing users, review class assignments when staffing changes, and apply the college retention and deletion process to enrollment data, media and backups.

### Student workspace

- **My Timetable** shows the recurring weekly schedule for the linked class and assigned lab batch. Students without a batch see whole-class entries. Administrators can assign a batch when editing the student in **Students**.
- **Classmates** lists other active students in the same department, class and section, showing roll number, given name and surname. Students can search by name or roll number and send private messages to classmates with active linked accounts.
- **Classroom** shows announcements, materials and assignments with optional due dates. Faculty can publish to their assigned classes. HODs can publish within their department. To connect an imported roster, an administrator opens **Courses & Rooms → Classes & Sections → Add Class Section** and matches the roster's class name, department and section. Posts may link to an existing Google Classroom item. Students can enter one final text answer per assignment and see their submission time. Staff open **Review submissions** on the assignment to read answers. The stream is maintained in SAMS.
- **Semester marksheets** groups published subject marks by academic year and semester. Staff select a student, then a subject from the relevant academic year and semester, enter the earned and maximum marks, and publish. Changes are recorded in the audit log. Students see only their own results.
- In **My Attendance**, a completed face registration collapses to a status row. Choose **Check face match** to start a live camera check or upload a JPEG or PNG under 10 MB. A check compares the supplied face with the student's own saved poses and leaves attendance unchanged.
