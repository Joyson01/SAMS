import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { formatApiErrorMessage } from '../utils/apiError';

interface Directory {
  department: string;
  class_name: string;
  section: string;
  names: string[];
}

export function Classmates() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
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

  const names = directory?.names.filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || [];
  return <section className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-semibold">Classmates</h1>
    {error ? <div role="alert">{error} <button className="min-h-11 px-3 underline" onClick={() => setAttempt(attempt + 1)}>Retry</button></div>
      : !directory ? <p role="status">Loading your class…</p>
      : <>
        <p>{directory.department} · {directory.class_name} · Section {directory.section}</p>
        <label className="block max-w-md text-sm font-medium">Find a classmate
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3" placeholder="Search by name" />
        </label>
        <p role="status" className="text-sm text-text-muted">{names.length} of {directory.names.length} classmates</p>
        {names.length ? <ul className="grid gap-x-6 rounded-xl border border-border bg-surface px-5 sm:grid-cols-2">
          {names.map((name, index) => <li key={index} className="border-b border-border py-3">{name}</li>)}
        </ul> : <p>{directory.names.length ? 'No names match your search.' : 'No other active students are listed in your division yet.'}</p>}
      </>}
  </section>;
}
