import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  Play,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { fetchDashboardSummary } from '../services/dashboardApi';
import { DashboardSummaryResponse } from '../types/dashboard';

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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showFullLoading = false) => {
    if (showFullLoading) setLoading(true);
    setError(null);
    try {
      const summary = await fetchDashboardSummary();
      setData(summary);
    } catch (err: any) {
      console.error('Failed to load dashboard summary:', err);
      setError('Unable to load dashboard data. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    // Real-time polling every 8 seconds while dashboard is open
    const interval = setInterval(() => {
      loadData(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Greeting based on client local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-200 rounded"></div>
          ))}
        </div>
        <div className="h-28 bg-slate-200 rounded"></div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 h-64 bg-slate-200 rounded"></div>
          <div className="lg:col-span-5 h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-rose-200 rounded p-8 text-center space-y-3 max-w-md mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-sm font-bold text-slate-900">Dashboard Unavailable</h3>
        <p className="text-xs text-slate-500">{error}</p>
        <button
          onClick={() => loadData(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
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
  const totalRoster = activeSession?.total_roster_count || (activeSession ? activeSession.present_count + activeSession.absent_count : 0);
  const presentCount = activeSession?.present_count ?? 0;
  const progressPct = totalRoster > 0 ? Math.min(100, Math.round((presentCount / totalRoster) * 100)) : 0;

  // Live recognition stream items extracted from actual backend recognition events
  const streamItems = useMemo(() => {
    if (data?.live_recognitions && data.live_recognitions.length > 0) {
      return data.live_recognitions.map((lr) => ({
        id: lr.id,
        name: lr.name || (lr as any).student_name || 'Student',
        confidence: lr.confidence ?? (lr as any).confidence_pct ?? 0,
        status: lr.status,
      }));
    }
    if (data?.recent_activities && data.recent_activities.length > 0) {
      return data.recent_activities
        .filter((a) => a.event_type === 'ATTENDANCE' || a.event_type === 'UNKNOWN_FACE')
        .map((a) => ({
          id: a.id,
          name: a.event_type === 'UNKNOWN_FACE' ? 'Unknown Face' : a.title.replace(/ marked .*/i, '') || a.title,
          confidence: a.event_type === 'UNKNOWN_FACE' ? 0 : 96,
          status: a.event_type === 'UNKNOWN_FACE' ? 'REVIEW' : a.title.toLowerCase().includes('late') ? 'LATE' : 'PRESENT',
        }));
    }
    return [];
  }, [data?.live_recognitions, data?.recent_activities]);

  return (
    <div className="space-y-4">
      {/* 1. Top Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {greeting}, Dr. Raman
          </h1>
          <p className="text-xs text-slate-500">
            Today's attendance overview.
          </p>
        </div>
      </div>

      {/* 2. KPI Section (4 Compact Statistics: Students, Present, Absent, Attendance Rate) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Students */}
        <div className="bg-white border border-slate-200 rounded p-3 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Students
          </span>
          <div className="mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
              {summary.total_students}
            </span>
          </div>
        </div>

        {/* Present */}
        <div className="bg-white border border-slate-200 rounded p-3 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Present
          </span>
          <div className="mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 font-sans tracking-tight">
              {summary.present_today}
            </span>
          </div>
        </div>

        {/* Absent */}
        <div className="bg-white border border-slate-200 rounded p-3 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Absent
          </span>
          <div className="mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-rose-600 font-sans tracking-tight">
              {summary.absent_today}
            </span>
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded p-3 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Attendance Rate
          </span>
          <div className="mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-blue-600 font-sans tracking-tight">
              {summary.attendance_rate_pct}%
            </span>
          </div>
        </div>
      </div>

      {/* 3. Current Class Section (Active Session or Next Scheduled Class) */}
      <div className="bg-white border border-slate-200 rounded p-4">
        {activeSession ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Left Details */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    CURRENT CLASS
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {activeSession.subject}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {activeSession.class_name}
                  </span>
                  <span>•</span>
                  <span>Room {activeSession.room}</span>
                  <span>•</span>
                  <span>
                    {formatDisplayTime(activeSession.start_time)} –{' '}
                    {formatDisplayTime(activeSession.end_time)}
                  </span>
                </div>
              </div>

              {/* Right Status & Single Open Action */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{activeSession.camera_name ? `Camera: ${activeSession.camera_name}` : 'Camera Connected'}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Face Recognition Active</span>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('live')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Open Live Attendance</span>
                </button>
              </div>
            </div>

            {/* Roster Counter & Slim Progress Bar */}
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  {presentCount} / {totalRoster} Students Present
                </span>
                <span className="text-slate-500 font-mono">{progressPct}% Complete</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          /* Idle State: No Active Class */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-semibold uppercase tracking-wide self-start">
                NO ACTIVE CLASS
              </span>
              <div className="text-xs text-slate-600 mt-0.5">
                <span className="text-slate-400">Your next class: </span>
                <span className="font-semibold text-slate-800">
                  {nextClass
                    ? `${nextClass.subject} • ${nextClass.room ? `Room ${nextClass.room} • ` : ''}${formatDisplayTime(nextClass.start_time)}`
                    : 'No upcoming classes scheduled today'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigate && onNavigate('live')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors cursor-pointer self-start sm:self-center"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Attendance</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Two-Column Workspace (Today's Classes & Live Attendance Stream) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column (Col 7): Today's Classes Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded flex flex-col">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
                Today's Classes
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              {todaySessions.length} Scheduled
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider">
                  <th className="py-2 px-3 font-semibold">Time</th>
                  <th className="py-2 px-3 font-semibold">Subject</th>
                  <th className="py-2 px-3 font-semibold">Room</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {todaySessions.length > 0 ? (
                  todaySessions.map((sess) => {
                    const isLive = sess.status === 'ACTIVE';
                    const isCompleted = sess.status === 'COMPLETED';

                    return (
                      <tr
                        key={sess.id}
                        className={`transition-colors ${
                          isLive
                            ? 'bg-blue-50/40 hover:bg-blue-50/60'
                            : 'hover:bg-slate-50/60'
                        }`}
                      >
                        {/* Time */}
                        <td
                          className={`py-2.5 px-3 font-mono ${
                            isLive ? 'text-blue-600 font-bold' : 'text-slate-600 font-medium'
                          }`}
                        >
                          {formatDisplayTime(sess.start_time)}
                        </td>

                        {/* Subject */}
                        <td
                          className={`py-2.5 px-3 ${
                            isLive ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
                          }`}
                        >
                          <div>{sess.subject}</div>
                          <div className="text-[10px] text-slate-400">{sess.class_name}</div>
                        </td>

                        {/* Room */}
                        <td className="py-2.5 px-3 text-slate-500">{sess.room}</td>

                        {/* Status */}
                        <td className="py-2.5 px-3">
                          {isLive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              LIVE
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 text-[10px] font-semibold">
                              Upcoming
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-2.5 px-3 text-right">
                          {isLive ? (
                            <button
                              onClick={() => onNavigate && onNavigate('live')}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition cursor-pointer"
                            >
                              Open
                            </button>
                          ) : isCompleted ? (
                            <button
                              onClick={() => onNavigate && onNavigate('attendance')}
                              className="px-2.5 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs font-semibold transition cursor-pointer"
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs font-medium">
                      No sessions scheduled for today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (Col 5): Live Attendance Stream */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded flex flex-col">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 leading-tight">
                  LIVE RECOGNITION
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-emerald-600 font-mono font-medium">Syncing</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {streamItems.length > 0 ? (
              streamItems.map((item) => {
                const isReview = item.status === 'REVIEW' || item.status === 'UNKNOWN';
                const isLate = item.status === 'LATE';

                return (
                  <div
                    key={item.id}
                    className={`p-3 flex items-center justify-between transition-colors ${
                      isReview ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {isReview && <span className="text-rose-600 font-bold text-xs">⚠</span>}
                      <span
                        className={`font-semibold truncate ${
                          isReview ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-400 font-mono font-normal">
                        {item.confidence && item.confidence > 0 ? `${item.confidence}%` : '—'}
                      </span>

                      {isReview ? (
                        <button
                          onClick={() => onNavigate && onNavigate('live')}
                          className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold uppercase hover:bg-rose-100 transition-colors cursor-pointer"
                        >
                          REVIEW
                        </button>
                      ) : isLate ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase">
                          LATE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                          PRESENT
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No face recognition events recorded today
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
