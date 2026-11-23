import { useState } from 'react';

export type PeriodRecord = {
  id: string;
  date: string;
  subject: string;
  status: string;
  start_time: string;
  end_time: string;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shift = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const weekStart = (date: Date) => shift(date, -((date.getDay() + 6) % 7));
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function PeriodCalendar({ records }: { records: PeriodRecord[] }) {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const days = Array.from({ length: 7 }, (_, day) => shift(week, day));
  const slots = new Map<string, PeriodRecord[]>();
  const hours = new Set(Array.from({ length: 8 }, (_, index) => index + 9));
  for (const record of records) {
    if (record.date < dateKey(week) || record.date > dateKey(days[6])) continue;
    const hour = Number(record.start_time?.split(':')[0]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    hours.add(hour);
    const key = record.date + '/' + hour;
    const entries = slots.get(key) || [];
    entries.push(record);
    slots.set(key, entries);
  }

  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h2 className="font-semibold">Period-wise attendance</h2>
    <div className="flex flex-wrap items-center gap-3">
      <button className="min-h-11 rounded border px-3" onClick={() => setWeek(shift(week, -7))}>Previous week</button>
      <label>Week of <input className="min-h-11 rounded border bg-surface px-2" type="date" value={dateKey(week)}
        onChange={event => { if (event.target.value) setWeek(weekStart(new Date(event.target.value + 'T12:00:00'))); }} /></label>
      <button className="min-h-11 rounded border px-3" onClick={() => setWeek(shift(week, 7))}>Next week</button>
    </div>
    <p className="text-sm text-text-muted">Green means present, red means absent, and yellow shows other marks. A dash means no recorded mark.</p>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Weekly attendance grid">
      <table className="w-full min-w-[850px] table-fixed text-left text-sm">
        <thead><tr><th scope="col" className="w-28 p-2">Period</th>{days.map(day =>
          <th key={dateKey(day)} scope="col" className="p-2">{day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</th>
        )}</tr></thead>
        <tbody>{[...hours].sort((a, b) => a - b).map(hour => <tr key={hour} className="border-t border-border align-top">
          <th scope="row" className="p-2">{clock(hour)}–{clock(hour + 1)}</th>
          {days.map(day => <td key={dateKey(day)} className="space-y-1 p-1">
            {slots.get(dateKey(day) + '/' + hour)?.map(record => {
              const status = record.status.replace(/^MANUAL_/, '');
              const color = status === 'PRESENT' ? 'bg-green-100 text-green-900'
                : status === 'ABSENT' ? 'bg-red-100 text-red-900' : 'bg-yellow-100 text-yellow-900';
              return <div key={record.id} className={'break-words rounded p-2 ' + color}>
                <strong className="block">{record.subject}</strong>
                <span className="block">{record.start_time.slice(0, 5)}–{record.end_time.slice(0, 5)}</span>
                {status.replace(/_/g, ' ')}
              </div>;
            }) || <span className="p-1 text-text-muted">—</span>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
