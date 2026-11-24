import { CalendarDays } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { formatCalendarDate } from '../../utils/formatDate';

export function AttendanceDateInput({ label, value, onChange, optional = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  const [draft, setDraft] = useState(() => formatCalendarDate(value));
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();

  useEffect(() => {
    setDraft(formatCalendarDate(value));
    setInvalid(false);
  }, [value]);

  function apply() {
    if (optional && !draft.trim()) {
      onChange('');
      setDraft('');
      return;
    }
    const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(draft.trim());
    if (date) {
      const iso = `${date[3]}-${date[2]}-${date[1]}`;
      const parsed = new Date(iso + 'T00:00:00Z');
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso) {
        onChange(iso);
        setDraft(formatCalendarDate(iso));
        return;
      }
    }
    setInvalid(true);
  }

  const fieldId = useId();
  return <div className="text-sm font-medium">
    <label htmlFor={fieldId}>{label}</label>
    <div className="mt-1 flex min-h-11 overflow-hidden rounded-lg border border-border bg-surface">
    <input id={fieldId} type="text" placeholder="DD/MM/YYYY" value={draft}
      aria-invalid={invalid} aria-describedby={hintId}
      className="min-w-0 flex-1 bg-transparent px-3 tabular-nums"
      onChange={event => { setDraft(event.target.value); setInvalid(false); }}
      onBlur={apply} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
      <div className="relative grid w-11 shrink-0 place-items-center border-l border-border text-primary focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary">
        <CalendarDays size={17} aria-hidden="true" />
        <input type="date" aria-label={`Open calendar for ${label.toLowerCase()}`} value={value}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          onClick={event => {
            try { event.currentTarget.showPicker?.(); } catch { /* The native control can open its own picker. */ }
          }}
          onChange={event => {
            const next = event.target.value;
            if (!next && !optional) return;
            setDraft(formatCalendarDate(next));
            setInvalid(false);
            onChange(next);
          }} />
      </div>
    </div>
    <span id={hintId} className={invalid ? 'mt-1 block text-xs text-danger' : 'sr-only'}>
      {invalid ? 'Enter a valid date as DD/MM/YYYY.' : 'Use DD/MM/YYYY.'}
    </span>
  </div>;
}
