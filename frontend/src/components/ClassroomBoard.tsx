import { FormEvent, useEffect, useState } from 'react';
import { Bell, ClipboardList, FileText, ExternalLink } from 'lucide-react';
import { apiClient } from '../services/api';
import { formatApiErrorMessage } from '../utils/apiError';

type Kind = 'announcement' | 'assignment' | 'material';
type Submission = { answer: string; submitted_at: string };
type Reviewed = Submission & { student_id: string; student_name: string; roll_number: string };
type Post = {
  my_submission: Submission | null;
  id: string; class_id: string; kind: Kind; title: string; body: string;
  due_date: string | null; classroom_url: string | null; author: string | null; created_at: string;
};
type Board = { classes: { id: string; name: string }[]; posts: Post[]; can_publish: boolean };

function AssignmentWork({ post, staff, onSubmitted }: {post: Post; staff: boolean; onSubmitted: () => void}) {
  const [own, setOwn] = useState(post.my_submission);
  const [reviews, setReviews] = useState<Reviewed[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = new FormData(event.currentTarget).get('answer');
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.put<Submission>(`/classroom/${post.id}/submission`, {answer});
      setOwn(response.data);
      onSubmitted();
    } catch (err) { setError(formatApiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function review() {
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.get<Reviewed[]>(`/classroom/${post.id}/submissions`);
      setReviews(response.data);
    } catch (err) { setError(formatApiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  const submitted = own ?? post.my_submission;
  return <div className="space-y-2">
    {error && <p role="alert">{error}</p>}
    {staff ? <>
      <button className="underline" disabled={busy} onClick={review}>{reviews ? 'Refresh submissions' : 'Review submissions'}</button>
      {reviews && (reviews.length ? <ul>{reviews.map(row => <li key={row.student_id} className="border-t py-2">
        <strong>{row.student_name} · Roll {row.roll_number}</strong> · {new Date(row.submitted_at).toLocaleString()}
        <p className="whitespace-pre-wrap break-words">{row.answer}</p>
      </li>)}</ul> : <p>No submissions yet.</p>)}
    </> : submitted ? <div>
      <p role="status">Turned in on {new Date(submitted.submitted_at).toLocaleString()}</p>
      <p className="whitespace-pre-wrap break-words">{submitted.answer}</p>
    </div> : <form onSubmit={submit}>
      <label>Your answer<textarea name="answer" required maxLength={6000} className="block w-full min-w-0 max-w-full resize-y rounded-lg border p-2" /></label>
      <button disabled={busy} className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-white">{busy ? 'Submitting…' : 'Turn in final answer'}</button>
    </form>}
  </div>;
}

const postTypes = {
  announcement: { label: 'Announcement', icon: Bell },
  assignment: { label: 'Assignment', icon: ClipboardList },
  material: { label: 'Note', icon: FileText },
};

export default function ClassroomBoard({ embedded = false, view = 'stream', onNoteShared }: {
  embedded?: boolean; view?: 'stream' | 'assignments' | 'notes'; onNoteShared?: () => void;
}) {
  const [assignmentStatus, setAssignmentStatus] = useState<'all' | 'todo' | 'submitted'>('all');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteNotice, setNoteNotice] = useState(false);
  const [board, setBoard] = useState<Board>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Kind>('announcement');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<Board>('/classroom', { signal: controller.signal })
      .then(({ data }) => setBoard(data))
      .catch(err => { if (!controller.signal.aborted) setError(formatApiErrorMessage(err)); });
    return () => controller.abort();
  }, [reload]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/classroom', {
        class_id: fields.get('class_id'), kind, title: fields.get('title'), body: fields.get('body'),
        classroom_url: fields.get('url') || null, due_date: fields.get('due') || null,
      });
      form.reset();
      setKind('announcement');
      setReload(value => value + 1);
    } catch (err) {
      setError(formatApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function shareNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/classroom/notes', {
        class_id: fields.get('class_id'), title: fields.get('title'), body: fields.get('body'),
      });
      form.reset();
      setNoteOpen(false);
      setNoteNotice(true);
      onNoteShared?.();
      setReload(value => value + 1);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Could not share your note.'));
    } finally {
      setBusy(false);
    }
  }

  const control = 'mt-1 min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-surface p-2 text-text';
  const posts = (board?.posts ?? []).filter(post => {
    if (!embedded || view === 'stream') return true;
    if (view === 'notes') return post.kind === 'material';
    return post.kind === 'assignment' && (assignmentStatus === 'all' || Boolean(post.my_submission) === (assignmentStatus === 'submitted'));
  });
  const heading = !embedded ? 'Classroom' : view === 'assignments' ? 'Assignments' : view === 'notes' ? 'Notes and resources' : 'Class feed';
  const assignmentFilters = [{ id: 'all', label: 'All' }, { id: 'todo', label: 'To do' }, { id: 'submitted', label: 'Turned in' }] as const;
  return <section className={embedded ? 'min-w-0 space-y-3 p-2.5 [overflow-wrap:anywhere] sm:space-y-4 sm:p-5' : 'space-y-4 rounded-xl border border-border p-4'} aria-label={heading}>
    <h2 className="text-lg font-semibold sm:text-xl">{heading}</h2>
    {embedded && view === 'assignments' && <div role="group" className="flex flex-wrap gap-2" aria-label="Filter assignments">
      {assignmentFilters.map(({ id, label }) => <button key={id} type="button" aria-pressed={assignmentStatus === id}
        onClick={() => setAssignmentStatus(id)}
        className={`min-h-11 rounded-full border px-3 text-sm font-medium ${assignmentStatus === id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface-muted text-text-muted hover:text-text'}`}>{label}</button>)}
    </div>}
    {noteNotice && view === 'notes' && <p role="status" className="text-sm text-success">Note shared with your class.</p>}
    {error && <div role="alert">{error} <button type="button" className="underline" onClick={() => { setError(''); setReload(value => value + 1); }}>Refresh stream</button></div>}
    {!board && !error && <p role="status">Loading classroom…</p>}
    {board && board.classes.length === 0 && <p>{board.can_publish
      ? 'No active classes are available. Ask an administrator to register the class in Courses & Rooms → Classes & Sections and assign its teacher.'
      : 'Your roster has no matching active classroom. Ask your department to check your class and department.'}</p>}
    {board && board.classes.length > 0 && <>
      {embedded && view === 'notes' && !board.can_publish && <details open={noteOpen} onToggle={event => setNoteOpen(event.currentTarget.open)} className="rounded-xl border border-border px-3 sm:px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Share notes with your class</summary>
        <form onSubmit={shareNote} className="grid min-w-0 gap-3 pb-4 [&>label]:min-w-0">
          <label>Class<select required className={control} name="class_id">{board.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Title<input className={control} name="title" required maxLength={160} /></label>
          <label>Notes<textarea className={control} name="body" required maxLength={6000} rows={3} /></label>
          <button disabled={busy} className="min-h-11 justify-self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{busy ? 'Sharing…' : 'Share with class'}</button>
        </form>
      </details>}
      {board.can_publish && <details>
        <summary className="cursor-pointer font-semibold">Create a post</summary>
        <form onSubmit={publish} className="mt-3 grid gap-3">
          <label>Class<select required className={control} name="class_id">{board.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Post type<select className={control} value={kind} onChange={e => setKind(e.target.value as Kind)}>
            <option value="announcement">Announcement</option><option value="assignment">Assignment</option><option value="material">Material</option>
          </select></label>
          <label>Title<input className={control} name="title" required maxLength={160}/></label>
          <label>Details<textarea className={control} name="body" required maxLength={6000} rows={3}/></label>
          {kind === 'assignment' && <label>Due date (optional)<input className={control} type="date" name="due"/></label>}
          <label>Google Classroom link (optional)<input className={control} type="url" name="url" placeholder="https://classroom.google.com/…" /></label>
          <button disabled={busy} className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-white">{busy ? 'Publishing…' : 'Publish'}</button>
        </form>
      </details>}
      {!posts.length && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-text-muted">{view === 'assignments' ? 'No assignments in this view.' : view === 'notes' ? 'No notes or resources yet. You can share the first note with your class.' : 'Class updates, assignments, and shared notes will appear here.'}</p>}
      {posts.map(post => {
        const { label, icon: PostIcon } = postTypes[post.kind];
        return <article className="min-w-0 space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3 sm:p-4" key={post.id}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-primary"><PostIcon size={17} aria-hidden="true" />{label}</span>
          {post.kind === 'assignment' && !board.can_publish && <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium">{post.my_submission ? 'Turned in' : 'To do'}</span>}
        </div>
        <h3 className="break-words font-semibold">{post.title}</h3>
        <p className="text-sm">{post.author || 'Staff'} · {new Date(post.created_at).toLocaleDateString()}{board.can_publish && " · " + (board.classes.find(c => c.id === post.class_id)?.name ?? "Class")}</p>
        <p className="whitespace-pre-wrap break-words">{post.body}</p>
        {post.due_date && <p>Due <time dateTime={post.due_date}>{new Date(post.due_date + 'T00:00:00').toLocaleDateString()}</time></p>}
        {post.classroom_url && <a href={post.classroom_url} className="inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-medium text-primary underline" rel="noopener noreferrer" target="_blank">Open in Google Classroom <ExternalLink size={15} className="shrink-0" aria-hidden="true" /></a>}
        {post.kind === 'assignment' && <AssignmentWork post={post} staff={board.can_publish} onSubmitted={() => setReload(value => value + 1)} />}
      </article>;
      })}
    </>}
  </section>;
}
