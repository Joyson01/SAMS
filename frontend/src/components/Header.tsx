import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, LogOut, Menu, UserRound } from 'lucide-react';
import { StudentNotifications } from './StudentNotifications';
import { ThemeToggle } from './ui/ThemeToggle';
import { StudentAvatar } from './ui/StudentAvatar';
import { ConfirmDialog } from './ui';

interface HeaderProps {
  userName?: string;
  avatarUrl?: string | null;
  role?: string;
  activeTab: string;
  openChat?: (peer: string) => void;
  onToggleMobileMenu?: () => void;
  onOpenProfile?: () => void;
  onLogout?: () => void;
}

const TAB_TITLES: Record<string, string> = {
  'recognition-test': 'Recognition Test',
  'anonymous-detection': 'Anonymous Detection',
  users: 'Users',
  'my-attendance': 'My Attendance',
  dashboard: 'Dashboard',
  'my-timetable': 'My Timetable',
  classmates: 'Class Space',
  'student-profile': 'My Profile',
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
  avatarUrl,
  role = "",
  activeTab,
  openChat,
  onToggleMobileMenu,
  onOpenProfile,
  onLogout,
}) => {
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const profileTrigger = useRef<HTMLElement>(null);
  const [showSignOut, setShowSignOut] = useState(false);
  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      const menu = profileMenu.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && profileMenu.current?.open) {
        profileMenu.current.open = false;
        profileTrigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(today);
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(today);
  const pageTitle = TAB_TITLES[activeTab] || 'Dashboard';

  return (
    <header className="sticky top-0 z-[45] flex min-h-16 items-center justify-between gap-2 border-b border-border bg-surface px-3 text-text sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onToggleMobileMenu && <button type="button" onClick={onToggleMobileMenu}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-muted hover:bg-surface-muted md:hidden"
          aria-label="Open navigation"><Menu size={19} aria-hidden="true" /></button>}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden shrink-0 text-sm font-semibold text-primary sm:inline">AttedDEL</span>
            <ChevronRight size={14} className="hidden shrink-0 text-text-muted sm:block" aria-hidden="true" />
            <span className="truncate text-sm font-semibold sm:text-base">{pageTitle}</span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted lg:hidden">{weekday}, {dateLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <div className="mr-2 hidden items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs font-medium text-text-muted lg:flex">
          <CalendarDays size={15} aria-hidden="true" /><span>{weekday}, {dateLabel}</span>
        </div>
        {role === 'STUDENT' && <StudentNotifications openChat={openChat} />}
        <ThemeToggle />
        {onOpenProfile ? <details ref={profileMenu} className="relative ml-1">
          <summary ref={profileTrigger} aria-label="Profile menu" title="Profile menu"
            className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-border px-1.5 hover:bg-surface-muted sm:px-2 [&::-webkit-details-marker]:hidden">
            <StudentAvatar name={userName || 'Student'} avatarUrl={avatarUrl} />
            <span className="hidden max-w-32 truncate text-sm font-semibold sm:inline">{userName || 'Profile'}</span>
            <ChevronDown size={14} className="hidden text-text-muted sm:block" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
            <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-surface-muted" onClick={() => {
              if (profileMenu.current) profileMenu.current.open = false;
              profileTrigger.current?.focus();
              onOpenProfile();
            }}><UserRound size={16} aria-hidden="true" /> My profile</button>
            {onLogout && <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-danger hover:bg-surface-muted" onClick={() => {
              if (profileMenu.current) profileMenu.current.open = false;
              profileTrigger.current?.focus();
              setShowSignOut(true);
            }}><LogOut size={16} aria-hidden="true" /> Sign out</button>}
          </div>
        </details> : <div className="ml-1 flex items-center gap-2 border-l border-border pl-2">
          <UserRound size={18} className="text-text-muted" aria-hidden="true" />
          <span className="hidden max-w-32 truncate text-sm font-medium xl:inline">{userName}</span>
        </div>}
      </div>
      <ConfirmDialog isOpen={showSignOut} onClose={() => setShowSignOut(false)} onConfirm={() => {
        setShowSignOut(false);
        onLogout?.();
      }} title="Sign out?" description="You can sign back in to access your student portal." confirmLabel="Sign out" />
    </header>
  );
};
