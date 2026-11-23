# College-readiness release review

This review covers the SAMS FastAPI and React application on the college-readiness branch, the retained legacy client, the migration and container entrypoints, and the documentation a new contributor follows.

| Area | Result | Evidence |
|---|---|---|
| Sign-in and role navigation | Fixed | Sign-in awaits profile loading and displays a retryable error if it fails. A new session starts in the correct workspace rather than inheriting a previous user's tab. Mobile browser checks covered a student-to-faculty switch and a failed profile load followed by retry. |
| Student portal and academics | Verified locally | The regression suite covers linking accounts, attendance requests, scope of classmates and timetable access, private chat and file downloads, marksheets, assignments and academic management. |
| Attendance and recognition | Verified with fixtures | The regression suite covers reviewed photos, attendance changes and scoped reports. The real-image smoke test exercises linked-student matching, recognition, live session closure and export through a disposable HTTP server. Campus accuracy and physical camera testing remain pending. |
| UI and frontend build | Verified locally | TypeScript and the Vite build passed. Mobile and desktop browser checks covered the sign-in layout, student shortcuts and the mobile day selector. |
| Database | Verified for the current SQLite schema | Empty-database bootstrap, later migrations, and the schema drift check passed. A production PostgreSQL upgrade from the actual server schema still needs a staging rehearsal and backup. |
| Build and CI | Prepared | The frontend Docker build uses the committed npm lockfile. A clean npm install passed. The GitHub workflow builds the frontend and runs database and campus integration checks. The hosted workflow and Docker build still need execution. |
| Contributor documentation | Updated | The README clone command points to the current branch. The route inventory comes from FastAPI OpenAPI. The deployment and rollout checklist is in [GO_LIVE.md](GO_LIVE.md). |

## Cleanup candidates for approval

| Candidate | Evidence |
|---|---|
| [scratch.py](../scratch.py), [scratch_defaulters.py](../scratch_defaulters.py) | Empty stub and draft query. Neither is referenced by application code or startup scripts. |
| [MobileEnrollmentPage.tsx](../frontend/src/features/mobile/MobileEnrollmentPage.tsx) | Export has no application imports. The active mobile enrollment URL routes to the shared face enrollment page and is still used by QR links. |
| [Stitch design draft](../Stitch/DESIGN.md), [Stitch HTML mockup](../Stitch/code.html) | Standalone design references with no application imports. Retain if they are useful design history. |

The legacy Python attendance application and its lockfile have their own packaging entrypoint and regression tests. The pnpm lockfile is used by alternative startup scripts. Keep these files unless those workflows are explicitly retired.
