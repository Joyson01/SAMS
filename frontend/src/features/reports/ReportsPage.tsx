import { EmptyState, Button } from '../../components/ui';
import { formatApiErrorMessage } from '../../utils/apiError';
import React, { useState, useEffect } from 'react';
import {
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  fetchInstitutionAnalytics,
  downloadAttendanceCsv,
} from '../../services/reportsApi';
import {
  InstitutionAnalyticsResponse,
  ClassAttendanceSummary,
} from '../../types/reports';

export const ReportsPage: React.FC = () => {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [analytics, setAnalytics] = useState<InstitutionAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchInstitutionAnalytics(
        selectedClass ? { class_name: selectedClass } : undefined
      );
      setAnalytics(data);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to load reports. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedClass]);

  const handleExport = async () => {
    setExporting(true); setError(''); setNotice('');
    try {
      await downloadAttendanceCsv(selectedClass ? { class_name: selectedClass } : undefined);
      setNotice('Your CSV report has been downloaded.');
    } catch (err) { setError(formatApiErrorMessage(err, 'Unable to export the report. Please try again.')); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Attendance records, class breakdowns, and data exports.
          </p>
        </div>

        {/* Clean Export Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border hover:bg-surface-muted text-text text-xs font-medium transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-text-muted" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

        </div>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"><p>{error}</p><Button variant="secondary" size="sm" onClick={() => void loadData()}>Retry</Button></div>}
      {notice && <p role="status" className="rounded-xl bg-success/10 p-4 text-sm text-success">{notice}</p>}
      {/* 4 Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">Total Enrolled</div>
          <div className="text-3xl font-bold text-text mt-2">
            {loading ? '-' : analytics?.total_students_enrolled ?? 0}
          </div>
          <p className="text-xs text-text-muted mt-1">Students</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">Sessions Held</div>
          <div className="text-3xl font-bold text-text mt-2">
            {loading ? '-' : analytics?.total_sessions_conducted ?? 0}
          </div>
          <p className="text-xs text-text-muted mt-1">Conducted classes</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">Attendance Rate</div>
          <div className="text-3xl font-bold text-indigo-600 mt-2">
            {loading ? '-' : `${analytics?.overall_attendance_rate_pct ?? 0}%`}
          </div>
          <p className="text-xs text-text-muted mt-1">Average presence</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">Low Attendance (&lt;75%)</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">
            {loading ? '-' : analytics?.defaulter_students_count ?? 0}
          </div>
          <p className="text-xs text-text-muted mt-1">Defaulters flagged</p>
        </div>
      </div>

      {/* Class Breakdowns Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">Class Performance</h2>
          <select
            aria-label="Filter reports by class"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-indigo-500 shadow-sm"
          >
            <option value="">All Classes</option>
            {analytics?.class_breakdowns?.map((c: ClassAttendanceSummary) => (
              <option key={c.class_name} value={c.class_name}>
                {c.class_name} ({c.department})
              </option>
            ))}
          </select>
        </div>

        {/* Clean Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 text-center text-text-muted text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
              Loading report data...
            </div>
          ) : !analytics || analytics.class_breakdowns.length === 0 ? (
            <EmptyState title="No attendance reports yet" description="Complete an attendance session to see your class performance here."/>
          ) : (
            <div><div className="divide-y divide-border md:hidden">{analytics.class_breakdowns.map(cls=><article key={cls.class_name} className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{cls.class_name}</h3><strong className="text-primary">{cls.avg_attendance_pct}%</strong></div><p className="text-sm text-text-muted">{cls.department}</p><div className="flex justify-between text-xs text-text-muted"><span>{cls.total_students_enrolled} enrolled</span><span>{cls.present_count} present marks</span></div><div className="h-2 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.min(100,Math.max(0,cls.avg_attendance_pct))}%`}}/></div></article>)}</div><div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-text-muted font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Class Name</th>
                    <th className="px-4 py-3.5">Department</th>
                    <th className="px-4 py-3.5">Enrolled</th>
                    <th className="px-4 py-3.5">Present Marks</th>
                    <th className="px-4 py-3.5">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.class_breakdowns.map((cls: ClassAttendanceSummary) => (
                    <tr key={cls.class_name} className="hover:bg-surface-muted/80 transition">
                      <td className="px-5 py-3.5 font-bold text-text">{cls.class_name}</td>
                      <td className="px-4 py-3.5 text-text-muted">{cls.department}</td>
                      <td className="px-4 py-3.5 text-text">{cls.total_students_enrolled}</td>
                      <td className="px-4 py-3.5 text-emerald-600 font-semibold">{cls.present_count}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text w-10">{cls.avg_attendance_pct}%</span>
                          <div className="flex-1 max-w-xs bg-surface-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, cls.avg_attendance_pct)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
