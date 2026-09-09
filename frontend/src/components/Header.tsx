import React from 'react';
import { Menu, Plus } from 'lucide-react';
import { ServiceHealthResponse } from '../types';

interface HeaderProps {
  healthData: ServiceHealthResponse | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  onRefreshHealth: () => void;
  isRefreshing: boolean;
  activeTab: string;
  onToggleMobileMenu?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  students: 'Students',
  subjects: 'Academic & Courses',
  timetable: 'Weekly Timetable',
  enrollment: 'Face Enrollment',
  live: 'Live Attendance',
  media: 'Media Attendance',
  attendance: 'Attendance Records',
  reports: 'Reports & Analytics',
  cameras: 'Cameras',
  audit: 'Security Audit Logs',
  settings: 'Settings',
};

export const Header: React.FC<HeaderProps> = ({
  healthStatus,
  onRefreshHealth,
  isRefreshing,
  activeTab,
  onToggleMobileMenu,
}) => {
  const isOnline = healthStatus === 'healthy';
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
      {/* Left: Mobile Menu Trigger & Page Title */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition shrink-0"
            title="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
            <span className="font-bold text-slate-900 hidden sm:inline-block">JOJIPA-SAMS</span>
            <span className="text-slate-300 hidden sm:inline-block">/</span>
            <span className="font-semibold text-slate-700">{TAB_TITLES[activeTab] || 'Dashboard'}</span>
            <span className="text-slate-300 hidden sm:inline-block">/</span>
            <span className="text-slate-500 font-medium text-[13px] hidden sm:inline-block">{currentDate}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        {/* Camera / Online Status Indicator */}
        <button
          onClick={onRefreshHealth}
          disabled={isRefreshing}
          title="Refresh connection status"
          className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/80 px-3 py-1.5 rounded-full transition disabled:opacity-60"
        >
          <span className={`w-2 h-2 rounded-full ${isRefreshing ? 'bg-amber-500 animate-spin' : 'bg-emerald-500 animate-pulse'}`}></span>
          <span className="hidden sm:inline">
            {activeTab === 'live' ? 'HP-CAM Connected' : isOnline ? 'All Cameras Connected' : 'Connecting...'}
          </span>
          <span className="sm:hidden">Online</span>
        </button>

        {activeTab === 'live' ? (
          /* Profile badge in live view matching mock */
          <div className="flex items-center gap-2 pl-1">
            <div className="w-7 h-7 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              SR
            </div>
            <span className="text-xs font-semibold text-slate-800 hidden md:inline">Dr. S. Raman</span>
          </div>
        ) : (
          /* Start Attendance Button on dashboard / other tabs */
          <button
            onClick={() => onToggleMobileMenu?.() /* or default navigation */}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Start Attendance</span>
            <span className="sm:hidden">Start</span>
          </button>
        )}
      </div>
    </header>
  );
};
