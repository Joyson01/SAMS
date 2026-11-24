import { formatCalendarDate } from '../utils/formatDate';
import { SystemHealthCard } from '../components/SystemHealthCard';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  Play,
  Eye,
  RefreshCw,
  ArrowRight,
  Users, ClipboardList, ChartNoAxesColumn, ShieldCheck, Image,
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
  admin?: boolean;
  onNavigate?: (tab: string, studentId?: string) => void;
}

const adminActions = [
  { tab: 'attendance', label: 'Attendance sessions', help: 'Review and correct marks', icon: ClipboardList },
  { tab: 'students', label: 'Students', help: 'Manage roster and enrollment', icon: Users },
  { tab: 'timetable', label: 'Timetable', help: 'View the weekly schedule', icon: Calendar },
  { tab: 'media', label: 'Photo attendance', help: 'Review classroom photos', icon: Image },
  { tab: 'reports', label: 'Reports', help: 'Review trends and export records', icon: ChartNoAxesColumn },
  { tab: 'audit', label: 'Audit logs', help: 'Review student and staff activity', icon: ShieldCheck },
];

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

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate, admin = false }) => {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [timetableBackup, setTimetableBackup] = useState<TimetableEntry[]>([]);
  const [recentSessions, setRecentSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: unknown) {
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
        name: lr.name || lr.student_name || 'Student',
        confidence: lr.confidence ?? lr.confidence_pct ?? 0,
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
          confidence: 0,
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
          room: s.room || '—',
          status: s.status,
          isLive: s.status === 'ACTIVE',
        }))
      : timetableBackup.map((t) => ({
          id: t.id,
          time: formatDisplayTime(t.start_time),
          subject: t.label || 'Lecture',
          className: t.class_name || '—',
          room: t.room || '—',
          status: 'SCHEDULED',
          isLive: false,
        }));

  return (
    <div className="space-y-6">
      <div className={`flex flex-col justify-between gap-4 sm:flex-row sm:items-center ${admin ? "rounded-3xl bg-[#102920] p-5 text-white sm:p-7" : ""}`}>
        <div>
          <h1 className={`text-2xl font-semibold tracking-tight sm:text-3xl ${admin ? "text-white" : "text-text"}`}>
            {admin ? "Admin dashboard" : "Attendance overview"}
          </h1>
          <p className={`mt-2 text-sm ${admin ? "text-emerald-100" : "text-text-muted"}`}>{fullFormattedDate}</p>
        </div>

        <Button
          onClick={() => onNavigate && onNavigate('live')}
          variant="primary"
          size="md"
          icon={<Play className="w-3.5 h-3.5 fill-current" />}
        >
          Open live attendance
        </Button>
      </div>

      {admin && <section aria-labelledby="admin-quick-actions">
        <h2 id="admin-quick-actions" className="mb-3 text-lg font-semibold">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {adminActions.map(({ tab, label, help, icon: Icon }) => <button key={tab} type="button"
            onClick={() => onNavigate?.(tab)}
            className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:border-primary hover:bg-surface-muted">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{label}</strong><span className="block text-xs text-text-muted">{help}</span></span>
            <ArrowRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          </button>)}
        </div>
      </section>}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {[
          ['Students on roster', summary.total_students, `${summary.enrolled_students} enrolled for recognition`],
          ['Present today', summary.present_today, 'Recorded attendance'],
          ['Absent today', summary.absent_today, 'Recorded absences'],
          ['Attendance rate', `${summary.attendance_rate_pct}%`, 'Today'],
        ].map(([label, value, detail]) => <div key={label} className="bg-surface p-4 sm:p-6">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="mt-3 text-3xl font-medium tabular-nums text-text">{value}</p>
          <p className="mt-2 text-xs text-text-muted">{detail}</p>
        </div>)}
      </div>

      {/* 3. CURRENT / NEXT CLASS (Primary Action Hero Panel) */}
      {(activeSession || nextClass) && <Card>
        {activeSession ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 " />
                    Active session
                  </span>
                  <h2 className="text-base sm:text-lg font-semibold text-text leading-tight">
                    {activeSession.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                  <span className="font-semibold text-text">{activeSession.class_name}</span>
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
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-muted border border-border rounded-md text-xs text-text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>
                    {activeSession.camera_name ? `Camera: ${activeSession.camera_name}` : 'No camera assigned'}
                  </span>
                </div>
                <Button
                  onClick={() => onNavigate && onNavigate('live')}
                  variant="secondary"
                  size="sm"
                  icon={<Eye className="w-3.5 h-3.5" />}
                >
                  Open Live Attendance
                </Button>
              </div>
            </div>

            {/* Attendance Progress */}
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-text">
                  {presentCount} / {totalRoster} students present
                </span>
                <span className="text-text-muted font-mono text-xs font-medium">
                  {progressPct}% recorded
                </span>
              </div>
              <Progress value={progressPct} max={100} size="md" variant="auto" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text leading-tight">
                  {nextClass ? nextClass.subject : 'No upcoming class'}
                </h2>
              </div>
              <div className="text-xs text-text-muted">
                <span className="font-semibold text-text">
                  {nextClass ? nextClass.class_name : 'Your schedule is clear'}
                </span>
                {nextClass && <><span> • </span>{nextClass.room && <><span>Room {nextClass.room}</span><span> • </span></>}<span>{formatDisplayTime(nextClass.start_time)} – {formatDisplayTime(nextClass.end_time)}</span></>}
              </div>
            </div>

          </div>
        )}
      </Card>}

      {/* 4. TODAY'S CLASSES & LIVE RECOGNITION (Two-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Col 7): Today's classes Table */}
        <div className="lg:col-span-8 bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text">Today's classes</h3>
            </div>
            <span className="text-xs text-text-muted font-medium">
              {effectiveTodayClasses.length} Scheduled
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="ui-table register-table w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-border text-text-muted text-xs font-semibold">
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Subject</th>
                  <th className="py-3 px-3">Class</th>
                  <th className="py-3 px-3">Room</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {effectiveTodayClasses.length > 0 ? (
                  effectiveTodayClasses.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-surface-muted/70 transition-colors ${
                        item.isLive ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td data-label="Time" className="py-3 px-3 font-mono font-medium text-text whitespace-nowrap">
                        {item.time}
                      </td>
                      <td data-label="Subject" className="py-3 px-3 font-semibold text-text">
                        {item.subject}
                      </td>
                      <td data-label="Class" className="py-3 px-3 text-text-muted">{item.className}</td>
                      <td data-label="Room" className="py-3 px-3 text-text-muted">{item.room}</td>
                      <td data-label="Status" className="py-3 px-3">
                        <StatusBadge
                          status={item.status}
                          category="session"
                          size="sm"
                        />
                      </td>
                      <td data-label="Action" className="py-3 px-3 text-right">
                        <button type="button" onClick={() => onNavigate?.(item.isLive ? 'live' : todaySessions.length ? 'attendance' : 'timetable')}
                          className="min-h-11 whitespace-nowrap text-xs font-semibold text-primary hover:underline">
                          {item.isLive ? 'Open live attendance' : todaySessions.length ? 'Attendance sessions' : 'View timetable'}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-text-muted text-xs font-medium">
                      No classes scheduled for today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (Col 5): Live Activity / Recognition */}
        <div className="lg:col-span-4 bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text">Recent activity</h3>
            </div>
            <span className="text-xs text-text-muted font-medium">Latest records</span>
          </div>

          <div className="divide-y divide-border text-xs">
            {streamItems.length > 0 ? (
              streamItems.map((item) => {
                const isReview = item.status === 'REVIEW' || item.status === 'UNKNOWN';
                const isLate = item.status === 'LATE';

                return (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-surface-muted/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${
                          isReview
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isReview ? '?' : '✓'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-text-muted">{item.timeAgo}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isReview ? (
                        <button
                          onClick={() => onNavigate && onNavigate('live')}
                          className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                        >
                          Review
                        </button>
                      ) : isLate ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                          Late
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                          Present
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-text-muted text-xs font-medium">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. RECENT ATTENDANCE TABLE */}
      {recentSessions.length > 0 && (
        <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Recent attendance sessions</h3>
            <button
              onClick={() => onNavigate && onNavigate('attendance')}
              className="text-xs font-medium text-text-muted hover:text-primary inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View all sessions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="ui-table register-table w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-border text-text-muted text-xs font-semibold">
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Date & time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentSessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-surface-muted/70 transition-colors">
                    <td data-label="Class" className="py-3 px-4 font-semibold text-text">
                      {sess.class_name}
                    </td>
                    <td data-label="Subject" className="py-3 px-4 font-medium text-text">
                      {sess.subject}
                    </td>
                    <td data-label="Date & time" className="py-3 px-4 text-text-muted">
                      {formatCalendarDate(sess.scheduled_date)} • {formatDisplayTime(sess.start_time)}
                    </td>
                    <td data-label="Status" className="py-3 px-4">
                      <StatusBadge status={sess.status} category="session" size="sm" />
                    </td>
                    <td data-label="Action" className="py-3 px-4 text-right">
                      <button
                        onClick={() => onNavigate && onNavigate('attendance')}
                        className="text-text-muted hover:text-primary font-medium text-xs cursor-pointer"
                      >
                        Open sessions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-text">Attendance trend</h2>
          {data?.attendance_trend.length ? <span className="text-xs text-text-muted">Most recent {Math.min(7, data.attendance_trend.length)} reported days</span> : null}
        </div>
        {data?.attendance_trend.length ? <div className="mt-6 flex h-44 items-end gap-3" role="img" aria-label={data.attendance_trend.slice(-7).map(day => `${day.day_label}: ${day.attendance_pct}% attendance`).join(', ')}>
          {data.attendance_trend.slice(-7).map((day, index, days) => <div key={day.record_date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs tabular-nums text-text">{day.attendance_pct}%</span>
            <div className={`w-full max-w-16 rounded-t ${index === days.length - 1 ? 'bg-primary' : 'bg-slate-300'}`} style={{height: `${Math.max(2, Math.min(100, day.attendance_pct))}%`}} />
            <span className="text-xs text-text-muted">{day.day_label}</span>
          </div>)}
        </div> : <p className="mt-2 text-sm text-text-muted">The trend will appear as attendance sessions are completed</p>}
      </Card>
      <SystemHealthCard />
    </div>
  );
};
