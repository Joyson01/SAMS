import { Modal, Skeleton, Button, EmptyState } from '../../components/ui';
import { formatApiErrorMessage } from '../../utils/apiError';
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Filter,
  RefreshCw,
  Eye,
  FileText,
} from 'lucide-react';
import { AuditLogEntry } from '../../types/security';
import { fetchAuditLogs, fetchAuditMessage } from '../../services/securityApi';

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return 'Not recorded';
  const platform = /iPhone/i.test(userAgent) ? 'iPhone'
    : /iPad/i.test(userAgent) ? 'iPad'
    : /Android/i.test(userAgent) ? 'Android'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Macintosh/i.test(userAgent) ? 'Mac'
    : /Linux/i.test(userAgent) ? 'Linux' : '';
  const browser = /Edg(?:e|A|iOS)?\//i.test(userAgent) ? 'Edge'
    : /(?:Firefox|FxiOS)\//i.test(userAgent) ? 'Firefox'
    : /(?:Chrome|CriOS)\//i.test(userAgent) ? 'Chrome'
    : /Safari\//i.test(userAgent) ? 'Safari' : '';
  return [browser, platform].filter(Boolean).join(' · ') || 'Other client';
}

function AuditMessage({ eventId }: { eventId: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);

  async function showMessage() {
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const message = await fetchAuditMessage(eventId, controller.signal);
      if (!controller.signal.aborted) setBody(message);
    } catch (err) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(err, 'Could not load the message.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <section className="min-w-0 space-y-2 rounded-xl border border-border p-3">
    <h3 className="text-sm font-semibold">Chat message</h3>
    {body === null
      ? <Button size="sm" variant="secondary" disabled={loading} onClick={() => void showMessage()}>
        {loading ? 'Loading message…' : 'Show message'}
      </Button>
      : <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{body}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}

export const AuditLogsPage: React.FC = () => {
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [signInActivity, setSignInActivity] = useState(false);
  const [studentActivity, setStudentActivity] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAuditLogs({
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
        page,
        page_size: pageSize,
        student_activity: studentActivity || undefined,
        sign_in_activity: signInActivity || undefined,
      });
      setLogs(data.items);
      setTotalCount(data.total_count);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to load audit logs. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [actionFilter, entityFilter, studentActivity, signInActivity, page]);

  const actionLabel = (action: string) => action.toLowerCase().replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());

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
        return 'bg-surface text-text border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Audit logs
          </h1>
          <p className="text-sm text-text-muted">
            Review student activity, administrative changes, and attendance corrections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-surface border border-border text-text hover:bg-surface transition"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Audit category">
        <Button variant={signInActivity ? 'secondary' : 'primary'} aria-pressed={!signInActivity} onClick={() => {
          setSignInActivity(false); setActionFilter(''); setEntityFilter(''); setPage(1);
        }}>All activity</Button>
        <Button variant={signInActivity ? 'primary' : 'secondary'} aria-pressed={signInActivity} onClick={() => {
          setSignInActivity(true); setActionFilter(''); setEntityFilter(''); setStudentActivity(false); setPage(1);
        }}>Sign-in activity</Button>
      </div>
      {/* Filter Ribbon */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-text-muted font-semibold">
          <Filter className="w-4 h-4 text-indigo-400" />
          <span>Filters:</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-text-muted">Action Type:</label>
          <select
            aria-label="Filter audit actions"
            disabled={signInActivity}
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-text"
          >
            <option value="">All Actions</option>
            <option value="MANUAL_OVERRIDE">MANUAL_OVERRIDE</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="STUDENT_SEND_MESSAGE">Private messages sent</option>
            <option value="STUDENT_SEND_GROUP_MESSAGE">Group messages sent</option>
            <option value="VIEW_CHAT_MESSAGE">Admin message reviews</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-text-muted">Entity Type:</label>
          <select
            aria-label="Filter audit entities"
            disabled={signInActivity}
            value={entityFilter}
            onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-text"
          >
            <option value="">All Entities</option>
            <option value="AttendanceRecord">AttendanceRecord</option>
            <option value="Student">Student</option>
            <option value="AttendanceSession">AttendanceSession</option>
            <option value="Camera">Camera</option>
            <option value="ClassmateMessage">Private chat</option>
            <option value="ClassroomPost">Class space</option>
            <option value="AssignmentSubmission">Assignments</option>
          </select>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={studentActivity} className="h-4 w-4 accent-primary" onChange={event => {
            setStudentActivity(event.target.checked);
            setActionFilter('');
            setEntityFilter('');
            setPage(1);
          }} />
          Student activity only
        </label>

        <div className="ml-auto text-text-muted font-mono">
          Total Logged Actions: <span className="font-bold text-text">{totalCount}</span>
        </div>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-danger"><p>{error}</p><Button variant="secondary" onClick={() => void loadData()}>Retry</Button></div>}
      {loading && <Skeleton className="h-32"/>}
      {/* Audit Logs Table */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto shadow-sm">
        <div className="divide-y divide-border md:hidden">{!logs.length && !loading && !error && <EmptyState title="No audit entries found" description="Try another filter. New administrative actions will appear here."/>}{logs.map(log=><article key={log.id} className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${getActionBadgeColor(log.action)}`}>{actionLabel(log.action)}</span><span className="text-xs text-text-muted">{new Date(log.created_at).toLocaleString()}</span></div><p className="text-sm font-medium">{log.entity_type} · {log.username || 'System'}</p><p className="break-all font-mono text-xs text-text-muted">{log.ip_address || 'IP not recorded'} · {deviceLabel(log.user_agent)}</p><Button variant="secondary" size="sm" icon={<Eye size={15}/>} onClick={()=>setSelectedLog(log)}>View entry</Button></article>)}</div>
        <table className="hidden w-full text-left text-xs md:table">
          <thead className="bg-surface/80 text-text-muted uppercase tracking-wider font-semibold border-b border-border">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Entity Type</th>
              <th className="py-3 px-4">IP address</th>
              <th className="py-3 px-4">Device / browser</th>
              <th className="py-3 px-4">Performed By</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-surface/50 transition">
                <td className="py-3 px-4 font-mono text-text-muted whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadgeColor(
                      log.action
                    )}`}
                  >
                    {actionLabel(log.action)}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-text">{log.entity_type}</td>
                <td className="py-3 px-4 font-mono text-text-muted max-w-[150px] truncate">
                  {log.ip_address || 'Not recorded'}
                </td>
                <td className="py-3 px-4 text-text-muted">{deviceLabel(log.user_agent)}</td>
                <td className="py-3 px-4 font-semibold text-text">
                  {log.username || 'System'}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="px-2.5 py-1 rounded bg-surface hover:bg-surface text-indigo-300 hover:text-indigo-200 flex items-center gap-1 ml-auto font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5" /> View entry
                  </button>
                </td>
              </tr>
            ))}

            {logs.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-text-muted">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-text-muted" />
                  No audit logs match the current search filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalCount > pageSize && <nav aria-label="Audit pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-sm">
          <Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span>Page {page} of {Math.ceil(totalCount / pageSize)}</span>
          <Button variant="secondary" disabled={loading || page * pageSize >= totalCount} onClick={() => setPage(value => value + 1)}>Next</Button>
        </nav>}
      </div>

      {/* Audit Log Diff Detail Modal */}
      {selectedLog && (
        <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title={<span className="flex items-center gap-2"><FileText size={18}/>Audit trail inspection</span>} maxWidth="2xl">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface p-3 rounded-xl border border-border">
                <div>
                  <span className="text-text-muted block text-[10px] uppercase">Action</span>
                  <span className="font-bold text-text">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase">Entity</span>
                  <span className="font-mono text-text">{selectedLog.entity_type}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase">User</span>
                  <span className="font-semibold text-text">{selectedLog.username}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase">Timestamp</span>
                  <span className="text-text font-mono">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <dl className="grid gap-3 rounded-xl border border-border p-3 text-sm sm:grid-cols-2">
                <div><dt className="text-text-muted">IP address</dt><dd className="break-all font-mono">{selectedLog.ip_address || 'Not recorded'}</dd></div>
                <div><dt className="text-text-muted">Device / browser</dt><dd>{deviceLabel(selectedLog.user_agent)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-text-muted">Reported user agent</dt><dd className="break-all">{selectedLog.user_agent || 'Not recorded'}</dd></div>
                {selectedLog.entity_type === 'ClassmateMessage' && typeof selectedLog.new_values?.classmate_name === 'string' && (
                  <div><dt className="text-text-muted">Other participant</dt><dd>{selectedLog.new_values.classmate_name}</dd></div>
                )}
                {selectedLog.request_details && <>
                  <div><dt className="text-text-muted">Request ID</dt><dd className="break-all font-mono">{selectedLog.request_details.id}</dd></div>
                  <div><dt className="text-text-muted">Request method</dt><dd className="font-mono">{selectedLog.request_details.method}</dd></div>
                  {selectedLog.request_details.route && <div className="sm:col-span-2"><dt className="text-text-muted">API route</dt><dd className="break-all font-mono">{selectedLog.request_details.route}</dd></div>}
                </>}
                {selectedLog.entity_type === 'ClassmateMessage' && typeof selectedLog.new_values?.file_name === 'string' && (
                  <div className="sm:col-span-2"><dt className="text-text-muted">Attachment</dt><dd className="break-all">
                    {selectedLog.new_values.file_name}
                    {typeof selectedLog.new_values.file_size_bytes === 'number' && ` · ${selectedLog.new_values.file_size_bytes.toLocaleString()} bytes`}
                  </dd></div>
                )}
                <div className="sm:col-span-2"><dt className="text-text-muted">Entity ID</dt><dd className="break-all font-mono">{selectedLog.entity_id}</dd></div>
              </dl>
              <p className="text-xs text-text-muted">The browser reports its own information. An IP may be shared by several devices or networks.</p>

              {['STUDENT_SEND_MESSAGE', 'STUDENT_SEND_GROUP_MESSAGE'].includes(selectedLog.action) &&
                <AuditMessage key={selectedLog.id} eventId={selectedLog.id} />}

              {/* Old Values vs New Values JSON Diff */}
              {selectedLog.entity_type !== 'ClassmateMessage' && (selectedLog.old_values || selectedLog.new_values) && <div className="space-y-2">
                <span className="text-text-muted font-semibold block">Record changes</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-surface p-3 rounded-xl border border-border/80">
                    <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1">
                      Before (Old Values)
                    </span>
                    <pre className="font-mono text-[10px] text-text overflow-x-auto">
                      {selectedLog.old_values
                        ? JSON.stringify(selectedLog.old_values, null, 2)
                        : 'None'}
                    </pre>
                  </div>
                  <div className="bg-surface p-3 rounded-xl border border-border/80">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1">
                      After (New Values)
                    </span>
                    <pre className="font-mono text-[10px] text-text overflow-x-auto">
                      {selectedLog.new_values
                        ? JSON.stringify(selectedLog.new_values, null, 2)
                        : 'None'}
                    </pre>
                  </div>
                </div>
              </div>}
            </div>

        </Modal>
      )}
    </div>
  );
};
