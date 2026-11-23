import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

interface Entry {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  label: string;
  room: string | null;
}
interface Schedule {
  class_name: string;
  batch: string | null;
  entries: Entry[];
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StudentTimetable() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    apiClient.get<Schedule>('/student-portal/timetable', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setSchedule(data); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(formatApiErrorMessage(reason, 'Unable to load your timetable.'));
      });
    return () => controller.abort();
  }, [attempt]);

  const days = new Set([...weekdays, ...schedule?.entries.map(entry => entry.day_of_week) ?? []]);
  return <section className="mx-auto max-w-4xl space-y-4">
    <h1 className="text-2xl font-semibold">My Timetable</h1>
    {error ? <div role="alert">{error} <button className="min-h-11 underline" onClick={() => setAttempt(a => a + 1)}>Retry</button></div>
      : !schedule ? <p role="status">Loading your timetable…</p>
      : <>
        <p>{schedule.class_name} · {schedule.batch ? 'Batch ' + schedule.batch : 'Whole-class sessions only'}</p>
        {!schedule.entries.length && <p>No timetable entries have been published for your schedule yet.</p>}
        {Array.from(days, day => {
          const entries = schedule.entries.filter(entry => entry.day_of_week === day);
          return entries.length > 0 && <section key={day} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="font-semibold">{day}</h2>
            <ul className="divide-y divide-border">{entries.map(entry =>
              <li key={entry.id} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr_auto]">
                <span className="tabular-nums">{entry.start_time} – {entry.end_time}</span>
                <span>{entry.label}</span>{entry.room && <span>{entry.room}</span>}
              </li>)}</ul>
          </section>;
        })}
      </>}
  </section>;
}
