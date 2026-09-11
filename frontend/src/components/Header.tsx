import React, { useMemo } from 'react';
import { Menu, Plus, User } from 'lucide-react';
import { ServiceHealthResponse } from '../types';

interface HeaderProps {
  healthData?: ServiceHealthResponse | null;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  activeTab: string;
  onNavigate: (tab: string) => void;
  offlineCameraCount?: number;
  onToggleMobileMenu?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  students: 'Students',
  timetable: 'Timetable',
  reports: 'Reports',
  settings: 'Settings',
  cameras: 'Cameras',
  live: 'Live Attendance',
  media: 'Media Attendance',
  enrollment: 'Enrollment',
  subjects: 'Academic & Courses',
  audit: 'Audit Logs',
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNavigate,
  offlineCameraCount = 0,
  onToggleMobileMenu,
}) => {
  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const pageTitle = TAB_TITLES[activeTab] || 'Dashboard';

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Mobile Trigger & Brand / Page Title with Dynamic Date */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded text-slate-600 hover:bg-slate-100 transition"
            title="Open Navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 min-w-0 text-xs">
          <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight shrink-0">
            JOJIPA-SAMS
          </span>
          <span className="text-slate-400 font-normal">&gt;</span>
          <span className="font-semibold text-slate-800 truncate">
            {pageTitle}
          </span>
          <span className="text-slate-400 font-normal hidden sm:inline">&gt;</span>
          <span className="font-medium text-slate-500 hidden sm:inline truncate">
            {formattedDate}
          </span>
        </div>
      </div>

      {/* Right: Camera Status Indicator & Single Start Attendance Action */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Hardware Status Indicator (Clickable to open Cameras) */}
        <button
          onClick={() => onNavigate('cameras')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer ${
            offlineCameraCount > 0
              ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
          }`}
          title={
            offlineCameraCount > 0
              ? `${offlineCameraCount} camera(s) offline. Click to review cameras.`
              : 'All cameras connected. Click to view cameras.'
          }
        >
          {offlineCameraCount > 0 ? (
            <>
              <span className="text-amber-600 font-bold text-xs leading-none">⚠</span>
              <span>
                {offlineCameraCount} Camera{offlineCameraCount > 1 ? 's' : ''} Offline
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="hidden xs:inline">All Cameras Connected</span>
              <span className="xs:hidden">Cameras</span>
            </>
          )}
        </button>

        {/* Start Attendance Action / Live Badge */}
        {activeTab === 'live' ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-semibold select-none">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Live Session</span>
          </span>
        ) : (
          <button
            onClick={() => onNavigate('live')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Launch live face recognition attendance"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Start Attendance</span>
          </button>
        )}

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs shrink-0">
            <User className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="hidden lg:flex flex-col min-w-0 text-left">
            <span className="text-xs font-semibold text-slate-900 leading-tight truncate">Dr. S. Raman</span>
            <span className="text-[10px] text-slate-500 leading-tight truncate">Faculty</span>
          </div>
        </div>
      </div>
    </header>
  );
};
