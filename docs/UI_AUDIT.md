# UI audit

The existing app mixes compact legacy tables with newer plain form markup. Camera workflows have minimal hierarchy, hard-coded light surfaces, and dense controls. Several pages use browser confirmations. Shared components exist but are inconsistently used. Theme persistence and a theme toggle are absent. Auth and data loading paths must retain their current contracts.

## Screen and component inventory

- `frontend/src/App.tsx`
- `frontend/src/components/CameraPreview.tsx`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/PhotoAttendancePanel.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/StudentBatchSelect.tsx`
- `frontend/src/components/SyncStatusWidget.tsx`
- `frontend/src/components/SystemHealthCard.tsx`
- `frontend/src/components/auth/AuthPage.tsx`
- `frontend/src/components/camera/WebcamPanel.tsx`
- `frontend/src/components/common/ErrorBoundary.tsx`
- `frontend/src/components/ui/Avatar.tsx`
- `frontend/src/components/ui/Badge.tsx`
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Card.tsx`
- `frontend/src/components/ui/Drawer.tsx`
- `frontend/src/components/ui/EmptyState.tsx`
- `frontend/src/components/ui/IconButton.tsx`
- `frontend/src/components/ui/Input.tsx`
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/components/ui/Progress.tsx`
- `frontend/src/components/ui/SearchInput.tsx`
- `frontend/src/components/ui/Select.tsx`
- `frontend/src/components/ui/Skeleton.tsx`
- `frontend/src/components/ui/StatusBadge.tsx`
- `frontend/src/components/ui/Table.tsx`
- `frontend/src/components/ui/Tabs.tsx`
- `frontend/src/features/academics/AcademicTools.tsx`
- `frontend/src/features/academics/TimetableEditor.tsx`
- `frontend/src/features/attendance/AttendancePage.tsx`
- `frontend/src/features/attendance/PhoneAttendancePage.tsx`
- `frontend/src/features/camera-test/CameraTestPage.tsx`
- `frontend/src/features/cameras/CameraManagementPage.tsx`
- `frontend/src/features/enrollment/FaceEnrollmentPage.tsx`
- `frontend/src/features/live/LaptopAttendancePage.tsx`
- `frontend/src/features/live/LiveDashboardPage.tsx`
- `frontend/src/features/media/MediaAttendancePage.tsx`
- `frontend/src/features/mobile/MobileCameraPage.tsx`
- `frontend/src/features/mobile/MobileEnrollmentPage.tsx`
- `frontend/src/features/recognition/RecognitionTestPage.tsx`
- `frontend/src/features/reports/ReportsPage.tsx`
- `frontend/src/features/security/AuditLogsPage.tsx`
- `frontend/src/features/settings/SettingsPage.tsx`
- `frontend/src/features/students/StudentListPage.tsx`
- `frontend/src/features/subjects/SubjectManagementPage.tsx`
- `frontend/src/features/timetable/TimetablePage.tsx`
- `frontend/src/features/users/UsersPage.tsx`
- `frontend/src/layouts/DashboardLayout.tsx`
- `frontend/src/main.tsx`
- `frontend/src/pages/DashboardOverview.tsx`
