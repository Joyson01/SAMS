import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ServiceHealthResponse } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: string;
  userName?: string;
  onLogout?: () => void;
  healthData: ServiceHealthResponse | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  onRefreshHealth: () => void;
  isRefreshing: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  role,
  userName,
  onLogout,
  activeTab,
  setActiveTab,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Live attendance uses a broader container to prioritize the camera + roster split
  const isLiveView = activeTab === 'live';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
      {/* Sidebar (Desktop persistent + Mobile overlay drawer) */}
      <Sidebar
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
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={userName}
          role={role}
          activeTab={activeTab}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={`flex-1 overflow-y-auto w-full mx-auto ${
            isLiveView
              ? 'p-4 sm:p-6 max-w-[1720px]'
              : 'p-4 sm:p-6 md:p-8 max-w-[1536px]'
          }`}
        >
          <div key={activeTab} className="route-enter">{children}</div>
        </main>
      </div>
    </div>
  );
};
