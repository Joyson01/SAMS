import React from 'react';
import { User, LogOut, RefreshCw, Menu } from 'lucide-react';
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

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left: Mobile Menu Trigger & Page Title */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
            title="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-base font-bold text-slate-800">
          {TAB_TITLES[activeTab] || 'Dashboard'}
        </h2>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Online Status Dot */}
        <button
          onClick={onRefreshHealth}
          disabled={isRefreshing}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-50 transition"
          title="Click to check connection"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
            }`}
          ></span>
          <span className="hidden sm:inline">{isOnline ? 'System Online' : 'Connecting...'}</span>
          {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
        </button>

        <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

        {/* User Profile */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-medium text-xs">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-semibold text-slate-800 leading-none">Administrator</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Campus Lead</div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={() => {
            if (confirm('Are you sure you want to sign out?')) {
              window.location.reload();
            }
          }}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
