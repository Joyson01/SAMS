import { FormEvent, useEffect, useState } from 'react';
import { useDialogFeedback } from '../../components/common/useDialogFeedback';
import { Button } from '../../components/ui';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

type Item = { id: string; name: string };
type Directory = { classes: Item[]; subjects: Item[] };
const field = 'mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3';

export function AcademicTools() {
  const [directory, setDirectory] = useState<Directory>();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setError('');
    Promise.all([apiClient.get<Item[]>('/classes', options), apiClient.get<Item[]>('/subjects', options)])
      .then(([classes, subjects]) => {
        setDirectory({ classes: classes.data, subjects: subjects.data });
        setSelected(previous => classes.data.some(item => item.id === previous) ? previous : classes.data[0]?.id || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(formatApiErrorMessage(reason, 'Could not load classes and subjects.'));
      });
    return () => controller.abort();
  }, [attempt]);

  return <section className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Lab batches &amp; class subjects</h2>
      <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Refresh classes</Button>
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!directory && !error && <p role="status">Loading classes…</p>}
    {directory && (directory.classes.length ? <>
      <label className="block">Class<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>
        {directory.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
      </select></label>
      {selected && <ClassMappings key={selected} classId={selected} subjects={directory.subjects} />}
    </> : <p>Create a class in Classes &amp; Sections to manage its batches and subjects.</p>)}
  </section>;
}

function ClassMappings({ classId, subjects }: { classId: string; subjects: Item[] }) {
  const { confirmAction, feedback } = useDialogFeedback();
  const [batches, setBatches] = useState<Item[]>();
  const [assigned, setAssigned] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const base = '/classes/' + classId;

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setError('');
    Promise.all([apiClient.get<Item[]>(base + '/batches', options), apiClient.get<Item[]>(base + '/subjects', options)])
      .then(([batchList, subjectList]) => {
        setBatches(batchList.data);
        setAssigned(subjectList.data.map(subject => subject.id));
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(formatApiErrorMessage(reason, 'Could not load this class.'));
      });
    return () => controller.abort();
  }, [base, attempt]);

  async function save(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
    } catch (reason) {
      setError(formatApiErrorMessage(reason, 'Unable to save changes.'));
    } finally {
      setBusy(false);
    }
  }

  function saveBatch(event: FormEvent) {
    event.preventDefault();
    const payload = { name: name.trim() };
    void save(async () => {
      const response = editing
        ? await apiClient.put<Item>(base + '/batches/' + editing, payload)
        : await apiClient.post<Item>(base + '/batches', payload);
      setBatches(items => [...(items || []).filter(item => item.id !== response.data.id), response.data]
        .sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setEditing('');
    }, editing ? 'Batch updated.' : 'Batch added.');
  }

  async function deleteBatch(batch: Item) {
    if (!await confirmAction('Delete batch ' + batch.name + '?')) return;
    void save(async () => {
      await apiClient.delete(base + '/batches/' + batch.id);
      setBatches(items => items?.filter(item => item.id !== batch.id));
      if (editing === batch.id) { setEditing(''); setName(''); }
    }, 'Batch deleted.');
  }

  const visible = batches?.filter(batch => batch.name.toLowerCase().includes(search.trim().toLowerCase())) || [];
  return <div className="space-y-4">
    {feedback}
    {error && <p role="alert" className="text-danger">{error} {!batches &&
      <button className="underline" onClick={() => setAttempt(value => value + 1)}>Retry</button>}</p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!batches ? !error && <p role="status">Loading batches and subjects…</p> : <>
      <form className="flex flex-wrap items-end gap-3" onSubmit={saveBatch}>
        <label>Batch name<input className={field} required maxLength={32} value={name} onChange={e => setName(e.target.value)} /></label>
        <Button type="submit" disabled={busy || !name.trim()}>{editing ? 'Save batch' : 'Add batch'}</Button>
        {editing && <Button variant="secondary" onClick={() => { setEditing(''); setName(''); }}>Cancel</Button>}
      </form>
      {batches.length > 0 && <label className="block">Find a batch<input type="search" className={field}
        value={search} onChange={e => setSearch(e.target.value)} /></label>}
      {visible.length ? <ul>{visible.map(batch => <li key={batch.id} className="flex items-center gap-2 border-b py-2">
        <span className="flex-1">{batch.name}</span>
        <Button variant="secondary" disabled={busy} onClick={() => { setEditing(batch.id); setName(batch.name); }}>Edit</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void deleteBatch(batch)}>Delete</Button>
      </li>)}</ul> : <p>{batches.length ? 'No matching batch.' : 'No lab batches yet.'}</p>}
      <fieldset className="space-y-1" disabled={busy}>
        <legend className="font-semibold">Assigned subjects</legend>
        {subjects.map(subject => <label key={subject.id} className="mr-4 inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={assigned.includes(subject.id)} onChange={e => setAssigned(
            e.target.checked ? [...assigned, subject.id] : assigned.filter(id => id !== subject.id)
          )} />{subject.name}
        </label>)}
      </fieldset>
      {subjects.length ? <Button disabled={busy} onClick={() => void save(async () => {
        await apiClient.put(base, { assigned_subject_ids: assigned });
      }, 'Assigned subjects saved.')}>Save subject mapping</Button> : <p>Add a course to assign subjects.</p>}
    </>}
  </div>;
}
