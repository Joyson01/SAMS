import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { ClassSection } from '../../types/subject';
import { formatApiErrorMessage } from '../../utils/apiError';
import { Button } from '../../components/ui';

interface Assignments {
  class_ids: string[];
}

export function TeacherClasses({ teacherId }: { teacherId: string }) {
  const [classes, setClasses] = useState<ClassSection[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const path = `/teacher-assignments/${teacherId}`;

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      apiClient.get<ClassSection[]>('/classes', options),
      apiClient.get<Assignments>(path, options),
    ]).then(([classResponse, assignmentResponse]) => {
      setClasses(classResponse.data);
      setSelected(assignmentResponse.data.class_ids);
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setError(formatApiErrorMessage(err, 'Unable to load class assignments.'));
      }
    });
    return () => controller.abort();
  }, [path]);

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data } = await apiClient.put<Assignments>(path, { class_ids: selected });
      setSelected(data.class_ids);
      setMessage('Class assignments saved.');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Unable to save class assignments.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3 border-t border-border pt-5" onSubmit={(event) => {
      event.preventDefault();
      void save();
    }}>
      <h3 className="font-semibold">Assigned classes</h3>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {classes === null && !error && <p role="status">Loading classes…</p>}
      {classes?.length === 0 && <p className="text-sm text-text-muted">Create a class before assigning teachers.</p>}
      {!!classes?.length && (
        <>
          <fieldset className="max-h-52 overflow-auto" disabled={saving}>
            <legend className="sr-only">Select classes</legend>
            {classes.map((item) => (
              <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) => checked ? [...previous, item.id] : previous.filter((id) => id !== item.id));
                  setMessage('');
                }} />
                {item.name} · {item.department}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save classes'}</Button>
        </>
      )}
    </form>
  );
}
