import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Upload,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import {
  fetchSessions,
  fetchSessionById,
  createSession,
  startSession,
  closeSession,
  fetchSessionRecords,
  overrideRecord,
  recognizeImageAttendance,
} from '../../services/attendanceApi';
import { fetchSubjects, fetchClasses, fetchClassTimetable } from '../../services/subjectApi';
import { fetchCameras } from '../../services/cameraApi';
import { formatApiErrorMessage } from '../../utils/apiError';
import { fetchCurrentTimetableEntry } from '../../services/timetableApi';
import {
  AttendanceRecord,
  AttendanceSession,
  SessionCreatePayload,
} from '../../types/attendance';
import { Subject, ClassSection, TimetableEntry } from '../../types/subject';
import { CameraDevice } from '../../types/camera';
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

interface AttendancePageProps {
  onNavigate?: (tab: string) => void;
}

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

export const AttendancePage: React.FC<AttendancePageProps> = ({ onNavigate }) => {
  // Session List State
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<string>('all'); // all, today

  // Selected Session Drawer
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false);
  const [recordFilterStatus, setRecordFilterStatus] = useState<string>('');
  const [recordSearch, setRecordSearch] = useState<string>('');

  // Dropdown reference data
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassSection[]>([]);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);

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
    camera_id: '',
  });

  // Manual Override Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<
    'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT' | 'MANUAL_EXCUSED'
  >('PRESENT');
  const [overrideRemarks, setOverrideRemarks] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  // Form error message
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Multi-Photo Upload State
  const [uploadingPhotos, setUploadingPhotos] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

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
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterSubject, filterStatus, filterDateRange]);

  const loadReferenceData = async () => {
    try {
      const [subjList, clsList, camList] = await Promise.all([
        fetchSubjects(undefined, undefined, 'ACTIVE'),
        fetchClasses(undefined, undefined, 'ACTIVE'),
        fetchCameras(),
      ]);
      setAvailableSubjects(subjList);
      setAvailableClasses(clsList);
      setAvailableCameras(camList);

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

  // Load Selected Session Details & Records
  const loadSessionDetails = useCallback(async (sessionId: string) => {
    setLoadingRecords(true);
    try {
      const [sess, recList] = await Promise.all([
        fetchSessionById(sessionId),
        fetchSessionRecords(sessionId, recordFilterStatus || undefined),
      ]);
      setSelectedSession(sess);
      setRecords(recList);
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoadingRecords(false);
    }
  }, [recordFilterStatus]);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetails(selectedSessionId);
    }
  }, [selectedSessionId, loadSessionDetails]);

  // Auto Detect Current Class Action
  const handleAutoDetectCurrentClass = async () => {
    try {
      const activeEntry = await fetchCurrentTimetableEntry();
      if (!activeEntry) {
        alert('No scheduled class found for the current time slot.');
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
        if (existing.status === 'ACTIVE') {
          if (onNavigate) onNavigate('live');
        } else {
          setSelectedSessionId(existing.id);
        }
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
          camera_id: availableCameras[0]?.id || '',
        });
        setIsCreateModalOpen(true);
      }
    } catch (err) {
      console.error('Error auto detecting class:', err);
      alert('Unable to auto-detect class schedule.');
    }
  };

  // Start / Close Actions
  const handleStart = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      await loadSessions();
      if (onNavigate) onNavigate('live');
    } catch (err) {
      alert('Failed to start session.');
    }
  };

  const handleClose = async (sessionId: string) => {
    if (
      window.confirm(
        'Are you sure you want to end and finalize this attendance session? Remaining unverified students will be marked absent.'
      )
    ) {
      try {
        await closeSession(sessionId, true);
        await loadSessions();
        if (selectedSessionId === sessionId) {
          loadSessionDetails(sessionId);
        }
      } catch (err) {
        alert('Failed to close session.');
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
      await loadSessions();
      setSelectedSessionId(newSession.id);
    } catch (err: any) {
      setErrorMessage(formatApiErrorMessage(err, 'Failed to create session.'));
    } finally {
      setCreatingSession(false);
    }
  };

  // Photo Upload Handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedSessionId) return;
    const files = Array.from(e.target.files);

    setUploadingPhotos(true);
    let successCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Processing photo ${i + 1} of ${files.length}...`);
        await recognizeImageAttendance(selectedSessionId, files[i]);
        successCount++;
      }
      alert(`Successfully processed ${successCount} classroom photo(s). Roster updated.`);
      await loadSessionDetails(selectedSessionId);
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Error processing one or more photos.'));
    } finally {
      setUploadingPhotos(false);
      setUploadProgress('');
      if (e.target) e.target.value = '';
    }
  };

  // Manual Override Record Submit
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    setOverrideSubmitting(true);
    try {
      await overrideRecord(selectedRecord.id, {
        status: overrideStatus,
        remarks: overrideRemarks || 'Faculty manual adjustment',
      });
      setIsOverrideModalOpen(false);
      if (selectedSessionId) {
        loadSessionDetails(selectedSessionId);
      }
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to override attendance status.'));
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Filtered records in drawer
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch =
        !recordSearch ||
        r.student_name.toLowerCase().includes(recordSearch.toLowerCase()) ||
        (r.roll_number && r.roll_number.toLowerCase().includes(recordSearch.toLowerCase()));
      const matchesStatus =
        !recordFilterStatus || r.status.toUpperCase().includes(recordFilterStatus.toUpperCase());
      return matchesSearch && matchesStatus;
    });
  }, [records, recordSearch, recordFilterStatus]);

  // Active session stats
  const drawerStats = useMemo(() => {
    if (!records.length) {
      return { present: 0, late: 0, absent: 0, total: 0, rate: 0 };
    }
    const present = records.filter(
      (r) => r.status === 'PRESENT' || r.status === 'MANUAL_PRESENT'
    ).length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const absent = records.filter((r) => r.status === 'ABSENT' || r.status === 'MANUAL_ABSENT').length;
    const total = records.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, total, rate };
  }, [records]);

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Attendance
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Schedule, monitor and manage attendance sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleAutoDetectCurrentClass}
            variant="secondary"
            size="sm"
            icon={<Sparkles className="w-3.5 h-3.5 text-blue-600" />}
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
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Class Filter */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs truncate"
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
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active (Live)</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Date Filter */}
          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </IconButton>
      </div>

      {/* 3. Compact Sessions Table */}
      {loading ? (
        <div className="bg-white rounded-lg p-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2 border border-slate-200 shadow-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Loading attendance sessions...</span>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6 text-slate-400" />}
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
                  <TableCell className="font-bold text-slate-900">{sess.class_name}</TableCell>
                  <TableCell className="font-semibold text-slate-800">{sess.subject}</TableCell>
                  <TableCell className="text-slate-500">{sess.room || 'CR 26'}</TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">
                    <span>{sess.scheduled_date}</span>
                    <span className="text-slate-400"> • </span>
                    <span>{formatDisplayTime(sess.start_time)}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sess.status} category="session" size="sm" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-700">
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
                        <Button
                          onClick={() => onNavigate && onNavigate('live')}
                          variant="primary"
                          size="sm"
                          icon={<Eye className="w-3.5 h-3.5" />}
                        >
                          Open Live
                        </Button>
                      ) : isScheduled ? (
                        <Button
                          onClick={() => handleStart(sess.id)}
                          variant="secondary"
                          size="sm"
                          icon={<Play className="w-3 h-3 text-blue-600 fill-current" />}
                        >
                          Start
                        </Button>
                      ) : null}

                      <Button
                        onClick={() => setSelectedSessionId(sess.id)}
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
                          <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                        </IconButton>

                        {activeMenuSessionId === sess.id && (
                          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                            <button
                              onClick={() => {
                                setActiveMenuSessionId(null);
                                setSelectedSessionId(sess.id);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                            >
                              <Users className="w-3.5 h-3.5 text-slate-400" />
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
        onClose={() => setSelectedSessionId(null)}
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
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>{uploadingPhotos ? uploadProgress : 'Upload Photo'}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhotos}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
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
                  onClick={() => setSelectedSessionId(null)}
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
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Total</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{drawerStats.total}</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 uppercase font-semibold">Present</div>
                <div className="font-bold text-emerald-600 text-sm mt-0.5">{drawerStats.present}</div>
              </div>
              <div>
                <div className="text-[10px] text-amber-600 uppercase font-semibold">Late</div>
                <div className="font-bold text-amber-600 text-sm mt-0.5">{drawerStats.late}</div>
              </div>
              <div>
                <div className="text-[10px] text-rose-600 uppercase font-semibold">Absent</div>
                <div className="font-bold text-rose-600 text-sm mt-0.5">{drawerStats.absent}</div>
              </div>
            </div>

            {/* Attendance Rate */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Attendance Rate</span>
                <span className="font-bold text-slate-900">{drawerStats.rate}%</span>
              </div>
              <Progress value={drawerStats.rate} max={100} size="sm" variant="auto" />
            </div>

            {/* Records Section */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Attendance Records ({filteredRecords.length})
                </h4>
                <div className="flex items-center gap-1.5">
                  <select
                    value={recordFilterStatus}
                    onChange={(e) => setRecordFilterStatus(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="">All Statuses</option>
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>
              </div>

              <input
                type="text"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Search attendee by name or roll..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {loadingRecords ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading records...</div>
              ) : filteredRecords.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                  No attendance records found for this filter.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-semibold sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Confidence</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800">{r.student_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {r.roll_number || r.student_code}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={r.status} category="attendance" size="sm" />
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500 text-[11px]">
                            {r.confidence ? `${Math.round(r.confidence * 100)}%` : 'Manual'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => {
                                setSelectedRecord(r);
                                setOverrideStatus(
                                  (r.status.replace('MANUAL_', '') as any) || 'PRESENT'
                                );
                                setOverrideRemarks(r.remarks || '');
                                setIsOverrideModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                              title="Manual Override"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setCreationMode('timetable')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition ${
                creationMode === 'timetable'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              From Timetable Slot
            </button>
            <button
              type="button"
              onClick={() => setCreationMode('custom')}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs transition ${
                creationMode === 'custom'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Class</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      const cls = availableClasses.find((c) => c.id === e.target.value);
                      if (cls) {
                        setCreateForm((prev) => ({ ...prev, class_name: cls.name, class_id: cls.id }));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
                  >
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={selectedTimetableDate}
                    onChange={(e) => {
                      setSelectedTimetableDate(e.target.value);
                      setCreateForm((prev) => ({ ...prev, scheduled_date: e.target.value }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Slot Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Timetable Slot
                </label>
                {loadingTimetable ? (
                  <div className="py-6 text-center text-slate-400">Loading schedule...</div>
                ) : timetableSlots.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
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
                              camera_id: availableCameras[0]?.id || '',
                            });
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="font-bold">{slot.subject_name || slot.label}</div>
                            <div className="text-[10px] text-slate-500">
                              Room {slot.room} • {slot.start_time} – {slot.end_time}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Room</label>
                  <input
                    type="text"
                    value={createForm.room || ''}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, room: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Camera</label>
                  <select
                    value={createForm.camera_id || ''}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, camera_id: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
                  >
                    {availableCameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.name} ({cam.location})
                      </option>
                    ))}
                  </select>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Attendance Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['PRESENT', 'LATE', 'ABSENT'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOverrideStatus(st as any)}
                  className={`py-2 rounded-lg border font-semibold text-xs transition ${
                    overrideStatus === st
                      ? st === 'PRESENT'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : st === 'LATE'
                        ? 'bg-amber-50 border-amber-400 text-amber-800'
                        : 'bg-rose-50 border-rose-400 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks / Justification
            </label>
            <input
              type="text"
              value={overrideRemarks}
              onChange={(e) => setOverrideRemarks(e.target.value)}
              placeholder="e.g. Verified in classroom roll call"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
