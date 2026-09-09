import React from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  X,
  Video,
  BarChart2,
  LogOut,
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
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live', label: 'Attendance', icon: Video, badge: 'LIVE' },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-screen transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a1c29] flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20"></div>
                <div className="w-4 h-4 rounded bg-white relative z-10 flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#1a1c29] rounded-sm"></div>
                </div>
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm text-slate-900 leading-none truncate">JOJIPA-SAMS</h1>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">Smart Attendance</p>
            </div>
          </div>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://ui-avatars.com/api/?name=S+Raman&background=0D8ABC&color=fff&rounded=true&bold=true" alt="Dr. S. Raman" className="w-8 h-8 rounded-full" />
            <div>
                <div className="text-xs font-bold text-slate-900 leading-none">Dr. S. Raman</div>
                <div className="text-[10px] text-slate-500 mt-1">Faculty</div>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 transition" title="Sign out" onClick={() => window.location.reload()}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
