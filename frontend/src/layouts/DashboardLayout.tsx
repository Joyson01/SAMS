import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ServiceHealthResponse } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  healthData: ServiceHealthResponse | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  onRefreshHealth: () => void;
  isRefreshing: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  offlineCameraCount?: number;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  offlineCameraCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Live attendance uses a broader container to prioritize the camera + roster split
  const isLiveView = activeTab === 'live';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar (Desktop persistent + Mobile overlay drawer) */}
      <Sidebar
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
          activeTab={activeTab}
          onNavigate={(tab) => {
            setActiveTab(tab);
          }}
          offlineCameraCount={offlineCameraCount}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main
          className={`flex-1 overflow-y-auto w-full mx-auto ${
            isLiveView
              ? 'p-4 sm:p-6 max-w-[1720px]'
              : 'p-4 sm:p-6 md:p-8 max-w-7xl'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
