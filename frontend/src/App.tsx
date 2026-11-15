import React, { useState, useEffect } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { fetchHealthStatus } from './services/api';
import { fetchCameras } from './services/cameraApi';
import { ServiceHealthResponse } from './types';

import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AuthPage } from './components/auth/AuthPage';
import { clearAuthTokens, getAccessToken } from './services/api';
import { getCurrentUser, logout } from './services/authApi';

const TimetableEditor = React.lazy(() => import('./features/academics/TimetableEditor').then(module => ({ default: module.TimetableEditor })));
const LaptopAttendancePage = React.lazy(() => import('./features/live/LaptopAttendancePage').then(module => ({ default: module.LaptopAttendancePage })));
const RecognitionTestPage = React.lazy(() => import('./features/recognition/RecognitionTestPage').then(module => ({ default: module.RecognitionTestPage })));
const AnonymousDetectionPage = React.lazy(() => import('./features/detection/AnonymousDetectionPage').then(module => ({ default: module.AnonymousDetectionPage })));
const AcademicTools = React.lazy(() => import('./features/academics/AcademicTools').then(module => ({ default: module.AcademicTools })));
const UsersPage = React.lazy(() => import('./features/users/UsersPage').then(module => ({ default: module.UsersPage })));
const MyAttendancePage = React.lazy(() => import('./features/users/UsersPage').then(module => ({ default: module.MyAttendancePage })));
const DashboardOverview = React.lazy(() => import('./pages/DashboardOverview').then(module => ({ default: module.DashboardOverview })));
const StudentListPage = React.lazy(() => import('./features/students/StudentListPage').then(module => ({ default: module.StudentListPage })));
const FaceEnrollmentPage = React.lazy(() => import('./features/enrollment/FaceEnrollmentPage').then(module => ({ default: module.FaceEnrollmentPage })));
const PairedAttendancePage = React.lazy(() => import('./features/attendance/PhoneAttendancePage').then(module => ({ default: module.PairedAttendancePage })));
const PhoneAttendancePage = React.lazy(() => import('./features/attendance/PhoneAttendancePage').then(module => ({ default: module.PhoneAttendancePage })));
const AttendancePage = React.lazy(() => import('./features/attendance/AttendancePage').then(module => ({ default: module.AttendancePage })));
const LiveDashboardPage = React.lazy(() => import('./features/live/LiveDashboardPage').then(module => ({ default: module.LiveDashboardPage })));
const MediaAttendancePage = React.lazy(() => import('./features/media/MediaAttendancePage').then(module => ({ default: module.MediaAttendancePage })));
const ReportsPage = React.lazy(() => import('./features/reports/ReportsPage').then(module => ({ default: module.ReportsPage })));
const CameraManagementPage = React.lazy(() => import('./features/cameras/CameraManagementPage').then(module => ({ default: module.CameraManagementPage })));
const SubjectManagementPage = React.lazy(() => import('./features/subjects/SubjectManagementPage').then(module => ({ default: module.SubjectManagementPage })));
const TimetablePage = React.lazy(() => import('./features/timetable/TimetablePage').then(module => ({ default: module.TimetablePage })));
const SettingsPage = React.lazy(() => import('./features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));
const MobileCameraPage = React.lazy(() => import('./features/mobile/MobileCameraPage').then(module => ({ default: module.MobileCameraPage })));
const CameraTestPage = React.lazy(() => import('./features/camera-test/CameraTestPage').then(module => ({ default: module.CameraTestPage })));
const AuditLogsPage = React.lazy(() => import('./features/security/AuditLogsPage').then(module => ({ default: module.AuditLogsPage })));

const Workspace: React.FC = () => {
  const pathname = window.location.pathname;
  const authBypass = import.meta.env.VITE_AUTH_BYPASS === 'true';

  if (pathname === '/attendance-capture') return <PairedAttendancePage />;

  // Standalone Mobile & Diagnostic Routes
  if (pathname.startsWith('/mobile-camera')) {
    return (
      <ErrorBoundary fallbackTitle="Mobile Camera Stream Error">
        <MobileCameraPage />
      </ErrorBoundary>
    );
  }
  if (pathname.startsWith('/camera-test')) {
    return (
      <ErrorBoundary fallbackTitle="Camera Diagnostic Error">
        <CameraTestPage />
      </ErrorBoundary>
    );
  }

  const [activeTab, setActiveTab] = useState<string>(pathname === '/anonymous-detection' ? 'anonymous-detection' : pathname === '/recognition-test' ? 'recognition-test' : pathname === '/mobile-enrollment' ? 'enrollment' : 'dashboard');
  const [enrollingStudentId, setEnrollingStudentId] = useState<string | undefined>(new URLSearchParams(location.search).get("student_id") || undefined);
  const [healthData, setHealthData] = useState<ServiceHealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'unhealthy' | 'loading'>('loading');
  const [offlineCameraCount, setOfflineCameraCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('STUDENT');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  useEffect(() => { const expired = () => { setIsAuthenticated(false); history.replaceState(null, '', '/login?expired=1'); }; window.addEventListener('auth-expired', expired); return () => window.removeEventListener('auth-expired', expired); }, []);

  const loadHealth = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchHealthStatus();
      setHealthData(data);
      setHealthStatus(data.status);
    } catch (error) {
      console.error('Failed to fetch health status:', error);
      setHealthStatus('unhealthy');
    } finally {
      setIsRefreshing(false);
    }

    try {
      const cams = await fetchCameras();
      const offline = cams.filter(
        (c) => c.status === 'OFFLINE' || c.status === 'ERROR' || c.status === 'NO_FRAME' || !c.is_connected
      ).length;
      setOfflineCameraCount(offline);
    } catch (e) {
      // ignore camera status fetch error
    }
  };

  useEffect(() => {
    let mounted = true;
    if (authBypass) clearAuthTokens();
    if (!authBypass && !getAccessToken()) {
      setIsAuthChecking(false);
      return () => { mounted = false; };
    }
    getCurrentUser()
      .then(user => { if (mounted) { setRole(user.role); setUserName(user.full_name); setIsAuthenticated(true); } })
      .catch(() => { clearAuthTokens(); })
      .finally(() => { if (mounted) setIsAuthChecking(false); });
    return () => { mounted = false; };
  }, [authBypass]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleNavigate = (tab: string, studentId?: string) => {
    if (studentId) {
      setEnrollingStudentId(studentId);
    }
    setActiveTab(tab);
  };

  if (isAuthChecking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Checking your session…</div>;
  }

  if (!isAuthenticated) {
    return <AuthPage onLogin={() => { void getCurrentUser().then(user => { setRole(user.role); setUserName(user.full_name); setIsAuthenticated(true); }); }} />;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setIsAuthenticated(false);
      setHealthData(null);
    }
  };

  if (pathname === '/phone-attendance') {
    return <PhoneAttendancePage onLogout={handleLogout} />;
  }

  return (
    <ErrorBoundary fallbackTitle="Application Error" fallbackMessage="An error occurred in the workspace layout.">
      <DashboardLayout
        role={role}
        userName={userName}
        onLogout={handleLogout}
        healthData={healthData}
        healthStatus={healthStatus}
        onRefreshHealth={loadHealth}
        isRefreshing={isRefreshing}
        activeTab={role === 'STUDENT' ? 'my-attendance' : activeTab}
        setActiveTab={setActiveTab}
        offlineCameraCount={offlineCameraCount}
      >
        <ErrorBoundary key={activeTab} fallbackTitle={`Error in ${activeTab.toUpperCase()}`}>
          {role === 'STUDENT' && <MyAttendancePage />}
          {role !== 'STUDENT' && <>
          {activeTab === 'recognition-test' && ['ADMIN','FACULTY'].includes(role) && <RecognitionTestPage />}
          {activeTab === 'anonymous-detection' && ['ADMIN','FACULTY'].includes(role) && <AnonymousDetectionPage />}
          {activeTab === 'users' && role === 'ADMIN' && <UsersPage />}
          {activeTab === 'dashboard' && <DashboardOverview onNavigate={handleNavigate} />}
          {activeTab === 'students' && <StudentListPage onNavigate={handleNavigate} />}
          {activeTab === 'subjects' && <><SubjectManagementPage onNavigate={handleNavigate} /><AcademicTools /></>}
          {activeTab === 'timetable' && <><TimetablePage onNavigate={handleNavigate} /><TimetableEditor /></>}
          {activeTab === 'enrollment' && (
            <FaceEnrollmentPage
              initialStudentId={enrollingStudentId}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'live' && <LaptopAttendancePage onAdvanced={() => setActiveTab('advanced-live')} />}
          {activeTab === 'advanced-live' && <LiveDashboardPage onNavigate={handleNavigate} />}
          {activeTab === 'media' && <MediaAttendancePage onNavigate={handleNavigate} />}
          {activeTab === 'attendance' && <AttendancePage />}
          {activeTab === 'cameras' && <CameraManagementPage />}
          {activeTab === 'audit' && <AuditLogsPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'settings' && role === 'ADMIN' && <SettingsPage />}
          </>}
        </ErrorBoundary>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export const App: React.FC = () => (
  <React.Suspense fallback={<div role="status" className="p-8 text-text-muted">Loading workspace…</div>}>
    <Workspace />
  </React.Suspense>
);

export default App;
