import React, { useMemo } from 'react';
import { Menu, User } from 'lucide-react';
import { StudentNotifications } from './StudentNotifications';
import { ThemeToggle } from './ui/ThemeToggle';
import { ServiceHealthResponse } from '../types';

interface HeaderProps {
  healthData?: ServiceHealthResponse | null;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  userName?: string;
  role?: string;
  activeTab: string;
  openChat?: (peer: string) => void;
  onToggleMobileMenu?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  'recognition-test': 'Recognition Test',
  'anonymous-detection': 'Anonymous Detection',
  users: 'Users',
  'my-attendance': 'My Attendance',
  dashboard: 'Dashboard',
  'my-timetable': 'My Timetable',
  classmates: 'Chats / Classmates',
  classroom: 'Classroom',
  'semester-results': 'Semester marksheets',
  department: 'Department',
  attendance: 'Attendance Sessions',
  students: 'Students',
  timetable: 'Timetable',
  reports: 'Reports',
  settings: 'Settings',
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
  openChat,
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
            className="grid min-h-11 min-w-11 place-items-center rounded-xl text-text-muted hover:bg-surface-muted md:hidden"
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
        {role === 'STUDENT' && <StudentNotifications openChat={openChat} />}
        <ThemeToggle />
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
