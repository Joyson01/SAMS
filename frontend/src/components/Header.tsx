import React, { useMemo } from 'react';
import { Menu, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import { ServiceHealthResponse } from '../types';

interface HeaderProps {
  healthData?: ServiceHealthResponse | null;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  userName?: string;
  role?: string;
  activeTab: string;
  onNavigate: (tab: string) => void;
  offlineCameraCount?: number;
  onToggleMobileMenu?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  'recognition-test': 'Recognition Test',
  'anonymous-detection': 'Anonymous Detection',
  users: 'Users',
  'my-attendance': 'My Attendance',
  dashboard: 'Dashboard',
  attendance: 'Attendance Sessions',
  students: 'Students',
  timetable: 'Timetable',
  reports: 'Reports',
  settings: 'Settings',
  cameras: 'Cameras',
  live: 'Live Attendance',
  media: 'Photo Attendance',
  enrollment: 'Face Enrollment',
  subjects: 'Courses & Rooms',
  audit: 'Audit Logs',
};

export const Header: React.FC<HeaderProps> = ({
  userName = "",
  role = "",
  activeTab,
  onNavigate,
  offlineCameraCount = 0,
  onToggleMobileMenu,
}) => {
  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date());
  }, []);

  const pageTitle = TAB_TITLES[activeTab] || 'Dashboard';

  return (
    <header className="min-h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* LEFT: Page title / breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition"
            title="Open Navigation"
            aria-label="Open Navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 min-w-0 text-xs">
          <span className="hidden sm:inline text-xs font-medium text-text-muted shrink-0">
            AttedDEL
          </span>
          <span className="hidden sm:inline text-slate-300 font-normal">/</span>
          <span className="font-semibold text-slate-800 truncate text-xs sm:text-sm">
            {pageTitle}
          </span>
          <span className="text-slate-300 font-normal hidden lg:inline">•</span>
          <span className="font-medium text-text-muted hidden lg:inline truncate">
            {formattedDate}
          </span>
        </div>
      </div>

      {/* RIGHT: System status, Notifications, User profile */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <ThemeToggle />
        {/* Hardware / Camera Status Indicator (Clickable to open Cameras) */}
        {role !== 'STUDENT' && (
        <button
          onClick={() => onNavigate('cameras')}
          className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            offlineCameraCount > 0
              ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900'
              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
          }`}
          title={
            offlineCameraCount > 0
              ? `${offlineCameraCount} camera(s) offline. Click to review cameras.`
              : 'View registered camera status.'
          }
        >
          {offlineCameraCount > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                {offlineCameraCount} Camera{offlineCameraCount > 1 ? 's' : ''} Offline
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">Camera status</span>
              <span className="sm:hidden">Cameras</span>
            </>
          )}
        </button>

        )}
        {/* User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs shrink-0">
            <User className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="hidden xl:flex flex-col min-w-0 text-left">
            <span className="text-xs font-semibold text-slate-900 leading-tight truncate">
              {userName}
            </span>
            <span className="text-xs text-slate-500 leading-tight truncate">{role.charAt(0) + role.slice(1).toLowerCase()}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
