import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Filter,
  RefreshCw,
  Eye,
  FileText,
  X,
} from 'lucide-react';
import { AuditLogEntry } from '../../types/security';
import { fetchAuditLogs } from '../../services/securityApi';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs({
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
        page_size: 50,
      });
      setLogs(data.items);
      setTotalCount(data.total_count);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [actionFilter, entityFilter]);

  const getActionBadgeColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'MANUAL_OVERRIDE':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'CREATE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'UPDATE':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Security & Compliance Audit Trail
          </h1>
          <p className="text-sm text-slate-400">
            Immutable system logs tracking administrative actions, manual attendance overrides, and entity state changes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
          <Filter className="w-4 h-4 text-indigo-400" />
          <span>Filters:</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-400">Action Type:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
          >
            <option value="">All Actions</option>
            <option value="MANUAL_OVERRIDE">MANUAL_OVERRIDE</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-400">Entity Type:</label>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
          >
            <option value="">All Entities</option>
            <option value="AttendanceRecord">AttendanceRecord</option>
            <option value="Student">Student</option>
            <option value="AttendanceSession">AttendanceSession</option>
            <option value="Camera">Camera</option>
          </select>
        </div>

        <div className="ml-auto text-slate-400 font-mono">
          Total Logged Actions: <span className="font-bold text-slate-200">{totalCount}</span>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Entity Type</th>
              <th className="py-3 px-4">Entity ID</th>
              <th className="py-3 px-4">Performed By</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-800/50 transition">
                <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeColor(
                      log.action
                    )}`}
                  >
                    {log.action}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-slate-200">{log.entity_type}</td>
                <td className="py-3 px-4 font-mono text-slate-400 max-w-[150px] truncate">
                  {log.entity_id}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-200">
                  {log.username || 'System'}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 flex items-center gap-1 ml-auto font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Diff
                  </button>
                </td>
              </tr>
            ))}

            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  No audit logs match the current search filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Audit Log Diff Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Audit Trail Inspection
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  ID: {selectedLog.id}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Action</span>
                  <span className="font-bold text-slate-200">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Entity</span>
                  <span className="font-mono text-slate-200">{selectedLog.entity_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">User</span>
                  <span className="font-semibold text-slate-200">{selectedLog.username}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Timestamp</span>
                  <span className="text-slate-300 font-mono">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Old Values vs New Values JSON Diff */}
              <div className="space-y-2">
                <span className="text-slate-400 font-semibold block">State Change Delta:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1">
                      Before (Old Values)
                    </span>
                    <pre className="font-mono text-[10px] text-slate-300 overflow-x-auto">
                      {selectedLog.old_values
                        ? JSON.stringify(selectedLog.old_values, null, 2)
                        : 'None'}
                    </pre>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1">
                      After (New Values)
                    </span>
                    <pre className="font-mono text-[10px] text-slate-300 overflow-x-auto">
                      {selectedLog.new_values
                        ? JSON.stringify(selectedLog.new_values, null, 2)
                        : 'None'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
