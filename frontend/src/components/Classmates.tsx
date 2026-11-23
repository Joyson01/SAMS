import { FormEvent, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { formatApiErrorMessage } from '../utils/apiError';
import { Button } from './ui';

type Peer = { id: string; roll_number: string; first_name: string; last_name: string; can_chat: boolean };
type Directory = { department: string; class_name: string; section: string; students: Peer[] };
type Message = { id: string; body: string; mine: boolean; created_at: string; filename?: string };
const name = (peer: Peer) => peer.first_name + ' ' + peer.last_name;

function Chat({ peer, close }: { peer: Peer; close: () => void }) {
  const [messages, setMessages] = useState<Message[]>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [revision, refresh] = useState(0);
  const conversation = '/student-portal/classmates/' + peer.id;
  const path = conversation + '/messages';

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function load() {
      try {
        const { data } = await apiClient.get<Message[]>(path, { signal: controller.signal });
        if (!controller.signal.aborted) { setMessages(data); setError(''); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(formatApiErrorMessage(reason, 'Could not load messages.'));
      }
      if (!controller.signal.aborted) timer = window.setTimeout(load, 3000);
    }
    void load();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [path, revision]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await apiClient.post<Message>(path, { body: draft });
      setMessages(previous => [...(previous || []).filter(message => message.id !== data.id), data]);
      setDraft('');
      refresh(value => value + 1);
    } catch (reason) {
      setError(formatApiErrorMessage(reason, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError('Choose a nonempty file up to 10 MB.');
      return;
    }
    setSending(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    try {
      await apiClient.post(conversation + '/attachments', form);
      refresh(value => value + 1);
    } catch (reason) {
      setError(formatApiErrorMessage(reason, 'Could not send the file.'));
    } finally {
      setSending(false);
    }
  }

  async function download(message: Message) {
    try {
      const { data } = await apiClient.get<Blob>(conversation + '/attachments/' + message.id, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.filename || 'attachment';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(formatApiErrorMessage(reason, 'Could not download the file.'));
    }
  }

  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label="Private conversation">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">Chat with {name(peer)}</h2>
      <Button variant="secondary" onClick={close}>Back to classmates</Button>
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <div role="log" className="max-h-80 space-y-2 overflow-auto">
      {!messages ? !error && <p>Loading messages…</p> : !messages.length && <p>No messages yet.</p>}
      {messages?.map(message => <article key={message.id} className="rounded-lg bg-surface-muted p-2">
        <p className="text-xs text-text-muted">{message.mine ? 'You' : name(peer)} · {new Date(message.created_at).toLocaleString()}</p>
        {message.filename ? <Button variant="secondary" className="max-w-full break-all" onClick={() => void download(message)}>
          Download {message.filename}
        </Button> : <p className="whitespace-pre-wrap break-words">{message.body}</p>}
      </article>)}
    </div>
    <form onSubmit={send} className="space-y-2">
      <label className="block">Message<textarea className="mt-1 block w-full rounded border border-border bg-surface p-2"
        required maxLength={2000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} /></label>
      <label className="block text-sm">Send a file (up to 10 MB)
        <input className="block w-full" type="file" disabled={sending} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void attach(file);
        }} />
      </label>
      <Button type="submit" disabled={sending || !draft.trim()}>Send message</Button>
    </form>
  </section>;
}

export function Classmates({ selection, onSelectionHandled }: {
  selection?: { peerId: string }; onSelectionHandled?: () => void;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [peer, setPeer] = useState<Peer>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    apiClient.get<Directory>('/student-portal/classmates', { signal: controller.signal })
      .then(({ data }) => setDirectory(data))
      .catch(reason => {
        if (!controller.signal.aborted) setError(formatApiErrorMessage(reason, 'Unable to load classmates.'));
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!selection || !directory) return;
    setPeer(directory.students.find(student => student.id === selection.peerId && student.can_chat));
    onSelectionHandled?.();
  }, [selection, directory, onSelectionHandled]);

  const students = directory?.students.filter(student =>
    (student.roll_number + ' ' + name(student)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || [];
  return <section className="mx-auto max-w-4xl space-y-4">
    <h1 className="text-2xl font-semibold">Chats / Classmates</h1>
    {peer ? <Chat key={peer.id} peer={peer} close={() => setPeer(undefined)} />
      : error ? <div role="alert">{error} <Button onClick={() => setAttempt(attempt + 1)}>Retry</Button></div>
      : !directory ? <p role="status">Loading your class…</p>
      : <>
        <p>{directory.department} · {directory.class_name} · Section {directory.section}</p>
        <label className="block max-w-md text-sm font-medium">Find a classmate
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3" placeholder="Search by name or roll number" />
        </label>
        {students.length ? <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-3" scope="col">Roll</th><th scope="col">Full name</th><th className="sr-only" scope="col">Chat</th></tr></thead>
            <tbody>{students.map(student => <tr key={student.id} className="border-t border-border">
              <td className="p-3">{student.roll_number}</td><td className="pr-2">{name(student)}</td>
              <td className="p-2 text-right">{student.can_chat ? <Button variant="secondary" aria-label={'Chat with ' + name(student)} onClick={() => setPeer(student)}>Chat</Button>
                : <span className="text-xs text-text-muted">Unavailable</span>}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p>{query ? 'No matching classmates.' : 'No classmates listed yet.'}</p>}
      </>}
  </section>;
}
