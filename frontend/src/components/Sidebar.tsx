import React, { useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Calendar,
  BarChart2,
  Settings,
  X,
  LogOut,
  User,
  ChevronDown,
  Camera,
  BookOpen,
  ShieldAlert,
  Image as ImageIcon,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    return ['cameras', 'subjects', 'audit', 'media'].includes(activeTab);
  });

  const primaryNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live', label: 'Live Attendance', icon: CheckSquare, isLive: true },
    { id: 'attendance', label: 'Attendance Sessions', icon: CheckSquare },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
  ];

  const secondaryNavItems = [
    { id: 'cameras', label: 'Cameras', icon: Camera },
    { id: 'subjects', label: 'Courses & Rooms', icon: BookOpen },
    { id: 'media', label: 'Photo Attendance', icon: ImageIcon },
    { id: 'audit', label: 'Audit Logs', icon: ShieldAlert },
  ];

  const isSecondaryActive = secondaryNavItems.some((item) => item.id === activeTab);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[230px] bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0 tracking-wider">
                AD
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-slate-900 leading-tight tracking-tight truncate">
                  AttedDEL
                </span>
                <span className="text-[10px] text-slate-500 font-medium leading-tight truncate">
                  Smart Attendance
                </span>
              </div>
            </div>

            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="md:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Teacher Navigation List */}
          <nav className="p-2.5 flex flex-col gap-0.5">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.isLive && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider leading-none shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Live
                    </span>
                  )}
                </button>
              );
            })}

            {/* Collapsible "More Tools" Group */}
            <div className="pt-2 mt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMoreOpen(!moreOpen)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isSecondaryActive ? 'text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-[11px] uppercase tracking-wider font-semibold">More Tools</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    moreOpen ? 'rotate-180 text-slate-600' : 'text-slate-400'
                  }`}
                />
              </button>

              {moreOpen && (
                <div className="mt-1 flex flex-col gap-0.5 pl-2">
                  {secondaryNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Settings Tab */}
            <div className="pt-1">
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">Settings</span>
              </button>
            </div>
          </nav>
        </div>

        {/* User Profile Footer */}
        <div className="p-2 border-t border-slate-200">
          <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                <User className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  Dr. S. Raman
                </span>
                <span className="text-[10px] text-slate-500 truncate leading-tight">Faculty</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to sign out?')) {
                  window.location.reload();
                }
              }}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors flex items-center justify-center cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
