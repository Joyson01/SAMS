import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

interface DepartmentOverview {
  department: string;
  classes: number;
  active_students: number;
  active_sessions: number;
}

export function DepartmentPage() {
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<DepartmentOverview>('/department/overview', { signal: controller.signal })
      .then(({ data }) => setOverview(data))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(formatApiErrorMessage(err, 'Could not load your department.'));
        }
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">{overview?.department || 'Department overview'}</h1>
      {error ? (
        <div className="space-y-3">
          <p role="alert">{error}</p>
          <button className="min-h-11 rounded-lg border border-border px-4" onClick={() => {
            setError('');
            setAttempt(attempt + 1);
          }}>Try again</button>
        </div>
      ) : !overview ? (
        <p role="status">Loading department…</p>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-3">
          {([
            ['Classes', overview.classes],
            ['Active students', overview.active_students],
            ['Active attendance sessions', overview.active_sessions],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-5">
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd className="mt-2 text-3xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
