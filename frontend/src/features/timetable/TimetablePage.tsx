import { useDialogFeedback } from '../../components/common/useDialogFeedback';
import React, { useState, useEffect } from 'react';
import {
  Calendar,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Edit2,
  X,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  fetchClassTimetable,
  fetchClasses,
  fetchSubjects,
  updateTimetableEntry,
} from '../../services/subjectApi';
import { createSession } from '../../services/attendanceApi';
import { ClassSection, Subject, TimetableEntry } from '../../types/subject';
import { SessionCreatePayload } from '../../types/attendance';
import { formatApiErrorMessage } from '../../utils/apiError';

interface TimetablePageProps {
  canEdit?: boolean;
  onNavigate?: (tab: string, extra?: string) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const TimetablePage: React.FC<TimetablePageProps> = ({ onNavigate, canEdit = false }) => {
  const { notify, feedback } = useDialogFeedback();
  const [loadError, setLoadError] = useState('');
  // State
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const loadData = () => setRefresh(value => value + 1);
  const [selectedClass, setSelectedClass] = useState<ClassSection | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const reload = () => setRefresh(value => value + 1);
    window.addEventListener('timetable-updated', reload);
    return () => window.removeEventListener('timetable-updated', reload);
  }, []);

  // Week selection state (stores Monday of selected week)
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
  });

  // Create Session Quick Modal
  const [sessionModalSlot, setSessionModalSlot] = useState<TimetableEntry | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionCreatePayload>({
    class_name: '',
    subject: '',
    room: '',
    start_time: '09:00',
    end_time: '10:00',
    late_threshold_minutes: 10,
    attendance_mode: 'AI_FACE_RECOGNITION',
  });
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);

  // Edit / Map Slot Modal
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [editSubjectId, setEditSubjectId] = useState<string>('');
  const [editRoom, setEditRoom] = useState<string>('');
  const [editBatch, setEditBatch] = useState<string>('');
  const [editLabel, setEditLabel] = useState<string>('');
  const [editType, setEditType] = useState<string>('SUBJECT');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError('');
    Promise.all([fetchClasses(undefined, undefined, 'ACTIVE'), canEdit ? fetchSubjects(undefined, undefined, 'ACTIVE') : Promise.resolve([])])
      .then(([sections, courses]) => {
        if (!active) return;
        setClasses(sections);
        setSubjects(courses);
        setSelectedClass(current => sections.find(section => section.id === current?.id) ?? sections[0] ?? null);
      }).catch(err => {
        if (active) setCatalogError(formatApiErrorMessage(err, 'Unable to load classes.'));
      }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [canEdit, refresh]);

  useEffect(() => {
    let active = true;
    setTimetableEntries([]);
    setLoadError('');
    if (!selectedClass) { setLoading(false); return; }
    setLoading(true);
    fetchClassTimetable(selectedClass.id)
      .then(entries => { if (active) setTimetableEntries(entries); })
      .catch(err => { if (active) setLoadError(formatApiErrorMessage(err, 'Unable to load timetable.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedClass, refresh]);

  // Helpers for Week Calculation
  const getWeekDates = () => {
    const dates: { [dayName: string]: { date: Date; dateStr: string; formatted: string } } = {};
    DAYS_OF_WEEK.forEach((dayName, idx) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + idx);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates[dayName] = { date: d, dateStr, formatted };
    });
    return dates;
  };

  const weekDates = getWeekDates();
  const effectiveDate = (value?: string) => {
    const legacy = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return legacy ? `${legacy[3]}-${legacy[2].padStart(2, '0')}-${legacy[1].padStart(2, '0')}` : value ?? '';
  };
  const scheduled = timetableEntries.filter(entry => {
    const day = DAYS_OF_WEEK.find(name => name.toLowerCase() === entry.day_of_week.toLowerCase());
    return day && entry.status === 'ACTIVE' && weekDates[day].dateStr >= effectiveDate(entry.effective_from)
      && weekDates[day].dateStr >= effectiveDate(selectedClass?.effective_from);
  });
  const days = DAYS_OF_WEEK.filter(day => scheduled.some(entry => entry.day_of_week.toLowerCase() === day.toLowerCase()));
  const periods = Array.from(new Set(scheduled.map(entry => `${entry.start_time}/${entry.end_time}`))).sort()
    .map(pair => { const [start, end] = pair.split('/'); return { start, end }; });

  const handlePrevWeek = () => {
    const prev = new Date(weekStartDate);
    prev.setDate(weekStartDate.getDate() - 7);
    setWeekStartDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(weekStartDate);
    next.setDate(weekStartDate.getDate() + 7);
    setWeekStartDate(next);
  };

  const handleCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    setWeekStartDate(new Date(d.setDate(diff)));
  };

  // Helper for current time highlight
  const isCurrentTimeSlot = (startStr: string, endStr: string, dayStr: string) => {
    const now = new Date();
    const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    if (todayName !== dayStr) return false;

    // Compare with current week Monday
    const todayMonday = new Date();
    const day = todayMonday.getDay();
    const diff = todayMonday.getDate() - day + (day === 0 ? -6 : 1);
    todayMonday.setDate(diff);
    todayMonday.setHours(0, 0, 0, 0);

    const activeMonday = new Date(weekStartDate);
    activeMonday.setHours(0, 0, 0, 0);
    if (todayMonday.getTime() !== activeMonday.getTime()) return false;

    const [sH, sM] = startStr.split(':').map(Number);
    const [eH, eM] = endStr.split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    return currentMins >= startMins && currentMins < endMins;
  };

  const isToday = (dayStr: string) => {
    const now = new Date();
    const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    if (todayName !== dayStr) return false;

    const todayMonday = new Date();
    const day = todayMonday.getDay();
    const diff = todayMonday.getDate() - day + (day === 0 ? -6 : 1);
    todayMonday.setDate(diff);
    todayMonday.setHours(0, 0, 0, 0);

    const activeMonday = new Date(weekStartDate);
    activeMonday.setHours(0, 0, 0, 0);
    return todayMonday.getTime() === activeMonday.getTime();
  };

  // Open Create Session Modal for a specific Slot
  const handleOpenCreateSession = (entry: TimetableEntry, dayName: string) => {
    setSessionError(null);
    setConflictSessionId(null);
    setSessionModalSlot(entry);
    const slotDate = weekDates[dayName]?.dateStr || new Date().toISOString().split('T')[0];

    setSessionForm({
      class_id: selectedClass?.id,
      class_name: selectedClass?.name || '',
      timetable_entry_id: entry.id,
      subject_id: entry.subject_id || '',
      subject: entry.subject_name || entry.label,
      room: entry.room || '',
      scheduled_date: slotDate,
      start_time: entry.start_time,
      end_time: entry.end_time,
      late_threshold_minutes: 10,
      attendance_mode: 'AI_FACE_RECOGNITION',
    });
  };

  // Submit Create Session
  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSessionError(null);
    setConflictSessionId(null);
    setCreatingSession(true);

    try {
      const payload: SessionCreatePayload = {
        ...sessionForm,
      };
      await createSession(payload);
      setSessionModalSlot(null);
      if (onNavigate) {
        onNavigate('attendance');
      } else {
        notify('Attendance session created successfully!');
      }
    } catch (err: unknown) {
      const msg = formatApiErrorMessage(err, 'Failed to create session.');
      setSessionError(msg);
      const detail = (err as { response?: { data?: { detail?: { details?: { existing_session_id?: string } } } } }).response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.details?.existing_session_id) {
        setConflictSessionId(detail.details.existing_session_id);
      }
    } finally {
      setCreatingSession(false);
    }
  };

  // Open Edit Slot Modal
  const handleOpenEditSlot = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setEditSubjectId(entry.subject_id || '');
    setEditRoom(entry.room || '');
    setEditBatch(entry.batch || '');
    setEditLabel(entry.label);
    setEditType(entry.entry_type);
  };

  // Submit Edit Slot
  const handleSaveEditSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    setSavingEdit(true);
    try {
      await updateTimetableEntry(editingEntry.id, {
        subject_id: editSubjectId || undefined,
        room: editRoom || undefined,
        batch: editBatch || undefined,
        label: editLabel,
        entry_type: editType as TimetableEntry['entry_type'],
      });
      setEditingEntry(null);
      loadData();
    } catch (err) {
      notify('Failed to update timetable slot.');
    } finally {
      setSavingEdit(false);
    }
  };

  const renderCellContent = (dayName: string, start: string, end: string) => {
    const entries = scheduled.filter(entry => entry.day_of_week.toLowerCase() === dayName.toLowerCase()
      && entry.start_time === start && entry.end_time === end);
    return entries.length ? entries.map(entry => (
      <div key={entry.id} className="mb-2 space-y-2 rounded-xl border border-border bg-surface p-3 text-xs">
        <strong>{entry.label}</strong>
        <div className="text-text-muted">{[entry.entry_type, entry.batch, entry.room].filter(Boolean).join(' · ')}</div>
        {entry.subject_name && <div>{entry.subject_code} {entry.subject_name}</div>}
        <div className="flex flex-wrap gap-2">
          {entry.entry_type === 'SUBJECT' && <button className="inline-flex items-center gap-1 text-indigo-700"
            onClick={() => handleOpenCreateSession(entry, dayName)}><Plus size={14} />Create Session</button>}
          {canEdit && <button aria-label={`Edit ${entry.label}`} onClick={() => handleOpenEditSlot(entry)}><Edit2 size={14}/></button>}
        </div>
      </div>
    )) : <span aria-label="No slot">—</span>;
  };

  return (
    <div className="space-y-6">
      {feedback}
      {(catalogError || loadError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-sm text-danger"><p>{catalogError || loadError}</p><button className="min-h-11 font-semibold underline" onClick={() => {setLoadError('');void loadData();}}>Retry</button></div>}
      {/* Timetable Header Card */}
      <div className="bg-surface rounded-3xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>{selectedClass?.department}</span>
          </div>
          <h1 className="text-2xl font-black text-text">Weekly Timetable</h1>
          <label>Class <select value={selectedClass?.id ?? ''} onChange={event => {
            setTimetableEntries([]);
            setSelectedClass(classes.find(section => section.id === event.target.value) ?? null);
          }}>
            {!classes.length && <option value="">No class selected</option>}
            {classes.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select></label>
          {selectedClass?.effective_from && <p>Effective from {selectedClass.effective_from}</p>}
        </div>

        {/* Week Navigator & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-muted p-1 rounded-2xl border border-border shadow-inner text-xs">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-xl hover:bg-surface text-text-muted hover:text-text transition"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="px-3 py-1.5 rounded-xl font-bold bg-surface text-indigo-700 shadow-sm text-xs transition"
            >
              Today
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-xl hover:bg-surface text-text-muted hover:text-text transition"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 rounded-2xl bg-surface-muted hover:bg-surface-muted text-text-muted transition"
            title="Refresh Timetable"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* College Timetable Grid */}
      <div className="bg-surface rounded-3xl border border-border shadow-sm overflow-hidden">
        {/* Week Header Indicator */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="font-bold">
              Week of {weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className="text-text-muted text-[11px]">
            {selectedClass?.name}
          </div>
        </div>

        {/* Real Table Grid */}
        {loading || catalogLoading ? <p className="p-6">Loading timetable…</p> : catalogError || loadError ? null : !periods.length ? <p className="p-6">{selectedClass ? 'No slots scheduled for this week.' : 'No active classes available.'}</p> : <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[900px]">
            {/* Table Header: Days of the Week */}
            <thead>
              <tr className="bg-surface-muted border-b border-border text-text text-xs font-bold">
                <th className="py-3 px-4 w-40 text-text-muted font-mono text-[11px] uppercase tracking-wider border-r border-border text-center">
                  TIME PERIOD
                </th>
                {days.map((day) => {
                  const isCurrentDay = isToday(day);
                  return (
                    <th
                      key={day}
                      className={`py-3 px-4 border-r border-border last:border-r-0 ${
                        isCurrentDay ? 'bg-indigo-50/80 text-indigo-900 font-black' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{day.toUpperCase()}</span>
                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                            isCurrentDay ? 'bg-indigo-600 text-white font-bold' : 'text-text-muted bg-surface-muted'
                          }`}
                        >
                          {weekDates[day]?.formatted}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Table Body: Standard Periods */}
            <tbody className="divide-y divide-border text-text text-xs">
              {periods.map((period) => {
                return (
                  <tr key={`${period.start}/${period.end}`} className="hover:bg-surface-muted/30 transition">
                    {/* Time Column */}
                    <td className="py-3 px-3 w-40 border-r border-border bg-surface-muted/60 text-center font-mono text-[11px] text-text-muted font-bold align-middle">
                      <div className="flex flex-col items-center justify-center space-y-0.5">
                        <span className="text-text">{period.start}</span>
                        <span className="text-text-muted text-[10px] font-normal">to</span>
                        <span className="text-text">{period.end}</span>
                      </div>
                    </td>

                    {/* Day Cells */}
                    {days.map((day) => {
                      const isCurrentDay = isToday(day);
                      const isNow = isCurrentTimeSlot(period.start, period.end, day);

                      return (
                        <td
                          key={day}
                          className={`p-2.5 border-r border-border last:border-r-0 align-top relative ${
                            isCurrentDay ? 'bg-indigo-50/20' : ''
                          } ${isNow ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}
                        >
                          {isNow && (
                            <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-black text-[9px] tracking-wider uppercase shadow-xs z-10 animate-pulse">
                              ● NOW
                            </span>
                          )}
                          {renderCellContent(day, period.start, period.end)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: QUICK CREATE SESSION FROM TIMETABLE SLOT */}
      {/* ========================================================================= */}
      {sessionModalSlot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 font-bold text-text text-base">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Create Attendance Session</span>
              </div>
              <button
                onClick={() => setSessionModalSlot(null)}
                className="text-text-muted hover:text-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {sessionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{sessionError}</span>
                  </div>
                </div>
                {conflictSessionId && onNavigate && (
                  <button
                    onClick={() => {
                      setSessionModalSlot(null);
                      onNavigate('attendance');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shrink-0"
                  >
                    View Session
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleCreateSessionSubmit} className="space-y-3 text-xs">
              <div className="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100 space-y-1">
                <div className="font-bold text-text text-sm">{sessionModalSlot.label}</div>
                <div className="text-[11px] text-indigo-800 font-medium flex items-center gap-3">
                  <span>Class: {selectedClass?.name || ''}</span>
                  <span>·</span>
                  <span>
                    Time: {sessionModalSlot.start_time} – {sessionModalSlot.end_time}
                  </span>
                  {sessionModalSlot.batch && (
                    <>
                      <span>·</span>
                      <span className="font-bold">Batch {sessionModalSlot.batch}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-text">Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={sessionForm.scheduled_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, scheduled_date: e.target.value })}
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-text">Room / Hall *</label>
                  <input
                    type="text"
                    required
                    value={sessionForm.room}
                    onChange={(e) => setSessionForm({ ...sessionForm, room: e.target.value })}
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-text">Attendance Mode</label>
                  <select
                    value={sessionForm.attendance_mode}
                    onChange={(e) => setSessionForm({ ...sessionForm, attendance_mode: e.target.value as SessionCreatePayload['attendance_mode'] })}
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  >
                    <option value="AI_FACE_RECOGNITION">AI Face Recognition</option>
                    <option value="MANUAL">Manual Marking</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-text">Late Threshold (Min)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={sessionForm.late_threshold_minutes}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        late_threshold_minutes: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSessionModalSlot(null)}
                  className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {creatingSession && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Session</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT / MAP TIMETABLE ENTRY */}
      {/* ========================================================================= */}
      {canEdit && editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-2xl border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="font-bold text-text text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                <span>Edit Timetable Slot ({editingEntry.day_of_week})</span>
              </div>
              <button onClick={() => setEditingEntry(null)} className="text-text-muted hover:text-text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSlot} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-text">Timetable Label *</label>
                <input
                  type="text"
                  required
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-text">Map to Academic Course</label>
                <select
                  value={editSubjectId}
                  onChange={(e) => setEditSubjectId(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                >
                  <option value="">(Unmapped Timetable Label)</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-text">Room / Lab</label>
                  <input
                    type="text"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    placeholder="e.g. CR 26, L5, SL"
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-text">Batch</label>
                  <input
                    type="text"
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value)}
                    placeholder="e.g. B1, B2"
                    className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-text">Entry Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text focus:outline-none focus:border-indigo-500"
                >
                  <option value="SUBJECT">SUBJECT (Teaching)</option>
                  <option value="ACTIVITY">ACTIVITY (Mentoring/Library/HM)</option>
                  <option value="BREAK">BREAK (Lunch Break)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-muted text-text font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1"
                >
                  {savingEdit && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
