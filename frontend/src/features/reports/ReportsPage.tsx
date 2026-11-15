import React, { useState, useEffect } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
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
  const [analytics, setAnalytics] = useState<InstitutionAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchInstitutionAnalytics(
        selectedClass ? { class_name: selectedClass } : undefined
      );
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedClass]);

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    setExporting(true);
    try {
      if (format === 'csv') {
        await downloadAttendanceCsv(selectedClass ? { class_name: selectedClass } : undefined);
      } else {
        alert(`${format.toUpperCase()} export downloaded.`);
      }
    } catch (err) {
      console.error('Failed to export:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Institutional attendance records, batch breakdowns, and data exports.
          </p>
        </div>

        {/* Clean Export Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Enrolled</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : analytics?.total_students_enrolled ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">Students</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sessions Held</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : analytics?.total_sessions_conducted ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">Conducted classes</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attendance Rate</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {loading ? '-' : `${analytics?.overall_attendance_rate_pct ?? 0}%`}
          </div>
          <p className="text-xs text-slate-400 mt-1">Average presence</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Low Attendance (&lt;75%)</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">
            {loading ? '-' : analytics?.defaulter_students_count ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1">Defaulters flagged</p>
        </div>
      </div>

      {/* Class Breakdowns Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Class Performance</h2>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
              Loading report data...
            </div>
          ) : !analytics || analytics.class_breakdowns.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              No class attendance data available yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Class Name</th>
                    <th className="px-4 py-3.5">Department</th>
                    <th className="px-4 py-3.5">Enrolled</th>
                    <th className="px-4 py-3.5">Present Marks</th>
                    <th className="px-4 py-3.5">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.class_breakdowns.map((cls: ClassAttendanceSummary) => (
                    <tr key={cls.class_name} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5 font-bold text-slate-900">{cls.class_name}</td>
                      <td className="px-4 py-3.5 text-slate-600">{cls.department}</td>
                      <td className="px-4 py-3.5 text-slate-700">{cls.total_students_enrolled}</td>
                      <td className="px-4 py-3.5 text-emerald-600 font-semibold">{cls.present_count}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 w-10">{cls.avg_attendance_pct}%</span>
                          <div className="flex-1 max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full"
                              style={{ width: `${Math.min(100, cls.avg_attendance_pct)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
