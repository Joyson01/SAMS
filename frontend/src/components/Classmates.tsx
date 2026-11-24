import { StudentAvatar } from './ui/StudentAvatar';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import { formatApiErrorMessage } from '../utils/apiError';
import { ArrowLeft, BookOpen, ClipboardList, FileText, MessageCircle, Paperclip, Search, Send } from 'lucide-react';
import ClassroomBoard from './ClassroomBoard';
import { Button } from './ui';

type Peer = { id: string; roll_number: string; first_name: string; last_name: string; can_chat: boolean; avatar_url?: string | null };
type Directory = { department: string; class_name: string; section: string; students: Peer[] };
type InboxItem = { peer_id: string; body: string; filename?: string };
const sections = [
  { id: 'stream', label: 'Class feed', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'notes', label: 'Notes', icon: FileText },
] as const;
type Section = typeof sections[number]['id'];
type Message = { id: string; body: string; mine: boolean; created_at: string; filename?: string; author?: string };
const name = (peer: Peer) => peer.first_name + ' ' + peer.last_name;

function Chat({ title, conversation, peer, close }: { title: string; conversation: string; peer?: Peer; close: () => void }) {
  const group = !peer;
  const [messages, setMessages] = useState<Message[]>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const attachmentInput = useRef<HTMLInputElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [sending, setSending] = useState(false);
  const [revision, refresh] = useState(0);
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

  useEffect(() => {
    if (followLatest.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    }
  }, [messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setActionError('');
    try {
      const { data } = await apiClient.post<Message>(path, { body: draft });
      followLatest.current = true;
      setMessages(previous => [...(previous || []).filter(message => message.id !== data.id), data]);
      setDraft('');
      refresh(value => value + 1);
    } catch (reason) {
      setActionError(formatApiErrorMessage(reason, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File) {
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setActionError('Choose a nonempty file up to 10 MB.');
      return;
    }
    setSending(true);
    setActionError('');
    const form = new FormData();
    form.append('file', file);
    try {
      await apiClient.post(conversation + '/attachments', form);
      followLatest.current = true;
      refresh(value => value + 1);
    } catch (reason) {
      setActionError(formatApiErrorMessage(reason, 'Could not send the file.'));
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
      setActionError(formatApiErrorMessage(reason, 'Could not download the file.'));
    }
  }

  return <section className="flex min-w-0 flex-col" aria-label={group ? 'Class group chat' : 'Private conversation'}>
    <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
      <Button variant="secondary" className="min-h-11 md:hidden" aria-label="Back to messages" onClick={close}><ArrowLeft size={18} /></Button>
      {group ? <Initials label={title} /> : <StudentAvatar name={title} avatarUrl={peer?.avatar_url} size="lg" />}
      <div className="min-w-0">
        <h2 className="truncate font-semibold">{title}</h2>
        <p className="text-sm text-text-muted">{peer ? 'Private chat · Roll ' + peer.roll_number : 'Visible to everyone in your class'}</p>
      </div>
    </header>
    {error && <div role="alert" className="px-4 py-2 text-sm text-danger">{error} <button className="underline" onClick={() => refresh(value => value + 1)}>Retry</button></div>}
    <div ref={transcript} role="log" aria-label="Messages"
      onScroll={event => {
        const panel = event.currentTarget;
        followLatest.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
      }}
      className="h-[clamp(17rem,48dvh,35rem)] space-y-3 overflow-y-auto bg-surface-muted px-4 py-5">
      {!messages ? !error && <p role="status" className="text-text-muted">Loading messages…</p> : !messages.length &&
        <p className="py-10 text-center text-sm text-text-muted">{group ? 'No group messages yet. Send the first message to your class.' : 'Start a conversation or share a file using the attachment button.'}</p>}
      {messages?.map(message => <article key={message.id}
        className={`w-fit max-w-[88%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${message.mine ? 'ml-auto rounded-br-sm border border-primary/30 bg-primary/10' : 'rounded-bl-sm border border-border bg-surface'}`}>
        <span className={group && !message.mine ? "mb-1 block text-xs font-semibold text-primary" : "sr-only"}>{message.mine ? "You" : message.author || title}</span>
        {message.filename ? <Button variant="secondary" className="min-h-11 max-w-full whitespace-normal text-left" onClick={() => void download(message)}>
          <FileText size={18} className="shrink-0" /><span className="min-w-0 break-all">{message.filename}</span><span className="sr-only">Download file</span>
        </Button> : <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        <time className="mt-1 block text-right text-xs text-text-muted" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
      </article>)}
    </div>
    <form onSubmit={send} className="border-t border-border bg-surface p-3">
      {actionError && <p role="alert" className="mb-2 text-sm text-danger">{actionError}</p>}
      <div className="flex items-end gap-2">
        {!group && <><input ref={attachmentInput} hidden type="file" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void attach(file);
        }} />
        <Button type="button" variant="secondary" className="min-h-11 shrink-0" aria-label="Attach notes or a file up to 10 MB"
          title="Attach notes or a file up to 10 MB" disabled={sending} onClick={() => attachmentInput.current?.click()}><Paperclip size={18} /></Button></>}
        <label className="min-w-0 flex-1"><span className="sr-only">Message</span>
          <textarea rows={1} className="block min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3 py-2.5"
            placeholder="Write a message" maxLength={2000} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} />
        </label>
        <Button type="submit" className="min-h-11 shrink-0" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={18} /></Button>
      </div>
      {sending && <p role="status" className="mt-2 text-sm text-text-muted">Sending…</p>}
    </form>
  </section>;
}

function Initials({ label }: { label: string }) {
  return <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
    {label.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
  </span>;
}

export function Classmates({ selection, onSelectionHandled }: {
  selection?: { peerId: string }; onSelectionHandled?: () => void;
}) {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>();
  const [groupError, setGroupError] = useState('');
  const [groupAttempt, retryGroups] = useState(0);
  const [group, setGroup] = useState<{ id: string; name: string }>();
  const [inbox, setInbox] = useState<InboxItem[]>([]);
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
    if (groups) return;
    const controller = new AbortController();
    setGroupError('');
    apiClient.get<{ classes: { id: string; name: string }[] }>('/classroom', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setGroups(data.classes); })
      .catch(reason => {
        if (!controller.signal.aborted) setGroupError(formatApiErrorMessage(reason, 'Unable to load class groups.'));
      });
    return () => controller.abort();
  }, [groups, groupAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function loadInbox() {
      try {
        const { data } = await apiClient.get<InboxItem[]>('/student-portal/classmates/inbox', { signal: controller.signal });
        if (!controller.signal.aborted) setInbox(data);
      } catch {
        // The classmate directory can still be used when previews are unavailable.
      }
      if (!controller.signal.aborted) timer = window.setTimeout(loadInbox, 10000);
    }
    void loadInbox();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!selection || !directory) return;
    setGroup(undefined);
    setPeer(directory.students.find(student => student.id === selection.peerId && student.can_chat));
    onSelectionHandled?.();
  }, [selection, directory, onSelectionHandled]);

  const previews = new Map<string, InboxItem>();
  for (const message of inbox) if (!previews.has(message.peer_id)) previews.set(message.peer_id, message);
  const recent = [...previews.keys()];
  const students = (directory?.students ?? []).filter(student =>
    (student.roll_number + ' ' + name(student)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(previews.has(b.id)) - Number(previews.has(a.id)) ||
      (previews.has(a.id) && previews.has(b.id) ? recent.indexOf(a.id) - recent.indexOf(b.id) : 0));
  return <section className="mx-auto max-w-6xl space-y-4">
    <header className="rounded-3xl bg-[#102920] p-5 text-white sm:p-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Messages</h1>
      {directory && <p className="mt-2 text-sm text-emerald-100">{directory.class_name} · Section {directory.section}</p>}
    </header>
    <div className="grid min-w-0 overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside aria-label="Conversations" className={`min-w-0 border-border md:block md:border-r ${peer || group ? 'hidden' : ''}`}>
        <div className="space-y-3 p-3">
          <h2 className="px-2 text-sm font-semibold">Class groups</h2>
          {groupError ? <p role="alert" className="text-sm">{groupError} <button className="underline" onClick={() => retryGroups(n => n + 1)}>Retry</button></p>
            : !groups ? <p role="status" className="px-2 text-sm text-text-muted">Loading class groups…</p>
            : !groups.length ? <p className="px-2 text-sm text-text-muted">No class group available.</p>
            : groups.map(item => <button type="button" key={item.id} aria-pressed={group?.id === item.id}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-primary/10 px-3 text-left text-sm font-semibold text-primary"
                onClick={() => { setPeer(undefined); setGroup(item); }}>
                <MessageCircle size={18} aria-hidden="true" />{item.name} group chat
              </button>)}
          <h2 className="px-2 pt-2 text-sm font-semibold">Private messages</h2>
          <label className="relative block"><span className="sr-only">Find a classmate</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-text-muted" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-surface-muted pl-9 pr-2 text-sm" placeholder="Search classmates" />
          </label>
        </div>
        <div className="border-t border-border px-3 py-2">
          {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Retry</Button></div>
            : !directory ? <p role="status" className="px-2 py-3 text-sm text-text-muted">Loading classmates…</p>
            : !students.length ? <p className="px-2 py-3 text-sm text-text-muted">{query ? 'No matching classmates.' : 'No classmates listed yet.'}</p>
            : <ul className="max-h-52 overflow-y-auto md:max-h-[28rem]">
              {students.map(student => <li key={student.id}>
                <button type="button" disabled={!student.can_chat} aria-pressed={peer?.id === student.id} onClick={() => { setGroup(undefined); setPeer(student); }}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-muted disabled:opacity-65 ${peer?.id === student.id ? 'bg-primary/10' : ''}`}>
                  <StudentAvatar name={name(student)} avatarUrl={student.avatar_url} size="lg" />
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{name(student)}</strong>
                    <span className="block truncate text-xs text-text-muted">{previews.get(student.id)?.filename
                      ? 'File · ' + previews.get(student.id)?.filename : previews.get(student.id)?.body || `Roll ${student.roll_number}${student.can_chat ? '' : ' · Chat unavailable'}`}</span></span>
                  {student.can_chat && <MessageCircle size={15} aria-hidden="true" className="shrink-0 text-text-muted" />}
                </button>
              </li>)}
            </ul>}
        </div>
      </aside>
      {group ? <Chat key={group.id} title={group.name + ' group chat'} conversation={'/classroom/' + group.id} close={() => setGroup(undefined)} />
        : peer ? <Chat key={peer.id} title={name(peer)} conversation={'/student-portal/classmates/' + peer.id} peer={peer} close={() => setPeer(undefined)} />
        : <div className="grid min-h-40 place-content-center gap-2 border-t border-border p-6 text-center md:border-t-0">
          <MessageCircle size={26} className="mx-auto text-primary" aria-hidden="true" />
          <p className="font-semibold">Choose a conversation</p>
          <p className="text-sm text-text-muted">Open a class group or message a classmate.</p>
        </div>}
    </div>
  </section>;
}

export function ClassSpace() {
  const [section, setSection] = useState<Section>('stream');
  return <section className="mx-auto max-w-6xl space-y-4">
    <header className="rounded-3xl bg-[#102920] p-5 text-white sm:p-7">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Class Space</h1>
    </header>
    <nav aria-label="Class Space" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1.5">
      {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
        onClick={() => setSection(id)}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold ${section === id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-muted hover:text-text'}`}>
        <Icon size={17} aria-hidden="true" />{label}
      </button>)}
    </nav>
    <div className="rounded-2xl border border-border bg-surface">
      <ClassroomBoard embedded view={section} onNoteShared={() => setSection('notes')} />
    </div>
  </section>;
}
