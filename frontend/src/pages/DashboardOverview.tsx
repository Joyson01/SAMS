import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Eye, Calendar, Video } from 'lucide-react';
import { fetchDashboardSummary } from '../services/dashboardApi';
import { DashboardSummaryResponse } from '../types/dashboard';
interface DashboardOverviewProps {
  onNavigate?: (tab: string, studentId?: string) => void;
}

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
    const interval = setInterval(() => {
      loadData(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48"></div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-sm"></div>
          ))}
        </div>
        <div className="h-40 bg-slate-200 rounded-sm"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-200 rounded-sm col-span-2"></div>
          <div className="h-64 bg-slate-200 rounded-sm"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-rose-200 rounded-sm p-12 text-center space-y-4 max-w-md mx-auto my-12 shadow-sm">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Dashboard Unavailable</h3>
        <p className="text-xs text-slate-500">{error}</p>
        <button
          onClick={() => loadData(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  const summary = data?.summary || {
    total_students: 0,
    present_today: 0,
    absent_today: 0,
    attendance_rate_pct: 0,
  };

  const activeSession = data?.active_session;
  const todaySessions = data?.today_sessions || [];
  const recentActivities = data?.recent_activities || [];

  // Filter activities to only show face recognitions
  const liveStreamEvents = recentActivities.filter(a => a.event_type === 'ATTENDANCE' || a.event_type === 'UNKNOWN_FACE');
  const streamCamera = liveStreamEvents.length > 0 && liveStreamEvents[0].meta?.camera ? liveStreamEvents[0].meta.camera : 'CAM-01';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* SECTION 1: HEADER & GREETING */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{getGreeting()}, Dr. Raman</h1>
        <p className="text-sm text-slate-500 mt-1">Today's attendance overview and real-time class verification.</p>
      </div>

      {/* SECTION 2: KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-xs flex flex-col justify-between h-28">
          <div className="text-[11px] font-bold text-slate-500 tracking-wider uppercase">STUDENTS</div>
          <div className="text-4xl font-bold text-slate-900">{summary.total_students}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-xs flex flex-col justify-between h-28">
          <div className="text-[11px] font-bold text-slate-500 tracking-wider uppercase">PRESENT</div>
          <div className="text-4xl font-bold text-emerald-500">{summary.present_today}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-xs flex flex-col justify-between h-28">
          <div className="text-[11px] font-bold text-slate-500 tracking-wider uppercase">ABSENT</div>
          <div className="text-4xl font-bold text-rose-500">{summary.absent_today}</div>
        </div>
        <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 rounded-sm p-5 shadow-xs flex flex-col justify-between h-28">
          <div className="text-[11px] font-bold text-slate-500 tracking-wider uppercase">ATTENDANCE</div>
          <div className="text-4xl font-bold text-blue-500">{summary.attendance_rate_pct.toFixed(1)}%</div>
        </div>
      </div>

      {/* SECTION 3: CURRENT CLASS */}
      {activeSession ? (
        <div className="bg-white border border-slate-200 rounded-sm p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  CURRENT CLASS
                </span>
                <h2 className="text-lg font-bold text-slate-900">{activeSession.subject}</h2>
              </div>
              <div className="text-xs font-medium text-slate-500 flex items-center gap-3">
                <span className="text-slate-800">{activeSession.class_name}</span>
                <span className="text-slate-300">•</span>
                <span>Room {activeSession.room}</span>
                <span className="text-slate-300">•</span>
                <span>{activeSession.start_time} &ndash; {activeSession.end_time}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Camera Connected
              </span>
              <span className="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Face Recognition Active
              </span>
              <button
                onClick={() => onNavigate && onNavigate('live')}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition shadow-sm ml-2"
              >
                <Eye className="w-4 h-4" />
                Open Live Attendance
              </button>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span className="text-slate-700">{activeSession.present_count} / {activeSession.total_roster_count} Students Present</span>
              <span className="text-slate-500">{activeSession.total_roster_count > 0 ? Math.round((activeSession.present_count / activeSession.total_roster_count) * 100) : 0}% Complete</span>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                style={{ width: `${activeSession.total_roster_count > 0 ? (activeSession.present_count / activeSession.total_roster_count) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm p-6 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
          <Calendar className="w-8 h-8 text-slate-300" />
          <div>
            <h3 className="font-bold text-slate-900 text-base">No active class right now</h3>
            <p className="text-xs text-slate-500 mt-1">The next scheduled class will appear here automatically.</p>
          </div>
          <button
            onClick={() => onNavigate && onNavigate('live')}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-xs font-semibold transition shadow-sm"
          >
            Start Attendance
          </button>
        </div>
      )}

      {/* SECTION 4: TABLE AND STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Today's Classes */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-sm shadow-xs flex flex-col">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h2 className="font-bold text-slate-900 text-sm">Today's Classes</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-500 tracking-wider">{todaySessions.length} SCHEDULED</span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-500 tracking-wider uppercase bg-slate-50/50">
                  <th className="px-5 py-3 font-bold">TIME</th>
                  <th className="px-5 py-3 font-bold">SUBJECT</th>
                  <th className="px-5 py-3 font-bold">ROOM</th>
                  <th className="px-5 py-3 font-bold text-center">STATUS</th>
                  <th className="px-5 py-3 font-bold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todaySessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400 font-medium">
                      No classes scheduled for today.
                    </td>
                  </tr>
                ) : (
                  todaySessions.map(session => {
                    const isLive = session.status === 'ACTIVE';
                    const isCompleted = session.status === 'COMPLETED';
                    return (
                      <tr key={session.id} className="hover:bg-slate-50/50 transition">
                        <td className={`px-5 py-3.5 font-bold ${isLive ? 'text-blue-600' : 'text-slate-600'}`}>{session.start_time}</td>
                        <td className={`px-5 py-3.5 font-bold ${isLive ? 'text-slate-900' : 'text-slate-700'}`}>{session.subject}</td>
                        <td className="px-5 py-3.5 text-slate-500">{session.room}</td>
                        <td className="px-5 py-3.5 text-center">
                          {isLive ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold text-emerald-600 border border-emerald-200 bg-emerald-50">
                              LIVE
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-100">
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-100">
                              Upcoming
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isLive ? (
                            <button
                              onClick={() => onNavigate && onNavigate('live')}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-semibold transition"
                            >
                              Open
                            </button>
                          ) : isCompleted ? (
                            <button
                              onClick={() => onNavigate && onNavigate('attendance')}
                              className="text-blue-600 hover:text-blue-800 font-bold transition"
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-slate-300 font-bold">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Attendance Stream */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <h2 className="font-bold text-slate-900 text-sm">Live Attendance Stream</h2>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Latest recognized faces from {streamCamera}</p>
            </div>
            <span className="text-[10px] font-bold text-emerald-500">Syncing</span>
          </div>

          <div className="p-2 space-y-1 flex-1 overflow-y-auto min-h-[300px]">
            {liveStreamEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Video className="w-6 h-6 text-slate-200" />
                <p className="text-xs font-medium text-slate-400">Waiting for recognitions...</p>
              </div>
            ) : (
              liveStreamEvents.map(event => {
                const meta = event.meta || {};
                const name = meta.name || event.title.split(' marked ')[0] || 'Unknown Person';
                const confidence = meta.confidence ? `${Math.round(meta.confidence * 100)}%` : '—';
                const status = meta.status || event.title.split(' marked ')[1] || 'UNKNOWN';

                const isUnknown = event.event_type === 'UNKNOWN_FACE';
                const isLate = status.includes('LATE');


                return (
                  <div key={event.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUnknown && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      <span className={`text-xs font-bold truncate ${isUnknown ? 'text-rose-600' : 'text-slate-800'}`}>
                        {isUnknown ? 'Unknown Face Detected' : name}
                      </span>
                      {!isUnknown && <span className="text-[10px] font-medium text-slate-400">({confidence})</span>}
                    </div>

                    <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      isUnknown ? 'text-rose-600 border-rose-200 bg-rose-50' :
                      isLate ? 'text-amber-600 border-amber-200 bg-amber-50' :
                      'text-emerald-600 border-emerald-200 bg-emerald-50'
                    }`}>
                      {isUnknown ? 'Review' : isLate ? 'LATE' : 'PRESENT'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
