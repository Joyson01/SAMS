import { FormEvent, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { formatApiErrorMessage } from '../utils/apiError';

type Kind = 'announcement' | 'assignment' | 'material';
type Post = {
  id: string; class_id: string; kind: Kind; title: string; body: string;
  due_date: string | null; classroom_url: string | null; author: string | null; created_at: string;
};
type Board = { classes: { id: string; name: string }[]; posts: Post[]; can_publish: boolean };

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
      </article>)}
    </>}
  </section>;
}
