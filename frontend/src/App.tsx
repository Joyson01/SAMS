import React, { useState, useEffect } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { fetchHealthStatus } from './services/api';
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
const DepartmentPage = React.lazy(() => import('./features/department/DepartmentPage').then(module => ({ default: module.DepartmentPage })));
const MyAttendancePage = React.lazy(() => import('./features/users/UsersPage').then(module => ({ default: module.MyAttendancePage })));
const DashboardOverview = React.lazy(() => import('./pages/DashboardOverview').then(module => ({ default: module.DashboardOverview })));
const StudentListPage = React.lazy(() => import('./features/students/StudentListPage').then(module => ({ default: module.StudentListPage })));
const FaceEnrollmentPage = React.lazy(() => import('./features/enrollment/FaceEnrollmentPage').then(module => ({ default: module.FaceEnrollmentPage })));
const AttendancePage = React.lazy(() => import('./features/attendance/AttendancePage').then(module => ({ default: module.AttendancePage })));
const MediaAttendancePage = React.lazy(() => import('./features/media/MediaAttendancePage').then(module => ({ default: module.MediaAttendancePage })));
const ReportsPage = React.lazy(() => import('./features/reports/ReportsPage').then(module => ({ default: module.ReportsPage })));
const SubjectManagementPage = React.lazy(() => import('./features/subjects/SubjectManagementPage').then(module => ({ default: module.SubjectManagementPage })));
const TimetablePage = React.lazy(() => import('./features/timetable/TimetablePage').then(module => ({ default: module.TimetablePage })));
const SettingsPage = React.lazy(() => import('./features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));
const AuditLogsPage = React.lazy(() => import('./features/security/AuditLogsPage').then(module => ({ default: module.AuditLogsPage })));

const StudentTimetable = React.lazy(() => import('./features/timetable/StudentTimetable'));
const Classmates = React.lazy(() => import('./components/Classmates').then(module => ({ default: module.Classmates })));
const ClassroomBoard = React.lazy(() => import('./components/ClassroomBoard'));
const SemesterResults = React.lazy(() => import('./components/SemesterResults').then(module => ({ default: module.SemesterResults })));

function initialTab(pathname: string) {
  switch (pathname) {
    case '/anonymous-detection': return 'anonymous-detection';
    case '/recognition-test': return 'recognition-test';
    case '/mobile-enrollment': return 'enrollment';
    default: return 'dashboard';
  }
}

const Workspace: React.FC = () => {
  const pathname = window.location.pathname;
  const authBypass = import.meta.env.VITE_AUTH_BYPASS === 'true';

  const [activeTab, setActiveTab] = useState(() => initialTab(pathname));
  const [chatSelection, setChatSelection] = useState<{ peerId: string }>();
  const [enrollingStudentId, setEnrollingStudentId] = useState<string | undefined>(new URLSearchParams(location.search).get("student_id") || undefined);
  const [healthData, setHealthData] = useState<ServiceHealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'unhealthy' | 'loading'>('loading');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [userName, setUserName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

  };

  useEffect(() => {
    let mounted = true;
    if (authBypass) clearAuthTokens();
    if (!authBypass && !getAccessToken()) {
      setIsAuthChecking(false);
      return () => { mounted = false; };
    }
    getCurrentUser()
      .then(user => { if (mounted) { setRole(user.role); setUserName(user.full_name); setAvatarUrl(user.avatar_url ?? null); setIsAuthenticated(true); } })
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

  const academicTab = ['classroom', 'semester-results'].includes(activeTab) && ['FACULTY', 'HOD', 'ADMIN'].includes(role);
  const currentTab = academicTab ? activeTab
    : role === 'STUDENT' ? (['classmates', 'classroom'].includes(activeTab) ? 'classmates' : ['my-attendance', 'my-timetable'].includes(activeTab) ? activeTab : 'student-profile')
    : role === 'HOD' ? 'department'
    : (activeTab === 'recognition-test' || activeTab === 'anonymous-detection') && !['ADMIN', 'FACULTY'].includes(role) ? 'dashboard'
    : role === 'FACULTY' && activeTab === 'dashboard' ? 'attendance' : activeTab;

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
    return <AuthPage onLogin={async () => {
      try {
        const user = await getCurrentUser();
        setRole(user.role);
        setUserName(user.full_name);
        setAvatarUrl(user.avatar_url ?? null);
        setActiveTab(initialTab(window.location.pathname));
        setChatSelection(undefined);
        setIsAuthenticated(true);
      } catch (error) {
        clearAuthTokens();
        throw error;
      }
    }} />;
  }

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setIsAuthenticated(false);
      setHealthData(null);
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Application Error" fallbackMessage="An error occurred in the workspace layout.">
      <DashboardLayout
        role={role}
        userName={userName}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
        healthData={healthData}
        healthStatus={healthStatus}
        onRefreshHealth={loadHealth}
        isRefreshing={isRefreshing}
        activeTab={currentTab}
        openChat={peerId => { setChatSelection({ peerId }); setActiveTab("classmates"); }}
        setActiveTab={setActiveTab}
      >
        <ErrorBoundary key={activeTab} fallbackTitle={`Error in ${activeTab.toUpperCase()}`}>
          {currentTab === 'my-attendance' && role === 'STUDENT' && <MyAttendancePage />}
          {currentTab === 'student-profile' && role === 'STUDENT' && <MyAttendancePage profileView />}
          {currentTab === 'my-timetable' && role === 'STUDENT' && <StudentTimetable />}
          {currentTab === 'classmates' && role === 'STUDENT' && <Classmates selection={chatSelection} onSelectionHandled={() => setChatSelection(undefined)} />}
          {academicTab && currentTab === 'classroom' && <ClassroomBoard />}
          {academicTab && currentTab === 'semester-results' && <SemesterResults studentView={role === 'STUDENT'} />}
          {currentTab === 'department' && role === 'HOD' && <DepartmentPage />}
          {role !== 'STUDENT' && role !== 'HOD' && <>
          {currentTab === 'recognition-test' && ['ADMIN','FACULTY'].includes(role) && <RecognitionTestPage />}
          {currentTab === 'anonymous-detection' && ['ADMIN','FACULTY'].includes(role) && <AnonymousDetectionPage />}
          {currentTab === 'users' && role === 'ADMIN' && <UsersPage />}
          {currentTab === 'dashboard' && role !== 'FACULTY' && <DashboardOverview onNavigate={handleNavigate} admin={role === 'ADMIN'} />}
          {currentTab === 'students' && <StudentListPage onNavigate={handleNavigate} canManage={role === 'ADMIN' || role === 'OPERATOR'} />}
          {currentTab === 'subjects' && role === 'ADMIN' && <><SubjectManagementPage onNavigate={handleNavigate} /><AcademicTools /></>}
          {activeTab === 'timetable' && <><TimetablePage onNavigate={handleNavigate} canEdit={role === 'ADMIN'} />{role === 'ADMIN' && <TimetableEditor />}</>}
          {activeTab === 'enrollment' && (
            <FaceEnrollmentPage
              initialStudentId={enrollingStudentId}
              canRemoveFaceData={role === 'ADMIN'}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'live' && <LaptopAttendancePage />}
          {activeTab === 'media' && <MediaAttendancePage onNavigate={handleNavigate} />}
          {(activeTab === 'attendance' || (activeTab === 'dashboard' && role === 'FACULTY')) && <AttendancePage />}
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
