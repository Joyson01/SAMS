import { FormEvent, useEffect, useState } from 'react';
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

function AssignmentWork({ post, staff }: {post: Post; staff: boolean}) {
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
      <label>Your answer<textarea name="answer" required maxLength={6000} className="block w-full rounded-lg border p-2" /></label>
      <button disabled={busy} className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-white">{busy ? 'Submitting…' : 'Turn in final answer'}</button>
    </form>}
  </div>;
}

export default function ClassroomBoard() {
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

  const control = 'mt-1 w-full rounded-lg border bg-white p-2 text-slate-900';
  return <section className="space-y-4 rounded-xl border p-4" aria-label="Classroom">
    <h2 className="text-xl font-semibold">Classroom</h2>
    {board && !board.can_publish && <article className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-text-muted">Demo announcement</p>
      <h3 className="font-semibold">New semester will begin soon</h3>
    </article>}
    {error && <div role="alert">{error} <button type="button" className="underline" onClick={() => { setError(''); setReload(value => value + 1); }}>Refresh stream</button></div>}
    {!board && !error && <p role="status">Loading classroom…</p>}
    {board && board.classes.length === 0 && <p>{board.can_publish
      ? 'No active classes are available. Ask an administrator to register the class in Courses & Rooms → Classes & Sections and assign its teacher.'
      : 'Your roster has no matching active classroom. Ask your department to check your class and department.'}</p>}
    {board && board.classes.length > 0 && <>
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
      {!board.posts.length && <p>No posts yet.</p>}
      {board.posts.map(post => <article className="space-y-2 rounded-lg border p-4" key={post.id}>
        <div className="text-sm"><span className="capitalize">{post.kind}</span> · {board.classes.find(c => c.id === post.class_id)?.name}</div>
        <h3 className="break-words font-semibold">{post.title}</h3>
        <p className="text-sm">{post.author || 'Staff'} · {new Date(post.created_at).toLocaleDateString()}</p>
        <p className="whitespace-pre-wrap break-words">{post.body}</p>
        {post.due_date && <p>Due <time dateTime={post.due_date}>{new Date(post.due_date + 'T00:00:00').toLocaleDateString()}</time></p>}
        {post.classroom_url && <a href={post.classroom_url} className="inline-block underline" rel="noopener noreferrer" target="_blank">Open in Google Classroom</a>}
        {post.kind === 'assignment' && <AssignmentWork post={post} staff={board.can_publish} />}
      </article>)}
    </>}
  </section>;
}
