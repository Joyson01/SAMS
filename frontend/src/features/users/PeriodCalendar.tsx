import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AttendanceDateInput } from './AttendanceDateInput';
import { formatCalendarDate } from '../../utils/formatDate';
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

  const periodHours = [...hours].sort((a, b) => a - b);

  function renderRecord(record: PeriodRecord) {
    const status = record.status.replace(/^MANUAL_/, '');
    const color = status === 'PRESENT' ? 'bg-green-100 text-green-900'
      : status === 'ABSENT' ? 'bg-red-100 text-red-900' : 'bg-yellow-100 text-yellow-900';
    return <div key={record.id} className={'min-w-0 break-words rounded px-2 py-1 text-xs leading-snug ' + color}>
      <strong className="block">{record.subject}</strong>
      <span className="block">{record.start_time.slice(0, 5)}–{record.end_time.slice(0, 5)}</span>
      {status.replace(/_/g, ' ')}
    </div>;
  }

  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
      <div>
        <h2 className="font-semibold">Period-wise attendance</h2>
        <p className="text-xs text-text-muted">{formatCalendarDate(dateKey(week))} – {formatCalendarDate(dateKey(days[6]))}</p>
      </div>
      <div className="flex items-end gap-1">
        <button aria-label="Previous week" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-surface-muted" onClick={() => setWeek(shift(week, -7))}><ChevronLeft size={19} aria-hidden="true" /></button>
        <div className="w-40"><AttendanceDateInput label="Jump to date" value={dateKey(week)}
          onChange={value => setWeek(weekStart(new Date(value + 'T12:00:00')))} /></div>
        <button aria-label="Next week" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-surface-muted" onClick={() => setWeek(shift(week, 7))}><ChevronRight size={19} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Weekly attendance grid">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-24 bg-surface-muted px-2 py-2">Day</th>
            {periodHours.map(hour => <th key={hour} scope="col" className="whitespace-nowrap border-l border-border px-2 py-2 tabular-nums">
              {clock(hour)}–{clock(hour + 1)}
            </th>)}
          </tr>
        </thead>
        <tbody>{days.map(day => {
          const key = dateKey(day);
          return <tr key={key} className="border-t border-border align-top">
            <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 font-semibold">
              {day.toLocaleDateString('en-GB', { weekday: 'short' })}
              <time dateTime={key} className="block whitespace-nowrap font-normal text-text-muted">{formatCalendarDate(key)}</time>
            </th>
            {periodHours.map(hour => <td key={hour} className="space-y-1 border-l border-border p-1">
              {slots.get(key + '/' + hour)?.map(renderRecord)}
            </td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
