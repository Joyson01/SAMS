# Data and account UI review

## Implemented
- Login/register/setup: responsive split brand/form layout, semantic theme colors, visible labels, password reveal and requirement hints. Existing authentication calls and token behavior are unchanged.
- Dashboard: semantic cards, actual attendance trend, health retry, and removal of invented fallback class, room, camera, roster count and confidence values. Empty upcoming-class wording no longer implies a scheduled class.
- Students: mobile cards keep enrollment, phone enrollment, attendance, edit and delete actions reachable; desktop table and bulk selection remain. Added labels to selection and filter controls, readable API failure/retry feedback, and semantic styles throughout profile/enrollment dialogs.
- Reports: real CSV export with busy/result feedback; removed nonfunctional Excel/PDF export buttons that previously announced fake downloads. Mobile class cards expose all report values. Existing API summary values are retained.
- Users: responsive account cards, create/manage dialogs, access-change confirmation, disabled submitting buttons and explicit loading/error/empty feedback.
- My Attendance: recorded-session percentage ring, per-subject presence bars and responsive session history. Computation explicitly counts PRESENT, LATE and MANUAL_PRESENT among the records returned; it does not claim a timetable-wide attendance rate.
- Audit: semantic light/dark surfaces, loading/error/retry, accessible shared diff dialog, mobile entries with visible View changes action.
- Sessions, timetable, classes, subjects and academic tools: semantic colors, accessible filter names, nonblocking modal confirmations and dismissible notification feedback. Settings has loading skeleton, retry and submitting state.
- New `useDialogFeedback` hook replaces browser alerts/confirmations in these owned data pages without changing mutation calls.

## Verification
- Repeated `npm run build --prefix frontend` passed after implementation phases (TypeScript plus Vite).
- Reviewed rendered screenshot artifacts: students-light-375, users-dark-375, reports-light-375, audit-logs-dark-375. Follow-up changes fixed cramped account names and horizontally hidden report/audit content; root verification refreshes the final screenshots.
- Root ran axe against the main routes and reported no serious/critical findings after control-label fixes.
- No explicit `any` remains in the owned page implementations. No backend or API contract was edited for these UI changes.

## Limits
- Reports service presently exposes institution/class summaries and CSV export. Subject/date-range filter UI and student report drill-down were not invented; student attendance remains available from the directory and My Attendance views. Excel/PDF export needs an actual supported implementation before presenting buttons.
- Dashboard displays the most recent seven points supplied by its existing summary endpoint; no unsupported 30-day fetch was added.
- Weekly timetable retains its existing Monday–Friday/time-slot behavior, session creation and class selection logic.
- Native HTML form validity remains the primary validation mechanism; all existing large forms were not rewritten into a new field-by-field validation architecture.
- Existing data/permissions determine which states appear; screenshot review does not validate real classroom recognition, token expiry, every mutation or backend failure.
