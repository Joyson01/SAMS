import React, { useState, useEffect } from 'react';
import { DashboardLayout } from './layouts/DashboardLayout';
import { DashboardOverview } from './pages/DashboardOverview';
import { StudentListPage } from './features/students/StudentListPage';
import { FaceEnrollmentPage } from './features/enrollment/FaceEnrollmentPage';
import { AttendancePage } from './features/attendance/AttendancePage';
import { LiveDashboardPage } from './features/live/LiveDashboardPage';
import { MediaAttendancePage } from './features/media/MediaAttendancePage';
import { ReportsPage } from './features/reports/ReportsPage';
import { CameraManagementPage } from './features/cameras/CameraManagementPage';
import { SubjectManagementPage } from './features/subjects/SubjectManagementPage';
import { TimetablePage } from './features/timetable/TimetablePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { MobileCameraPage } from './features/mobile/MobileCameraPage';
import { MobileEnrollmentPage } from './features/mobile/MobileEnrollmentPage';
import { CameraTestPage } from './features/camera-test/CameraTestPage';
import { AuditLogsPage } from './features/security/AuditLogsPage';
import { fetchHealthStatus } from './services/api';
import { ServiceHealthResponse } from './types';

import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const pathname = window.location.pathname;

  // Standalone Mobile & Diagnostic Routes
  if (pathname.startsWith('/mobile-camera')) {
    return (
      <ErrorBoundary fallbackTitle="Mobile Camera Stream Error">
        <MobileCameraPage />
      </ErrorBoundary>
    );
  }
  if (pathname.startsWith('/mobile-enrollment')) {
    return (
      <ErrorBoundary fallbackTitle="Mobile Face Enrollment Error">
        <MobileEnrollmentPage />
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

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [enrollingStudentId, setEnrollingStudentId] = useState<string | undefined>(undefined);
  const [healthData, setHealthData] = useState<ServiceHealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'unhealthy' | 'loading'>('loading');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigate = (tab: string, studentId?: string) => {
    if (studentId) {
      setEnrollingStudentId(studentId);
    }
    setActiveTab(tab);
  };

  return (
    <ErrorBoundary fallbackTitle="Application Error" fallbackMessage="An error occurred in the workspace layout.">
      <DashboardLayout
        healthData={healthData}
        healthStatus={healthStatus}
        onRefreshHealth={loadHealth}
        isRefreshing={isRefreshing}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      >
        <ErrorBoundary key={activeTab} fallbackTitle={`Error in ${activeTab.toUpperCase()}`}>
          {activeTab === 'dashboard' && <DashboardOverview onNavigate={handleNavigate} />}
          {activeTab === 'students' && <StudentListPage onNavigate={handleNavigate} />}
          {activeTab === 'subjects' && <SubjectManagementPage onNavigate={handleNavigate} />}
          {activeTab === 'timetable' && <TimetablePage onNavigate={handleNavigate} />}
          {activeTab === 'enrollment' && (
            <FaceEnrollmentPage
              initialStudentId={enrollingStudentId}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'live' && <LiveDashboardPage onNavigate={handleNavigate} />}
          {activeTab === 'media' && <MediaAttendancePage onNavigate={handleNavigate} />}
          {activeTab === 'attendance' && <AttendancePage />}
          {activeTab === 'cameras' && <CameraManagementPage />}
          {activeTab === 'audit' && <AuditLogsPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default App;
