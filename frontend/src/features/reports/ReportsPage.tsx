import { EmptyState, Button } from '../../components/ui';
import { formatApiErrorMessage } from '../../utils/apiError';
import React, { useState, useEffect } from 'react';
import {
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  fetchInstitutionAnalytics,
  downloadAttendanceReport,
  type AnalyticsFilterParams,
  type ReportFormat,
} from '../../services/reportsApi';
import { fetchClasses, fetchSubjects } from '../../services/subjectApi';
import {
  InstitutionAnalyticsResponse,
  ClassAttendanceSummary,
} from '../../types/reports';

function localDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function initialFilters(): AnalyticsFilterParams {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);
  return { start_date: localDate(start), end_date: localDate(today) };
}

const filterInput = 'mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text';
const exportFormats: { value: ReportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
];

export const ReportsPage: React.FC = () => {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [analytics, setAnalytics] = useState<InstitutionAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ReportFormat | null>(null);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(draft);
  const [format, setFormat] = useState<ReportFormat>('csv');

  const filtersChanged = draft.start_date !== applied.start_date
    || draft.end_date !== applied.end_date
    || draft.class_name !== applied.class_name
    || draft.subject !== applied.subject;

  const loadData = async (filters: AnalyticsFilterParams) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      setAnalytics(await fetchInstitutionAnalytics(filters));
      setApplied(filters);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to load reports. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(draft);
    void fetchClasses().then(classes => {
      setClassNames([...new Set(classes.map(item => item.name))].sort());
    }).catch(() => {});
    void fetchSubjects().then(subjects => {
      setSubjectNames([...new Set(subjects.map(item => item.name))].sort());
    }).catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(format);
    setError('');
    setNotice('');
    try {
      await downloadAttendanceReport(format, applied);
      setNotice(`Your ${exportFormats.find(option => option.value === format)?.label} report has been downloaded.`);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to export the report. Please try again.'));
    } finally {
      setExporting(null);
    }
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

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Report export format"
            value={format}
            onChange={event => setFormat(event.target.value as ReportFormat)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {exportFormats.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button onClick={() => void handleExport()} disabled={loading || !analytics || filtersChanged || exporting !== null}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Download report'}
          </Button>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" onSubmit={event => {
        event.preventDefault();
        void loadData(draft);
      }}>
        <label className="text-sm font-medium">
          From
          <input className={filterInput} type="date" required max={draft.end_date} value={draft.start_date}
            onChange={event => setDraft({ ...draft, start_date: event.target.value })} />
        </label>
        <label className="text-sm font-medium">
          To
          <input className={filterInput} type="date" required min={draft.start_date} value={draft.end_date}
            onChange={event => setDraft({ ...draft, end_date: event.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Class
          <input className={filterInput} list="report-class-names" placeholder="All classes" maxLength={64} value={draft.class_name ?? ''}
            onChange={event => setDraft({ ...draft, class_name: event.target.value || undefined })} />
        </label>
        <datalist id="report-class-names">
          {classNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <label className="text-sm font-medium">
          Subject
          <input className={filterInput} list="report-subject-names" placeholder="All subjects" maxLength={128} value={draft.subject ?? ''}
            onChange={event => setDraft({ ...draft, subject: event.target.value || undefined })} />
        </label>
        <datalist id="report-subject-names">
          {subjectNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <Button type="submit" variant="secondary" disabled={loading}>Apply filters</Button>
      </form>
      {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</p>}
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
        <h2 className="text-lg font-semibold text-text">Class Performance</h2>

        {/* Clean Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 text-center text-text-muted text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-2" />
              Loading report data...
            </div>
          ) : !analytics || analytics.class_breakdowns.length === 0 ? (
            <EmptyState title="No matching class data" description="Try a different date range, class, or subject."/>
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
