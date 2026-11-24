import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BookOpen, CalendarDays, ChartNoAxesColumn, MessageCircle, UserRound } from 'lucide-react';
import { Header } from '../components/Header';
import { ServiceHealthResponse } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  userName?: string;
  avatarUrl?: string | null;
  onLogout?: () => void;
  healthData: ServiceHealthResponse | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  onRefreshHealth: () => void;
  isRefreshing: boolean;
  activeTab: string;
  openChat?: (peer: string) => void;
  setActiveTab: (tab: string) => void;
}

const studentPages = [
  { id: 'student-profile', label: 'Profile', icon: UserRound },
  { id: 'my-attendance', label: 'Attendance', icon: ChartNoAxesColumn },
  { id: 'my-timetable', label: 'Timetable', icon: CalendarDays },
  { id: 'classmates', label: 'Class Space', icon: BookOpen },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
];

function StudentNavigation({ activeTab, navigate }: { activeTab: string; navigate: (tab: string) => void }) {
  return <nav aria-label="Student navigation"
    className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-border bg-surface px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] md:sticky md:top-16 md:flex md:justify-center md:gap-2 md:border-b md:border-t-0 md:p-2">
    {studentPages.map(({ id, label, icon: Icon }) => <button type="button" key={id}
      aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}
      className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-colors md:flex-row md:gap-2 md:px-5 md:text-sm ${activeTab === id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-muted hover:text-text'}`}>
      <Icon size={19} aria-hidden="true" /><span>{label}</span>
    </button>)}
  </nav>;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  role,
  userName,
  avatarUrl,
  onLogout,
  activeTab,
  setActiveTab,
  openChat,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Live attendance uses a broader container to prioritize the camera + roster split
  const student = role === 'STUDENT';
  const isLiveView = activeTab === 'live';

  return (
    <div className="flex min-h-screen bg-background text-text font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
      {/* Sidebar (Desktop persistent + Mobile overlay drawer) */}
      {!student && <Sidebar
        role={role}
        userName={userName}
        onLogout={onLogout}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setMobileMenuOpen(false);
        }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={userName}
          avatarUrl={avatarUrl}
          role={role}
          activeTab={activeTab}
          openChat={openChat}
          onLogout={student ? onLogout : undefined}
          onOpenProfile={student ? () => setActiveTab('student-profile') : undefined}
          onToggleMobileMenu={student ? undefined : () => setMobileMenuOpen(!mobileMenuOpen)}
        />
        {student && <StudentNavigation activeTab={activeTab} navigate={setActiveTab} />}
        <main
          id="main-content"
          tabIndex={-1}
          className={`flex-1 overflow-y-auto w-full mx-auto ${
            isLiveView
              ? 'p-4 sm:p-6 max-w-[1720px]'
              : student ? 'max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:py-8'
              : 'p-4 sm:p-6 md:p-8 max-w-[1536px]'
          }`}
        >
          <div key={activeTab} className="route-enter">{children}</div>
        </main>
      </div>
    </div>
  );
};
