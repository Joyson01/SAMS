import { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
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
  const [selectedDay, setSelectedDay] = useState('');
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

  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date());
  const scheduledDays = new Set(schedule?.entries.map(entry => entry.day_of_week));
  const days = [...new Set([...weekdays.slice(0, 5), ...weekdays.slice(5).filter(day => scheduledDays.has(day) || day === today), ...scheduledDays])];
  const day = selectedDay || today;
  const entries = schedule?.entries.filter(entry => entry.day_of_week === day) ?? [];

  return <section className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-3xl bg-[#102920] p-5 text-white sm:p-7">
      <CalendarDays size={25} className="text-emerald-200" aria-hidden="true" />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">My timetable</h1>
      {schedule && <p className="mt-2 text-sm text-emerald-100">{schedule.class_name} · {schedule.batch ? 'Batch ' + schedule.batch : 'All class periods and lab options'}</p>}
    </header>
    {error ? <div role="alert" className="rounded-2xl border border-border bg-surface p-5">{error} <button className="min-h-11 underline" onClick={() => setAttempt(a => a + 1)}>Retry</button></div>
      : !schedule ? <p role="status" className="rounded-2xl border border-border bg-surface p-5">Loading your timetable…</p>
      : <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        {!schedule.batch && <p className="mb-3 text-sm text-text-muted">Your lab batch is unassigned. Follow the practical slots for the batch confirmed by your college.</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a day">
          {days.map(value => <button key={value} type="button" aria-label={value === today ? value + ', today' : value}
            aria-pressed={day === value} onClick={() => setSelectedDay(value)}
            className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${day === value ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-muted hover:text-text'}`}>
            {value.slice(0, 3)}
          </button>)}
        </div>
        <h2 className="mt-5 font-semibold">{day}{day === today && <span className="ml-2 text-sm font-normal text-text-muted">Today</span>}</h2>
        {entries.length ? <ul className="mt-3 space-y-2">{entries.map(entry =>
          <li key={entry.id} className="grid gap-1 rounded-xl border border-border bg-surface-muted/50 p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3">
            <span className="text-sm font-medium tabular-nums text-primary">{entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)}</span>
            <span className="min-w-0 break-words font-medium">{entry.label}</span>
            {entry.room && <span className="flex items-center gap-1.5 text-sm text-text-muted"><MapPin size={15} aria-hidden="true" />{entry.room}</span>}
          </li>)}</ul> : <p className="mt-2 text-sm text-text-muted">{schedule.entries.length ? 'No classes scheduled for this day.' : 'No classes have been published for your timetable yet.'}</p>}
      </section>}
  </section>;
}
