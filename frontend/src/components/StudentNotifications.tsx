import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { apiClient } from '../services/api';

type Notice = { id: string; peer_id: string; sender: string; body: string; filename?: string };

export function StudentNotifications({ openChat }: { openChat?: (peer: string) => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState(false);
  const [seen, setSeen] = useState<string>();
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const { data } = await apiClient.get<Notice[]>('/student-portal/classmates/inbox', { signal: controller.signal });
        if (!controller.signal.aborted) { setNotices(data); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 10000);
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  const hasNew = Boolean(notices[0] && seen !== notices[0].id);
  return <details ref={panel} className="relative" onToggle={event => {
    if (event.currentTarget.open) setSeen(notices[0]?.id);
  }}>
    <summary aria-label={hasNew ? 'Notifications, new chat messages' : 'Notifications'} title="Notifications"
      className="relative grid h-11 w-11 cursor-pointer list-none place-items-center rounded-lg hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
      <Bell size={17} aria-hidden="true" />
      {hasNew && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />}
    </summary>
    <div className="absolute right-0 top-full mt-2 max-h-96 w-[min(19rem,75vw)] overflow-auto rounded-xl border border-border bg-surface p-3 text-text shadow-lg">
      <h2 className="text-sm font-semibold">Notifications</h2>
      <p className="mt-2 text-sm"><strong>Admin</strong> · Hello</p>
      {error && <p className="mt-2 text-sm text-text-muted">Chat notifications are temporarily unavailable.</p>}
      {notices.map(notice => <button key={notice.id} className="mt-1 block min-h-11 w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-muted"
        onClick={() => {
          setSeen(notices[0]?.id);
          if (panel.current) panel.current.open = false;
          openChat?.(notice.peer_id);
        }}>
        <strong className="block truncate">{notice.sender}</strong>
        <span className="block truncate text-text-muted">{notice.filename ? 'File · ' + notice.filename : notice.body}</span>
      </button>)}
    </div>
  </details>;
}
