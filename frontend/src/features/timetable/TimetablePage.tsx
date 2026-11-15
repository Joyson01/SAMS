import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Edit2,
  X,
  CheckCircle2,
  Sparkles,
  Layers,
  Coffee,
} from 'lucide-react';
import {
  fetchClassTimetable,
  fetchClasses,
  fetchSubjects,
  updateTimetableEntry,
} from '../../services/subjectApi';
import { createSession } from '../../services/attendanceApi';
import { fetchCameras } from '../../services/cameraApi';
import { ClassSection, Subject, TimetableEntry } from '../../types/subject';
import { CameraDevice } from '../../types/camera';
import { SessionCreatePayload } from '../../types/attendance';
import { formatApiErrorMessage } from '../../utils/apiError';

interface TimetablePageProps {
  onNavigate?: (tab: string, extra?: any) => void;
}

const TIME_PERIODS = [
  { start: '09:00', end: '10:00', label: '09:00 AM – 10:00 AM' },
  { start: '10:00', end: '11:00', label: '10:00 AM – 11:00 AM' },
  { start: '11:00', end: '12:00', label: '11:00 AM – 12:00 PM' },
  { start: '12:00', end: '13:00', label: '12:00 PM – 01:00 PM' },
  { start: '13:00', end: '14:00', label: '01:00 PM – 02:00 PM', isBreak: true },
  { start: '14:00', end: '15:00', label: '02:00 PM – 03:00 PM' },
  { start: '15:00', end: '16:00', label: '03:00 PM – 04:00 PM' },
  { start: '16:00', end: '17:00', label: '04:00 PM – 05:00 PM' },
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const TimetablePage: React.FC<TimetablePageProps> = ({ onNavigate }) => {
  // State
  const [selectedClass, setSelectedClass] = useState<ClassSection | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
    camera_id: '',
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

  // Load Reference Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [clsList, subjList, camList] = await Promise.all([
        fetchClasses(undefined, undefined, 'ACTIVE'),
        fetchSubjects(undefined, undefined, 'ACTIVE'),
        fetchCameras(),
      ]);
      setSubjects(subjList);
      setCameras(camList);

      const targetClass = clsList.find((c) => c.name === 'TE-B') || clsList[0] || null;
      setSelectedClass(targetClass);

      if (targetClass) {
        const entries = await fetchClassTimetable(targetClass.id);
        setTimetableEntries(entries);
      }
    } catch (err) {
      console.error('Failed to load timetable data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helpers for Week Calculation
  const getWeekDates = () => {
    const dates: { [dayName: string]: { date: Date; dateStr: string; formatted: string } } = {};
    DAYS_OF_WEEK.forEach((dayName, idx) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + idx);
      const dateStr = d.toISOString().split('T')[0];
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates[dayName] = { date: d, dateStr, formatted };
    });
    return dates;
  };

  const weekDates = getWeekDates();

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

    // Auto-match camera to room if possible
    let bestCamId = cameras.length > 0 ? cameras[0].id : '';
    if (entry.room) {
      const match = cameras.find(
        (c) =>
          c.location.toLowerCase().includes(entry.room!.toLowerCase()) ||
          c.name.toLowerCase().includes(entry.room!.toLowerCase())
      );
      if (match) {
        bestCamId = match.id;
      }
    }

    setSessionForm({
      class_id: selectedClass?.id,
      class_name: selectedClass?.name || 'TE-B',
      timetable_entry_id: entry.id,
      subject_id: entry.subject_id || '',
      subject: entry.subject_name || entry.label,
      room: entry.room || 'CR 26',
      scheduled_date: slotDate,
      start_time: entry.start_time,
      end_time: entry.end_time,
      late_threshold_minutes: 10,
      attendance_mode: 'AI_FACE_RECOGNITION',
      camera_id: bestCamId,
      camera_ids: bestCamId ? [bestCamId] : [],
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
        camera_ids: sessionForm.camera_id ? [sessionForm.camera_id] : [],
      };
      await createSession(payload);
      setSessionModalSlot(null);
      if (onNavigate) {
        onNavigate('attendance');
      } else {
        alert('Attendance session created successfully!');
      }
    } catch (err: any) {
      const msg = formatApiErrorMessage(err, 'Failed to create session.');
      setSessionError(msg);
      const detail = err.response?.data?.detail;
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
        entry_type: editType as any,
      });
      setEditingEntry(null);
      if (selectedClass) {
        const entries = await fetchClassTimetable(selectedClass.id);
        setTimetableEntries(entries);
      }
    } catch (err) {
      alert('Failed to update timetable slot.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Render Table Cell for Day & Period
  const renderCellContent = (dayName: string, periodStart: string) => {
    const entries = timetableEntries.filter(
      (e) =>
        e.day_of_week.toLowerCase() === dayName.toLowerCase() &&
        e.start_time.slice(0, 5) === periodStart
    );

    if (entries.length === 0) {
      // Check if it's the standard Lunch Break
      if (periodStart === '13:00') {
        return (
          <div className="h-full min-h-[96px] bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-center justify-center p-2 text-center">
            <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs tracking-wider">
              <Coffee className="w-4 h-4 text-amber-600" />
              <span>LUNCH BREAK</span>
            </div>
          </div>
        );
      }
      return (
        <div className="h-full min-h-[96px] bg-slate-50/40 border border-dashed border-slate-200 rounded-xl flex items-center justify-center p-2 text-slate-300 text-xs">
          —
        </div>
      );
    }

    // If Lunch Break entry
    if (entries.length === 1 && entries[0].entry_type === 'BREAK') {
      return (
        <div className="h-full min-h-[96px] bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-center justify-center p-2 text-center">
          <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs tracking-wider">
            <Coffee className="w-4 h-4 text-amber-600" />
            <span>LUNCH BREAK</span>
          </div>
        </div>
      );
    }

    // If multiple batch entries in the same period (e.g. B1 and B2)
    if (entries.length > 1) {
      return (
        <div className="h-full min-h-[96px] flex flex-col gap-1.5">
          {entries.map((entry) => {
            const isB1 = entry.batch === 'B1';
            return (
              <div
                key={entry.id}
                className={`p-2 rounded-xl border flex-1 flex flex-col justify-between text-xs transition group ${
                  isB1
                    ? 'bg-blue-50/50 hover:bg-blue-100/60 border-blue-200 text-blue-950'
                    : 'bg-indigo-50/50 hover:bg-indigo-100/60 border-indigo-200 text-indigo-950'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-bold text-[11px] leading-tight truncate" title={entry.label}>
                    {entry.label}
                  </div>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                      isB1 ? 'bg-blue-200 text-blue-800' : 'bg-indigo-200 text-indigo-800'
                    }`}
                  >
                    {entry.batch || 'Batch'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/50 mt-1">
                  <span className="font-mono text-slate-600">{entry.room || 'Lab'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenCreateSession(entry, dayName)}
                      className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-600 hover:text-white text-blue-700 font-bold text-[10px] border border-blue-200 transition"
                      title="Create attendance session for this batch"
                    >
                      + Session
                    </button>
                    <button
                      onClick={() => handleOpenEditSlot(entry)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition"
                      title="Edit slot"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Single Entry
    const entry = entries[0];
    const isActivity = entry.entry_type === 'ACTIVITY';

    if (isActivity) {
      return (
        <div className="h-full min-h-[96px] bg-slate-100/70 hover:bg-slate-200/60 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between text-xs transition group">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs">{entry.label}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700 uppercase">
                ACTIVITY
              </span>
            </div>
            <div className="text-[10px] text-slate-500 italic">
              Institutional / Mentoring
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] text-slate-400">
            <span>No Attendance</span>
            <button
              onClick={() => handleOpenEditSlot(entry)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition"
              title="Edit Activity"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    // Teaching / Subject Entry
    return (
      <div className="h-full min-h-[96px] bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-xl p-2.5 flex flex-col justify-between shadow-xs transition group">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-1">
            <span className="font-bold text-slate-900 text-xs group-hover:text-blue-700 leading-snug">
              {entry.label}
            </span>
            {entry.room && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 shrink-0">
                {entry.room}
              </span>
            )}
          </div>

          {entry.subject_code ? (
            <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="truncate">[{entry.subject_code}] {entry.subject_name}</span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic">
              Timetable Entry
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs mt-1">
          <button
            onClick={() => handleOpenCreateSession(entry, dayName)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 transition"
          >
            <Plus className="w-3 h-3" />
            <span>Create Session</span>
          </button>
          <button
            onClick={() => handleOpenEditSlot(entry)}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition"
            title="Edit Slot / Map Course"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Timetable Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Department of Computer Engineering</span>
            <span>·</span>
            <span>Class: TE-B</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Official Weekly Timetable</h1>
          <p className="text-xs text-slate-500 font-medium">
            Effective From: <span className="text-slate-900 font-bold">15/06/2026</span> · 8 Standard Teaching Periods Daily (Monday – Friday)
          </p>
        </div>

        {/* Week Navigator & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner text-xs">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition"
              title="Previous Week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="px-3 py-1.5 rounded-xl font-bold bg-white text-blue-700 shadow-sm text-xs transition"
            >
              Today
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition"
              title="Next Week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            title="Refresh Timetable"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* College Timetable Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Week Header Indicator */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="font-bold">
              Week of {weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Showing Monday – Friday schedule (Click any teaching slot to create attendance session)
          </div>
        </div>

        {/* Real Table Grid */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[900px]">
            {/* Table Header: Days of the Week */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold">
                <th className="py-3 px-4 w-40 text-slate-500 font-mono text-[11px] uppercase tracking-wider border-r border-slate-200 text-center">
                  TIME PERIOD
                </th>
                {DAYS_OF_WEEK.map((day) => {
                  const isCurrentDay = isToday(day);
                  return (
                    <th
                      key={day}
                      className={`py-3 px-4 border-r border-slate-200 last:border-r-0 ${
                        isCurrentDay ? 'bg-blue-50/80 text-blue-900 font-black' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{day.toUpperCase()}</span>
                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                            isCurrentDay ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 bg-slate-100'
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
            <tbody className="divide-y divide-slate-200 text-slate-800 text-xs">
              {TIME_PERIODS.map((period) => {
                return (
                  <tr key={period.start} className="hover:bg-slate-50/30 transition">
                    {/* Time Column */}
                    <td className="py-3 px-3 w-40 border-r border-slate-200 bg-slate-50/60 text-center font-mono text-[11px] text-slate-600 font-bold align-middle">
                      <div className="flex flex-col items-center justify-center space-y-0.5">
                        <span className="text-slate-900">{period.start}</span>
                        <span className="text-slate-400 text-[10px] font-normal">to</span>
                        <span className="text-slate-900">{period.end}</span>
                      </div>
                    </td>

                    {/* Day Cells */}
                    {DAYS_OF_WEEK.map((day) => {
                      const isCurrentDay = isToday(day);
                      const isNow = isCurrentTimeSlot(period.start, period.end, day);

                      return (
                        <td
                          key={day}
                          className={`p-2.5 border-r border-slate-200 last:border-r-0 align-top relative ${
                            isCurrentDay ? 'bg-blue-50/20' : ''
                          } ${isNow ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}
                        >
                          {isNow && (
                            <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-black text-[9px] tracking-wider uppercase shadow-xs z-10 animate-pulse">
                              ● NOW
                            </span>
                          )}
                          {renderCellContent(day, period.start)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-slate-700">Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-white border border-slate-300 shadow-2xs" />
              <span className="text-slate-600">Subject (Teaching Slot)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
              <span className="text-slate-600">Batch B1 / B2 Lab</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
              <span className="text-slate-600">Activity (Mentoring / Library / HM)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
              <span className="text-slate-600">Lunch Break</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400">
            Source: Official College Timetable (TE-B · 15/06/2026)
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: QUICK CREATE SESSION FROM TIMETABLE SLOT */}
      {/* ========================================================================= */}
      {sessionModalSlot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Create Attendance Session</span>
              </div>
              <button
                onClick={() => setSessionModalSlot(null)}
                className="text-slate-400 hover:text-slate-600"
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
              <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-100 space-y-1">
                <div className="font-bold text-slate-900 text-sm">{sessionModalSlot.label}</div>
                <div className="text-[11px] text-blue-800 font-medium flex items-center gap-3">
                  <span>Class: {selectedClass?.name || 'TE-B'}</span>
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
                  <label className="font-bold text-slate-700">Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={sessionForm.scheduled_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, scheduled_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Room / Hall *</label>
                  <input
                    type="text"
                    required
                    value={sessionForm.room}
                    onChange={(e) => setSessionForm({ ...sessionForm, room: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Camera Source</label>
                <select
                  value={sessionForm.camera_id || ''}
                  onChange={(e) =>
                    setSessionForm({
                      ...sessionForm,
                      camera_id: e.target.value,
                      camera_ids: e.target.value ? [e.target.value] : [],
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  {cameras.length === 0 ? (
                    <option value="">No cameras configured</option>
                  ) : (
                    cameras.map((cam) => {
                      const isMatch =
                        sessionModalSlot.room &&
                        (cam.location.toLowerCase().includes(sessionModalSlot.room.toLowerCase()) ||
                          cam.name.toLowerCase().includes(sessionModalSlot.room.toLowerCase()));
                      return (
                        <option key={cam.id} value={cam.id}>
                          {cam.name} ({cam.location}) {isMatch ? '★ (Matches Room)' : ''}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Attendance Mode</label>
                  <select
                    value={sessionForm.attendance_mode}
                    onChange={(e) => setSessionForm({ ...sessionForm, attendance_mode: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="AI_FACE_RECOGNITION">AI Face Recognition</option>
                    <option value="MANUAL">Manual Marking</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Late Threshold (Min)</label>
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSessionModalSlot(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
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
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <span>Edit Timetable Slot ({editingEntry.day_of_week})</span>
              </div>
              <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSlot} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Timetable Label *</label>
                <input
                  type="text"
                  required
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Map to Academic Course</label>
                <select
                  value={editSubjectId}
                  onChange={(e) => setEditSubjectId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
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
                  <label className="font-bold text-slate-700">Room / Lab</label>
                  <input
                    type="text"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    placeholder="e.g. CR 26, L5, SL"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Batch</label>
                  <input
                    type="text"
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value)}
                    placeholder="e.g. B1, B2"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Entry Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="SUBJECT">SUBJECT (Teaching)</option>
                  <option value="ACTIVITY">ACTIVITY (Mentoring/Library/HM)</option>
                  <option value="BREAK">BREAK (Lunch Break)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1"
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
