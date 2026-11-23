import { useDialogFeedback } from '../../components/common/useDialogFeedback';
import { PhotoAttendancePanel } from '../../components/PhotoAttendancePanel';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar,
  Users,
  Play,
  Square,
  Plus,
  RefreshCw,
  Edit3,
  Sparkles,
  MoreVertical,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchSessions,
  createSession,
  startSession,
  closeSession,
  fetchSessionRoster,
  markManualAttendance,
  type ClassRosterStudentItem,
  type SessionRosterResponse,
  overrideRecord,
} from '../../services/attendanceApi';
import { fetchSubjects, fetchClasses, fetchClassTimetable } from '../../services/subjectApi';
import { formatApiErrorMessage } from '../../utils/apiError';
import { fetchCurrentTimetableEntry } from '../../services/timetableApi';
import {
  AttendanceSession,
  SessionCreatePayload,
} from '../../types/attendance';
import { Subject, ClassSection, TimetableEntry } from '../../types/subject';
import {
  Button,
  IconButton,
  StatusBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Drawer,
  Modal,
  EmptyState,
  Progress,
} from '../../components/ui';

const formatDisplayTime = (timeStr?: string): string => {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const minute = parts[1].slice(0, 2);
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(displayHour).padStart(2, '0')}:${minute} ${ampm}`;
};

export const AttendancePage: React.FC = () => {
  const { confirmAction, notify, feedback } = useDialogFeedback();
  // Session List State
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<string>('all'); // all, today

  // Selected Session Drawer
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const selectedSessionId = selectedSession?.id ?? null;
  const [roster, setRoster] = useState<SessionRosterResponse | null>(null);
  const [rosterError, setRosterError] = useState('');
  const rosterRequest = useRef(0);
  const rosterHeading = useRef<HTMLHeadingElement>(null);
  const [sessionMode, setSessionMode] = useState<'photo' | 'manual'>('photo');
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false);
  const [recordFilterStatus, setRecordFilterStatus] = useState<string>('');
  const [recordSearch, setRecordSearch] = useState<string>('');

  // Dropdown reference data
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassSection[]>([]);

  // Create Session Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [creationMode, setCreationMode] = useState<'timetable' | 'custom'>('timetable');

  // Timetable Mode State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTimetableDate, setSelectedTimetableDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [timetableSlots, setTimetableSlots] = useState<TimetableEntry[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<TimetableEntry | null>(null);

  // Custom Form State
  const [createForm, setCreateForm] = useState<SessionCreatePayload>({
    class_name: '',
    subject: '',
    subject_id: '',
    class_id: '',
    timetable_entry_id: '',
    room: 'CR 26',
    scheduled_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    late_threshold_minutes: 10,
    attendance_mode: 'AI_FACE_RECOGNITION',
  });

  // Manual Override Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<ClassRosterStudentItem | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<
    'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT' | 'MANUAL_EXCUSED'
  >('PRESENT');
  const [overrideRemarks, setOverrideRemarks] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  const [loadError, setLoadError] = useState('');
  // Form error message
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Row Menu Popover
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      let dateParam: string | undefined = undefined;
      if (filterDateRange === 'today') {
        dateParam = new Date().toISOString().split('T')[0];
      }

      const list = await fetchSessions({
        class_name: filterClass || undefined,
        subject_id: filterSubject || undefined,
        status: filterStatus || undefined,
        scheduled_date: dateParam,
      });
      setSessions(list);
    } catch (err) {
      setLoadError(formatApiErrorMessage(err, 'Unable to load this view. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterSubject, filterStatus, filterDateRange]);

  const loadReferenceData = async () => {
    try {
      const [subjList, clsList] = await Promise.all([
        fetchSubjects(undefined, undefined, 'ACTIVE'),
        fetchClasses(undefined, undefined, 'ACTIVE'),
      ]);
      setAvailableSubjects(subjList);
      setAvailableClasses(clsList);

      if (clsList.length > 0 && !selectedClassId) {
        setSelectedClassId(clsList[0].id);
        setCreateForm((prev) => ({
          ...prev,
          class_name: clsList[0].name,
          class_id: clsList[0].id,
        }));
      }
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  };

  useEffect(() => {
    loadSessions();
    loadReferenceData();
  }, [loadSessions]);

  // Load Timetable Slots for Create Session Modal
  const loadDayTimetable = useCallback(async () => {
    if (!selectedClassId || !selectedTimetableDate) return;
    setLoadingTimetable(true);
    try {
      const entries = await fetchClassTimetable(selectedClassId, undefined, selectedTimetableDate);
      setTimetableSlots(entries.filter((e) => e.entry_type === 'SUBJECT' || !e.entry_type));
    } catch (err) {
      console.error('Failed to load timetable for date:', err);
    } finally {
      setLoadingTimetable(false);
    }
  }, [selectedClassId, selectedTimetableDate]);

  useEffect(() => {
    if (isCreateModalOpen && creationMode === 'timetable') {
      loadDayTimetable();
    }
  }, [isCreateModalOpen, creationMode, loadDayTimetable]);

  const loadSessionDetails = useCallback(async (sessionId: string) => {
    const request = ++rosterRequest.current;
    setLoadingRecords(true);
    setRosterError('');
    try {
      const result = await fetchSessionRoster(sessionId);
      if (request === rosterRequest.current) setRoster(result);
    } catch (err) {
      if (request === rosterRequest.current) {
        setRosterError(formatApiErrorMessage(err, 'Unable to load the class roster.'));
      }
    } finally {
      if (request === rosterRequest.current) setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) void loadSessionDetails(selectedSessionId);
    return () => { rosterRequest.current++; };
  }, [selectedSessionId, loadSessionDetails]);

  function openSession(session: AttendanceSession, mode: 'photo' | 'manual' = 'photo') {
    setSessionMode(mode);
    setRecordFilterStatus('');
    setRecordSearch('');
    setSelectedSession(session);
  }

  // Auto Detect Current Class Action
  const handleAutoDetectCurrentClass = async () => {
    try {
      const activeEntry = await fetchCurrentTimetableEntry();
      if (!activeEntry) {
        notify('No scheduled class found for the current time slot.');
        return;
      }

      // Check if session already exists for this slot today
      const todayStr = new Date().toISOString().split('T')[0];
      const existing = sessions.find(
        (s) =>
          s.timetable_entry_id === activeEntry.id &&
          s.scheduled_date === todayStr
      );

      if (existing) {
        openSession(existing, existing.status === 'ACTIVE' ? 'photo' : 'manual');
      } else {
        // Pre-fill creation modal
        setSelectedClassId(activeEntry.class_id);
        setSelectedSlot(activeEntry);
        setCreateForm({
          class_id: activeEntry.class_id,
          class_name: activeEntry.class_name || 'TE-B',
          timetable_entry_id: activeEntry.id,
          subject_id: activeEntry.subject_id || '',
          subject: activeEntry.subject_name || activeEntry.label,
          room: activeEntry.room || 'CR 26',
          scheduled_date: todayStr,
          start_time: activeEntry.start_time,
          end_time: activeEntry.end_time,
          late_threshold_minutes: 10,
          attendance_mode: 'AI_FACE_RECOGNITION',
        });
        setIsCreateModalOpen(true);
      }
    } catch (err) {
      console.error('Error auto detecting class:', err);
      notify('Unable to auto-detect class schedule.');
    }
  };

  // Start / Close Actions
  const handleStart = async (sessionId: string) => {
    try {
      const started = await startSession(sessionId);
      setSessions(current => current.map(session => session.id === sessionId ? started : session));
      openSession(started);
      if (selectedSessionId === started.id) void loadSessionDetails(started.id);
    } catch (err) {
      notify('Failed to start session.');
    }
  };

  const handleClose = async (sessionId: string) => {
    if (
      await confirmAction(
        'Are you sure you want to end and finalize this attendance session? Remaining unverified students will be marked absent.'
      )
    ) {
      try {
        const completed = await closeSession(sessionId, true);
        if (selectedSessionId === sessionId) {
          setSelectedSession(current => current?.id === sessionId ? completed : current);
          void loadSessionDetails(sessionId);
        }
        await loadSessions();
      } catch (err) {
        notify('Failed to close session.');
      }
    }
  };

  // Create Session
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setCreatingSession(true);

    try {
      const newSession = await createSession(createForm);
      setIsCreateModalOpen(false);
      setSessions(current => [newSession, ...current]);
      openSession(newSession, newSession.status === 'ACTIVE' ? 'photo' : 'manual');
    } catch (err: unknown) {
      setErrorMessage(formatApiErrorMessage(err, 'Failed to create session.'));
    } finally {
      setCreatingSession(false);
    }
  };

  // Manual Override Record Submit
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord || !selectedSessionId) return;
    if (selectedRecord.record_id && overrideRemarks.trim().length < 2) {
      notify('Enter a reason before changing an existing mark.');
      return;
    }

    setOverrideSubmitting(true);
    try {
      const remarks = overrideRemarks.trim() || 'Faculty manual adjustment';
      if (selectedRecord.record_id) {
        await overrideRecord(selectedRecord.record_id, { status: overrideStatus, remarks });
      } else {
        await markManualAttendance(selectedSessionId, selectedRecord.student_id, overrideStatus, remarks);
      }
      setIsOverrideModalOpen(false);
      await Promise.all([loadSessionDetails(selectedSessionId), loadSessions()]);
    } catch (err: unknown) {
      notify(formatApiErrorMessage(err, 'Failed to override attendance status.'));
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const sessionRoster = roster?.session_id === selectedSessionId ? roster : null;
  const filteredRecords = useMemo(() => {
    const search = recordSearch.trim().toLowerCase();
    return (sessionRoster?.roster ?? []).filter(student => {
      const matchesSearch = [student.student_name, student.roll_number, student.student_code]
        .some(value => value?.toLowerCase().includes(search));
      const status = student.attendance_status.replace('MANUAL_', '');
      return matchesSearch && (!recordFilterStatus || status === recordFilterStatus);
    });
  }, [sessionRoster, recordSearch, recordFilterStatus]);

  const absentCount = sessionRoster?.roster.filter(student =>
    ['ABSENT', 'MANUAL_ABSENT'].includes(student.attendance_status)
  ).length ?? 0;

  return (
    <div className="space-y-5">
      {feedback}
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger/10 p-4 text-sm text-danger"><p>{loadError}</p><button className="min-h-11 font-semibold underline" onClick={() => {setLoadError('');void loadSessions();}}>Retry</button></div>}
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-medium text-text">
            Attendance
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Schedule and manage class attendance sessions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleAutoDetectCurrentClass}
            variant="secondary"
            size="sm"
            icon={<Sparkles className="w-3.5 h-3.5 text-indigo-600" />}
          >
            Auto Detect Current Class
          </Button>

          <Button
            onClick={() => {
              setErrorMessage(null);
              setSelectedSlot(null);
              setCreationMode('timetable');
              setIsCreateModalOpen(true);
            }}
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Create Session
          </Button>
        </div>
      </div>

      {/* 2. Filters Bar */}
      <div className="bg-surface p-3 rounded-lg border border-border shadow-xs flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Class Filter */}
          <select
            aria-label="Filter sessions by class" value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Classes</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Subject Filter */}
          <select
            aria-label="Filter sessions by subject" value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-xs truncate"
          >
            <option value="">All Subjects</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            aria-label="Filter sessions by status" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active (Live)</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Date Filter */}
          <select
            aria-label="Filter sessions by date" value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value)}
            className="px-2.5 py-1.5 bg-surface-muted border border-border rounded-lg text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
          </select>
        </div>

        <IconButton
          label="Refresh Sessions"
          onClick={loadSessions}
          size="sm"
          variant="secondary"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-text-muted ${loading ? 'animate-spin' : ''}`} />
        </IconButton>
      </div>

      {/* 3. Compact Sessions Table */}
      {loading ? (
        <div className="bg-surface rounded-lg p-16 text-center text-text-muted text-xs flex items-center justify-center gap-2 border border-border shadow-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Loading attendance sessions...</span>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6 text-text-muted" />}
          title="No Attendance Sessions Found"
          description="No sessions match the current filters. Click 'Create Session' to schedule an attendance event directly from the timetable."
          actionLabel="Create Session"
          onAction={() => setIsCreateModalOpen(true)}
          actionIcon={<Plus className="w-3.5 h-3.5" />}
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Class</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {sessions.map((sess) => {
              const isLive = sess.status === 'ACTIVE';
              const isScheduled = sess.status === 'SCHEDULED';
              const totalCount =
                sess.total_records || (sess.present_count + sess.absent_count) || 11;

              return (
                <TableRow key={sess.id}>
                  <TableCell className="font-semibold text-text">{sess.class_name}</TableCell>
                  <TableCell className="font-semibold text-text">{sess.subject}</TableCell>
                  <TableCell className="text-text-muted">{sess.room || 'CR 26'}</TableCell>
                  <TableCell className="text-text-muted font-mono text-xs">
                    <span>{sess.scheduled_date}</span>
                    <span className="text-text-muted"> • </span>
                    <span>{formatDisplayTime(sess.start_time)}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sess.status} category="session" size="sm" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text">
                        {isScheduled ? '—' : `${sess.present_count ?? 0} / ${totalCount}`}
                      </span>
                      {!isScheduled && totalCount > 0 && (
                        <div className="w-16 hidden sm:block">
                          <Progress
                            value={sess.present_count ?? 0}
                            max={totalCount}
                            size="sm"
                            variant="auto"
                          />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isLive ? (
                        <Button size="sm" onClick={() => openSession(sess)}>Take attendance</Button>
                      ) : isScheduled ? (
                        <Button
                          onClick={() => handleStart(sess.id)}
                          variant="secondary"
                          size="sm"
                          icon={<Play className="w-3 h-3 text-indigo-600 fill-current" />}
                        >
                          Start
                        </Button>
                      ) : null}

                      <Button
                        onClick={() => openSession(sess, 'manual')}
                        variant="ghost"
                        size="sm"
                      >
                        View
                      </Button>

                      <div className="relative">
                        <IconButton
                          label="Options"
                          onClick={() =>
                            setActiveMenuSessionId(
                              activeMenuSessionId === sess.id ? null : sess.id
                            )
                          }
                          size="sm"
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-text-muted" />
                        </IconButton>

                        {activeMenuSessionId === sess.id && (
                          <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-lg shadow-lg py-1 z-30 text-xs">
                            <button
                              onClick={() => {
                                setActiveMenuSessionId(null);
                                openSession(sess, 'manual');
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-surface-muted text-text flex items-center gap-2"
                            >
                              <Users className="w-3.5 h-3.5 text-text-muted" />
                              <span>View Roster</span>
                            </button>
                            {isLive && (
                              <button
                                onClick={() => {
                                  setActiveMenuSessionId(null);
                                  handleClose(sess.id);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                              >
                                <Square className="w-3.5 h-3.5" />
                                <span>End Session</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* 4. Session Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedSessionId)}
        onClose={() => setSelectedSession(null)}
        title={selectedSession ? `${selectedSession.class_name} • ${selectedSession.subject}` : 'Session Details'}
        subtitle={
          selectedSession
            ? `Room ${selectedSession.room} • ${selectedSession.scheduled_date} • ${formatDisplayTime(selectedSession.start_time)}`
            : undefined
        }
        width="lg"
        footer={
          selectedSession ? (
            <div className="flex items-center justify-between w-full">
              <div className="ml-auto flex items-center gap-2">
                {selectedSession.status === 'SCHEDULED' && (
                  <Button onClick={() => handleStart(selectedSession.id)} size="sm">Start session</Button>
                )}
                {selectedSession.status === 'ACTIVE' && (
                  <Button
                    onClick={() => handleClose(selectedSession.id)}
                    variant="danger"
                    size="sm"
                    icon={<Square className="w-3 h-3" />}
                  >
                    End Session
                  </Button>
                )}
                <Button
                  onClick={() => setSelectedSession(null)}
                  variant="secondary"
                  size="sm"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selectedSession && (
          <div className="space-y-5">
            {selectedSession.status === 'ACTIVE' && (
              <>
                <div className="flex flex-wrap gap-2" aria-label="Attendance method">
                  <Button aria-pressed={sessionMode === 'photo'} variant={sessionMode === 'photo' ? 'primary' : 'secondary'} onClick={() => setSessionMode('photo')}>Class photo</Button>
                  <Button aria-pressed={sessionMode === 'manual'} variant={sessionMode === 'manual' ? 'primary' : 'secondary'} onClick={() => setSessionMode('manual')}>Manual roster</Button>
                </div>
                <div hidden={sessionMode !== 'photo'}>
                  <PhotoAttendancePanel
                    key={selectedSession.id}
                    sessionId={selectedSession.id}
                    active
                    visible={sessionMode === 'photo'}
                    onConfirmed={async () => { await Promise.all([loadSessionDetails(selectedSession.id), loadSessions()]); }}
                    onManualReview={() => {
                      setSessionMode('manual');
                      setRecordFilterStatus('NOT_RECORDED');
                      requestAnimationFrame(() => rosterHeading.current?.focus());
                    }}
                  />
                </div>
              </>
            )}
            {(selectedSession.status !== 'ACTIVE' || sessionMode === 'manual') && <>
              {/* KPI Summary Strip */}
              <div className="grid grid-cols-4 gap-2 bg-surface-muted p-3 rounded-lg border border-border text-center text-xs">
                <div>
                  <div className="text-xs text-text-muted font-semibold">Total</div>
                  <div className="font-semibold text-text text-sm mt-0.5">{sessionRoster?.total_enrolled ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-emerald-600 font-semibold">Present</div>
                  <div className="font-semibold text-emerald-600 text-sm mt-0.5">{sessionRoster?.present_count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-amber-600 font-semibold">Late</div>
                  <div className="font-semibold text-amber-600 text-sm mt-0.5">{sessionRoster?.late_count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-rose-600 font-semibold">Absent</div>
                  <div className="font-semibold text-rose-600 text-sm mt-0.5">{absentCount}</div>
                </div>
              </div>

              {/* Attendance Rate */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text">Attendance Rate</span>
                  <span className="font-semibold text-text">{sessionRoster?.attendance_rate_pct ?? 0}%</span>
                </div>
                <Progress value={sessionRoster?.attendance_rate_pct ?? 0} max={100} size="sm" variant="auto" />
              </div>

              {/* Records Section */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 ref={rosterHeading} tabIndex={-1} className="text-sm font-semibold text-text">
                    Class roster ({filteredRecords.length})
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Filter attendance status" value={recordFilterStatus}
                      onChange={(e) => setRecordFilterStatus(e.target.value)}
                      className="px-2 py-1 bg-surface border border-border rounded text-xs text-text focus:outline-none"
                    >
                      <option value="">All Statuses</option>
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                      <option value="EXCUSED">Excused</option>
                      <option value="NOT_RECORDED">Unmarked</option>
                    </select>
                  </div>
                </div>

                <input
                  type="text"
                  aria-label="Search attendees" value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search by name, roll number, or student code"
                  className="w-full bg-surface-muted border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-slate-400 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                {loadingRecords ? (
                  <div className="py-8 text-center text-text-muted text-xs">Loading class roster…</div>
                ) : rosterError ? (
                  <div role="alert" className="space-y-2 py-4 text-sm">
                    <p>{rosterError}</p>
                    <Button size="sm" variant="secondary" onClick={() => loadSessionDetails(selectedSession.id)}>Retry roster</Button>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-xs border border-dashed border-border rounded-lg">
                    No students match this filter.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden max-h-[380px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted border-b border-border text-text-muted text-xs font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredRecords.map((r) => (
                          <tr key={r.student_id} className="hover:bg-surface-muted">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-text">{r.student_name}</div>
                              <div className="text-xs text-text-muted font-mono">
                                {r.roll_number || r.student_code}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {r.attendance_status === 'NOT_RECORDED' ? 'Unmarked' : (
                                <StatusBadge status={r.attendance_status} category="attendance" size="sm" />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {(r.record_id || selectedSession.status === 'ACTIVE') && (
                                <button
                                  onClick={() => {
                                    setSelectedRecord(r);
                                    const status = r.attendance_status.replace('MANUAL_', '');
                                    setOverrideStatus(status === 'LATE' || status === 'ABSENT' || status === 'EXCUSED' ? status : 'PRESENT');
                                    setOverrideRemarks('');
                                    setIsOverrideModalOpen(true);
                                  }}
                                  className="inline-flex min-h-9 items-center gap-1 rounded px-2 font-semibold text-primary hover:bg-surface-muted"
                                  aria-label={`${r.record_id ? 'Edit' : 'Mark'} attendance for ${r.student_name}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  {r.record_id ? 'Edit' : 'Mark'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>}
          </div>
        )}
      </Drawer>

      {/* 5. Create Session Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Attendance Session"
        subtitle="Schedule an attendance session from your official timetable or custom slot"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => setIsCreateModalOpen(false)}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              loading={creatingSession}
              variant="primary"
              size="sm"
            >
              Create Session
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center bg-surface-muted p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setCreationMode('timetable')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition ${
                creationMode === 'timetable'
                  ? 'bg-surface text-indigo-700 shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              From Timetable Slot
            </button>
            <button
              type="button"
              onClick={() => setCreationMode('custom')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition ${
                creationMode === 'custom'
                  ? 'bg-surface text-indigo-700 shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Custom Session
            </button>
          </div>

          {creationMode === 'timetable' ? (
            <div className="space-y-3">
              {/* Class & Date Selector */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Class</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      const cls = availableClasses.find((c) => c.id === e.target.value);
                      if (cls) {
                        setCreateForm((prev) => ({ ...prev, class_name: cls.name, class_id: cls.id }));
                      }
                    }}
                    className="w-full bg-surface-muted border border-border rounded-lg p-2 text-xs text-text"
                  >
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Date</label>
                  <input
                    type="date"
                    value={selectedTimetableDate}
                    onChange={(e) => {
                      setSelectedTimetableDate(e.target.value);
                      setCreateForm((prev) => ({ ...prev, scheduled_date: e.target.value }));
                    }}
                    className="w-full bg-surface-muted border border-border rounded-lg p-2 text-xs text-text"
                  />
                </div>
              </div>

              {/* Slot Picker */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Select Timetable Slot
                </label>
                {loadingTimetable ? (
                  <div className="py-6 text-center text-text-muted">Loading schedule...</div>
                ) : timetableSlots.length === 0 ? (
                  <div className="py-6 text-center text-text-muted border border-dashed border-border rounded-lg">
                    No timetable lectures scheduled for this date.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {timetableSlots.map((slot) => {
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <div
                          key={slot.id}
                          onClick={() => {
                            setSelectedSlot(slot);
                            const cls = availableClasses.find((c) => c.id === selectedClassId);
                            setCreateForm({
                              class_id: selectedClassId,
                              class_name: cls ? cls.name : 'TE-B',
                              timetable_entry_id: slot.id,
                              subject_id: slot.subject_id || '',
                              subject: slot.subject_name || slot.label,
                              room: slot.room || 'CR 26',
                              scheduled_date: selectedTimetableDate,
                              start_time: slot.start_time,
                              end_time: slot.end_time,
                              late_threshold_minutes: 10,
                              attendance_mode: 'AI_FACE_RECOGNITION',
                            });
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold'
                              : 'bg-surface border-border text-text hover:bg-surface-muted'
                          }`}
                        >
                          <div>
                            <div className="font-semibold">{slot.subject_name || slot.label}</div>
                            <div className="text-xs text-text-muted">
                              Room {slot.room} • {slot.start_time} – {slot.end_time}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Subject</label>
                <select
                  value={createForm.subject_id || ''}
                  onChange={(e) => {
                    const s = availableSubjects.find((sub) => sub.id === e.target.value);
                    setCreateForm((prev) => ({
                      ...prev,
                      subject_id: e.target.value,
                      subject: s ? s.name : prev.subject,
                    }));
                  }}
                  className="w-full bg-surface-muted border border-border rounded-lg p-2 text-xs text-text"
                >
                  <option value="">Select Subject</option>
                  {availableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Room</label>
                  <input
                    type="text"
                    value={createForm.room || ''}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, room: e.target.value }))}
                    className="w-full bg-surface-muted border border-border rounded-lg p-2 text-xs text-text"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 6. Manual Override Modal */}
      <Modal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title="Manual Attendance Override"
        subtitle={selectedRecord ? `${selectedRecord.student_name} (${selectedRecord.roll_number || selectedRecord.student_code})` : ''}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => setIsOverrideModalOpen(false)}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleOverrideSubmit}
              loading={overrideSubmitting}
              variant="primary"
              size="sm"
            >
              Save Override
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-xs font-semibold text-text mb-1.5">
              Attendance Status
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOverrideStatus(st)}
                  className={`py-2 rounded-lg border font-semibold text-xs transition ${
                    overrideStatus === st
                      ? st === 'PRESENT'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : st === 'LATE'
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-rose-50 border-rose-400 text-rose-800'
                      : 'bg-surface-muted border-border text-text-muted hover:bg-surface-muted'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              {selectedRecord?.record_id ? 'Reason for changing the mark (required)' : 'Remarks (optional)'}
            </label>
            <input
              type="text"
              aria-label="Override remarks" value={overrideRemarks}
              required={Boolean(selectedRecord?.record_id)}
              minLength={selectedRecord?.record_id ? 2 : undefined}
              onChange={(e) => setOverrideRemarks(e.target.value)}
              placeholder="e.g. Verified in classroom roll call"
              className="w-full bg-surface-muted border border-border rounded-lg p-2 text-xs text-text focus:bg-surface focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
