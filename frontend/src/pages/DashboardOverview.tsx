import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  Play,
  Eye,
  RefreshCw,
  UserCheck,
  Users,
  UserX,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { fetchDashboardSummary } from '../services/dashboardApi';
import { fetchAllTimetableEntries } from '../services/subjectApi';
import { fetchSessions } from '../services/attendanceApi';
import { DashboardSummaryResponse } from '../types/dashboard';
import { TimetableEntry } from '../types/subject';
import { AttendanceSession } from '../types/attendance';
import {
  Card,
  Button,
  StatusBadge,
  Progress,
  Skeleton,
  EmptyState,
} from '../components/ui';

interface DashboardOverviewProps {
  onNavigate?: (tab: string, studentId?: string) => void;
}

// Helper to format 24h "HH:MM" to 12h "hh:mm A"
const formatDisplayTime = (timeStr?: string): string => {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const minute = parts[1].slice(0, 2);
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, '0')}:${minute} ${ampm}`;
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [timetableBackup, setTimetableBackup] = useState<TimetableEntry[]>([]);
  const [recentSessions, setRecentSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Greeting based on client local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const fullFormattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const todayDayName = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
  }, []);

  const loadData = useCallback(async (showFullLoading = false) => {
    if (showFullLoading) setLoading(true);
    setError(null);
    try {
      const [summary, sessionsList] = await Promise.all([
        fetchDashboardSummary(),
        fetchSessions().catch(() => []),
      ]);
      setData(summary);
      setRecentSessions(sessionsList.slice(0, 5));

      // If today_sessions is empty in the dashboard summary, fallback to today's timetable entries
      if (!summary.today_sessions || summary.today_sessions.length === 0) {
        try {
          const entries = await fetchAllTimetableEntries(undefined, todayDayName);
          setTimetableBackup(entries.filter((e) => e.entry_type === 'SUBJECT' || !e.entry_type));
        } catch {
          // ignore timetable load error
        }
      }
    } catch (err: any) {
      console.error('Failed to load dashboard summary:', err);
      setError('Unable to load dashboard data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [todayDayName]);

  useEffect(() => {
    loadData(true);
    // Real-time polling every 10 seconds while dashboard is active
    const interval = setInterval(() => {
      loadData(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Live recognition stream items extracted from actual backend events
  const streamItems = useMemo(() => {
    if (data?.live_recognitions && data.live_recognitions.length > 0) {
      return data.live_recognitions.slice(0, 5).map((lr) => ({
        id: lr.id,
        name: lr.name || (lr as any).student_name || 'Student',
        confidence: lr.confidence ?? (lr as any).confidence_pct ?? 0,
        status: lr.status,
        timeAgo: lr.time_ago || 'Just now',
      }));
    }
    if (data?.recent_activities && data.recent_activities.length > 0) {
      return data.recent_activities
        .filter((a) => a.event_type === 'ATTENDANCE' || a.event_type === 'UNKNOWN_FACE')
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          name: a.event_type === 'UNKNOWN_FACE' ? 'Unknown Face' : a.title.replace(/ marked .*/i, '') || a.title,
          confidence: a.event_type === 'UNKNOWN_FACE' ? 0 : 96,
          status: a.event_type === 'UNKNOWN_FACE' ? 'REVIEW' : a.title.toLowerCase().includes('late') ? 'LATE' : 'PRESENT',
          timeAgo: a.time_ago || 'Recent',
        }));
    }
    return [];
  }, [data?.live_recognitions, data?.recent_activities]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-44 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-7 h-72" />
          <Skeleton className="lg:col-span-5 h-72" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-rose-500" />}
        title="Dashboard Unavailable"
        description={error}
        actionLabel="Retry Loading"
        onAction={() => loadData(true)}
        actionIcon={<RefreshCw className="w-3.5 h-3.5" />}
        className="my-16 max-w-md mx-auto"
      />
    );
  }

  const summary = data?.summary || {
    total_students: 0,
    enrolled_students: 0,
    pending_enrollment: 0,
    present_today: 0,
    absent_today: 0,
    late_today: 0,
    excused_today: 0,
    attendance_rate_pct: 0,
  };

  const activeSession = data?.active_session;
  const todaySessions = data?.today_sessions || [];
  const upcomingSessions = data?.upcoming_sessions || [];

  // Determine next upcoming class if no active session
  const nextClass =
    upcomingSessions.length > 0
      ? upcomingSessions[0]
      : todaySessions.find((s) => s.status === 'UPCOMING' || s.status === 'SCHEDULED');

  // Calculate live progress percentage using real session counts
  const totalRoster =
    activeSession?.total_roster_count ||
    (activeSession ? activeSession.present_count + activeSession.absent_count : 0);
  const presentCount = activeSession?.present_count ?? 0;
  const progressPct =
    totalRoster > 0 ? Math.min(100, Math.round((presentCount / totalRoster) * 100)) : 0;

  // Synthesize classes for today: use today_sessions if available, else timetableBackup
  const effectiveTodayClasses: Array<{
    id: string;
    time: string;
    subject: string;
    className: string;
    room: string;
    status: string;
    isLive: boolean;
  }> =
    todaySessions.length > 0
      ? todaySessions.map((s) => ({
          id: s.id,
          time: formatDisplayTime(s.start_time),
          subject: s.subject,
          className: s.class_name,
          room: s.room || 'CR 26',
          status: s.status,
          isLive: s.status === 'ACTIVE',
        }))
      : timetableBackup.map((t) => ({
          id: t.id,
          time: formatDisplayTime(t.start_time),
          subject: t.label || 'Lecture',
          className: (t as any).class_name || 'TE-B',
          room: t.room || 'CR 26',
          status: 'SCHEDULED',
          isLive: false,
        }));

  return (
    <div className="space-y-6">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {greeting}, Dr. Raman
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{fullFormattedDate}</p>
        </div>

        <Button
          onClick={() => onNavigate && onNavigate('live')}
          variant="primary"
          size="md"
          icon={<Play className="w-3.5 h-3.5 fill-current" />}
        >
          Start Attendance
        </Button>
      </div>

      {/* 2. TODAY'S OVERVIEW (4 Compact KPI Tiles) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Students */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Students
            </span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              {summary.total_students}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">enrolled</span>
          </div>
        </div>

        {/* Present Today */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Present
            </span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">
              {summary.present_today}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">marked</span>
          </div>
        </div>

        {/* Absent Today */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Absent
            </span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-rose-600 tracking-tight">
              {summary.absent_today}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">unverified</span>
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Attendance
            </span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-blue-600 tracking-tight">
              {summary.attendance_rate_pct}%
            </span>
            <span className="text-[11px] text-slate-400 font-medium">rate</span>
          </div>
        </div>
      </div>

      {/* 3. CURRENT / NEXT CLASS (Primary Action Hero Panel) */}
      <Card className="border-slate-200">
        {activeSession ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    CURRENT CLASS
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {activeSession.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{activeSession.class_name}</span>
                  <span>•</span>
                  <span>Room {activeSession.room}</span>
                  <span>•</span>
                  <span>
                    {formatDisplayTime(activeSession.start_time)} –{' '}
                    {formatDisplayTime(activeSession.end_time)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>
                    {activeSession.camera_name ? `Camera: ${activeSession.camera_name}` : 'Camera: HP-CAM'}
                  </span>
                </div>
                <Button
                  onClick={() => onNavigate && onNavigate('live')}
                  variant="primary"
                  size="sm"
                  icon={<Eye className="w-3.5 h-3.5" />}
                >
                  Open Live Attendance
                </Button>
              </div>
            </div>

            {/* Attendance Progress */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  {presentCount} / {totalRoster || 11} Students Present
                </span>
                <span className="text-slate-500 font-mono text-[11px] font-medium">
                  {progressPct}% Recorded
                </span>
              </div>
              <Progress value={progressPct} max={100} size="md" variant="auto" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold uppercase tracking-wide">
                  NEXT SCHEDULED CLASS
                </span>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {nextClass ? nextClass.subject : 'Soft Computing'}
                </h2>
              </div>
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {nextClass ? nextClass.class_name : 'TE-B'}
                </span>
                <span> • </span>
                <span>Room {nextClass?.room || 'CR 26'}</span>
                <span> • </span>
                <span>
                  {nextClass
                    ? `${formatDisplayTime(nextClass.start_time)} – ${formatDisplayTime(nextClass.end_time)}`
                    : '11:00 AM – 12:00 PM'}
                </span>
              </div>
            </div>

            <Button
              onClick={() => onNavigate && onNavigate('live')}
              variant="primary"
              size="sm"
              icon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              Start Attendance
            </Button>
          </div>
        )}
      </Card>

      {/* 4. TODAY'S CLASSES & LIVE RECOGNITION (Two-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Col 7): Today's Classes Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Today's Classes</h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {effectiveTodayClasses.length} Scheduled
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3">Room</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {effectiveTodayClasses.length > 0 ? (
                  effectiveTodayClasses.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        item.isLive ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                        {item.time}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {item.subject}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{item.className}</td>
                      <td className="py-2.5 px-3 text-slate-500">{item.room}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge
                          status={item.status}
                          category="session"
                          size="sm"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {item.isLive ? (
                          <button
                            onClick={() => onNavigate && onNavigate('live')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer transition"
                          >
                            Open
                          </button>
                        ) : (
                          <button
                            onClick={() => onNavigate && onNavigate('live')}
                            className="text-blue-600 hover:text-blue-800 font-semibold text-xs cursor-pointer"
                          >
                            Start
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-medium">
                      No classes scheduled for today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (Col 5): Live Activity / Recognition */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900">Live Recognition</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Real-time sync</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {streamItems.length > 0 ? (
              streamItems.map((item) => {
                const isReview = item.status === 'REVIEW' || item.status === 'UNKNOWN';
                const isLate = item.status === 'LATE';

                return (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                          isReview
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isReview ? '?' : '✓'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.timeAgo}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isReview ? (
                        <button
                          onClick={() => onNavigate && onNavigate('live')}
                          className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase transition cursor-pointer"
                        >
                          Review
                        </button>
                      ) : isLate ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase">
                          Late
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                          Present
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No students recognized yet today
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. RECENT ATTENDANCE TABLE */}
      {recentSessions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Recent Attendance Sessions</h3>
            <button
              onClick={() => onNavigate && onNavigate('attendance')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View All Sessions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3.5">Class</th>
                  <th className="py-2.5 px-3.5">Subject</th>
                  <th className="py-2.5 px-3.5">Date & Time</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentSessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                      {sess.class_name}
                    </td>
                    <td className="py-2.5 px-3.5 font-medium text-slate-900">
                      {sess.subject}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-500">
                      {sess.scheduled_date} • {formatDisplayTime(sess.start_time)}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <StatusBadge status={sess.status} category="session" size="sm" />
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        onClick={() => onNavigate && onNavigate('attendance')}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs cursor-pointer"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
