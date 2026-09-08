import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  Play,
  Square,
  Plus,
  ArrowLeft,
  RefreshCw,
  Edit3,
  X,
  CheckCircle2,
  Layers,
  Sparkles,
  Camera,
  BookOpen,
  Coffee,
  Check,
  ChevronRight,
  Info,
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

interface AttendancePageProps {
  onNavigate?: (tab: string) => void;
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ onNavigate }) => {
  // Session List State
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<string>('all'); // all, today, this_week

  // Selected Session Detail View
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false);
  const [recordFilterStatus, setRecordFilterStatus] = useState<string>('');

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

  // Custom / Form State
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

  // Manual Override / Excused Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('PRESENT');
  const [overrideRemarks, setOverrideRemarks] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  // Form error message & Conflict handling
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Multi-Photo Upload State
  const [uploadingPhotos, setUploadingPhotos] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedSessionId) return;
    const files = Array.from(e.target.files);
    
    setUploadingPhotos(true);
    let successCount = 0;
    
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Processing image ${i + 1} of ${files.length}...`);
        await recognizeImageAttendance(selectedSessionId, files[i]);
        successCount++;
      }
      setUploadProgress('');
      alert(`Successfully processed ${successCount} image(s). Roster updated.`);
      await loadSessionDetails(selectedSessionId);
    } catch (err: any) {
      alert(formatApiErrorMessage(err, "Error processing one or more photos."));
    } finally {
      setUploadingPhotos(false);
      setUploadProgress('');
      // reset file input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Helpers
  const getWeekdayName = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const isDateBeforeEffective = (dateStr: string) => {
    if (!dateStr) return false;
    return dateStr < '2026-06-15';
  };

  // Load Sessions
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

  // Load Reference Data (Subjects, Classes, Cameras)
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

      if (clsList.length > 0) {
        if (!selectedClassId) {
          setSelectedClassId(clsList[0].id);
        }
        if (!createForm.class_name) {
          setCreateForm((prev) => ({
            ...prev,
            class_name: clsList[0].name,
            class_id: clsList[0].id,
          }));
        }
      }
      if (subjList.length > 0 && !createForm.subject) {
        setCreateForm((prev) => ({
          ...prev,
          subject: subjList[0].name,
          subject_id: subjList[0].id,
        }));
      }
      if (camList.length > 0 && !createForm.camera_id) {
        setCreateForm((prev) => ({
          ...prev,
          camera_id: camList[0].id,
          camera_ids: [camList[0].id],
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

  // Load Timetable for Selected Class & Date
  const loadDayTimetable = useCallback(async () => {
    if (!selectedClassId || !selectedTimetableDate) return;
    if (isDateBeforeEffective(selectedTimetableDate)) {
      setTimetableSlots([]);
      return;
    }
    setLoadingTimetable(true);
    try {
      const entries = await fetchClassTimetable(selectedClassId, undefined, selectedTimetableDate);
      setTimetableSlots(entries);
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
  }, [isCreateModalOpen, creationMode, selectedClassId, selectedTimetableDate, loadDayTimetable]);

  // Load Selected Session Records
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

  // Open Create Session Modal
  const openCreateModal = () => {
    setErrorMessage(null);
    setConflictSessionId(null);
    setSelectedSlot(null);
    setCreationMode('timetable');
    if (availableClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(availableClasses[0].id);
    }
    setIsCreateModalOpen(true);
  };

  // Handle Start Session
  const handleStart = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      await loadSessions();
      if (selectedSessionId === sessionId) {
        loadSessionDetails(sessionId);
      }
      if (onNavigate) {
        onNavigate('live');
      }
    } catch (err) {
      alert('Failed to start session.');
    }
  };

  // Handle Close Session
  const handleClose = async (sessionId: string) => {
    if (
      window.confirm(
        'Are you sure you want to finalize and close this session? Any unverified enrolled students in this class will be automatically marked ABSENT.'
      )
    ) {
      try {
        await closeSession(sessionId, true);
        loadSessions();
        if (selectedSessionId === sessionId) {
          loadSessionDetails(sessionId);
        }
      } catch (err) {
        alert('Failed to close session.');
      }
    }
  };

  // Handle Selecting a Timetable Slot
  const handleSelectSlot = (slot: TimetableEntry) => {
    setSelectedSlot(slot);
    setErrorMessage(null);
    setConflictSessionId(null);

    const cls = availableClasses.find((c) => c.id === selectedClassId);
    const className = cls ? cls.name : 'TE-B';

    // Find best camera: matching room location if possible
    let bestCamId = availableCameras.length > 0 ? availableCameras[0].id : '';
    if (slot.room) {
      const roomMatch = availableCameras.find(
        (cam) =>
          cam.location.toLowerCase().includes(slot.room!.toLowerCase()) ||
          cam.name.toLowerCase().includes(slot.room!.toLowerCase())
      );
      if (roomMatch) {
        bestCamId = roomMatch.id;
      }
    }

    setCreateForm({
      class_id: selectedClassId,
      class_name: className,
      timetable_entry_id: slot.id,
      subject_id: slot.subject_id || '',
      subject: slot.subject_name || slot.label,
      room: slot.room || 'CR 26',
      scheduled_date: selectedTimetableDate,
      start_time: slot.start_time,
      end_time: slot.end_time,
      late_threshold_minutes: 10,
      attendance_mode: 'AI_FACE_RECOGNITION',
      camera_id: bestCamId,
      camera_ids: bestCamId ? [bestCamId] : [],
    });
  };

  // Handle Create Session Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setConflictSessionId(null);
    setCreatingSession(true);

    if (!createForm.class_name && !createForm.class_id) {
      setErrorMessage('Please select an academic class.');
      setCreatingSession(false);
      return;
    }
    if (!createForm.subject) {
      setErrorMessage('Please select an academic subject or timetable entry.');
      setCreatingSession(false);
      return;
    }

    try {
      const payload: SessionCreatePayload = {
        ...createForm,
        camera_ids: createForm.camera_id ? [createForm.camera_id] : [],
      };
      const created = await createSession(payload);
      setIsCreateModalOpen(false);
      setSelectedSlot(null);
      await loadSessions();
      setSelectedSessionId(created.id);
    } catch (err: any) {
      const msg = formatApiErrorMessage(err, 'Failed to schedule session.');
      setErrorMessage(msg);
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.details?.existing_session_id) {
        setConflictSessionId(detail.details.existing_session_id);
      }
    } finally {
      setCreatingSession(false);
    }
  };

  // Handle Manual Override / Excused Submit
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setOverrideSubmitting(true);
    try {
      await overrideRecord(selectedRecord.id, {
        status: overrideStatus as any,
        remarks: overrideRemarks || 'Faculty approved adjustment',
      });
      setIsOverrideModalOpen(false);
      setSelectedRecord(null);
      if (selectedSessionId) {
        loadSessionDetails(selectedSessionId);
      }
      loadSessions();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to update attendance record.'));
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const selectedWeekday = getWeekdayName(selectedTimetableDate);
  const isBeforeCurriculum = isDateBeforeEffective(selectedTimetableDate);
  const selectedClassObj = availableClasses.find((c) => c.id === selectedClassId);

  const handleAutoDetectCurrentSession = async () => {
    try {
      const activeEntry = await fetchCurrentTimetableEntry();
      if (activeEntry) {
        setSelectedClassId(activeEntry.class_id);
        setSelectedTimetableDate(new Date().toISOString().split('T')[0]);
        setCreationMode('timetable');
        setIsCreateModalOpen(true);
        // We trigger fetching the timetable, and user can just pick the highlighted one.
      }
    } catch (err: any) {
      alert("No active timetable slot detected for the current time/day.");
    }
  };

  return (
    <div className="space-y-6">
      {/* VIEW A: SESSION DETAIL VIEW */}
      {selectedSessionId && selectedSession ? (
        <div className="space-y-6">
          {/* Back button & Title Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedSessionId(null);
                  setSelectedSession(null);
                  setRecords([]);
                }}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span>{selectedSession.subject}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-100">
                    {selectedSession.class_name}
                  </span>
                  {selectedSession.subject_code && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono font-bold">
                      {selectedSession.subject_code}
                    </span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedSession.scheduled_date}</span>
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {selectedSession.start_time.slice(0, 5)} - {selectedSession.end_time.slice(0, 5)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedSession.room}</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 font-medium">Late threshold: {selectedSession.late_threshold_minutes} min</span>
                </div>
              </div>
            </div>

            {/* Session Action Buttons */}
            <div className="flex items-center gap-2">
              {selectedSession.status === 'SCHEDULED' && (
                <button
                  onClick={() => handleStart(selectedSession.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Live Attendance</span>
                </button>
              )}
              {selectedSession.status === 'ACTIVE' && (
                <>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('live')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>View Live Stream</span>
                    </button>
                  )}
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{uploadingPhotos ? uploadProgress : "Upload Photos"}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      className="hidden" 
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhotos}
                    />
                  </label>
                  <button
                    onClick={() => handleClose(selectedSession.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Finalize & Lock Session</span>
                  </button>
                </>
              )}
              <button
                onClick={() => loadSessionDetails(selectedSession.id)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                title="Refresh attendance roster"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Metrics Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Roster</div>
              <div className="text-xl font-black text-slate-800 mt-1">{selectedSession.total_records}</div>
            </div>
            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/60 shadow-sm text-center">
              <div className="text-[10px] uppercase font-bold text-emerald-600">Present</div>
              <div className="text-xl font-black text-emerald-700 mt-1">{selectedSession.present_count}</div>
            </div>
            <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/60 shadow-sm text-center">
              <div className="text-[10px] uppercase font-bold text-amber-600">Late</div>
              <div className="text-xl font-black text-amber-700 mt-1">{selectedSession.late_count}</div>
            </div>
            <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200/60 shadow-sm text-center">
              <div className="text-[10px] uppercase font-bold text-rose-600">Absent</div>
              <div className="text-xl font-black text-rose-700 mt-1">{selectedSession.absent_count}</div>
            </div>
            <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200/60 shadow-sm text-center">
              <div className="text-[10px] uppercase font-bold text-blue-600">Excused</div>
              <div className="text-xl font-black text-blue-700 mt-1">{selectedSession.excused_count}</div>
            </div>
          </div>

          {/* Student Records Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Attendance Roster</span>
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={recordFilterStatus}
                  onChange={(e) => setRecordFilterStatus(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="REVIEW_REQUIRED">REVIEW REQUIRED</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="EXCUSED">EXCUSED</option>
                </select>
              </div>
            </div>

            {loadingRecords ? (
              <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading attendance records...</span>
              </div>
            ) : records.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-1">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No Attendance Records Yet</p>
                <p className="text-[11px] text-slate-400">
                  Start the session to capture attendance via AI Face Recognition or manual mark.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Roll Number</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Time Logged</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">{r.student_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{r.roll_number || r.student_code}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status.includes('PRESENT')
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : r.status.includes('LATE')
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : r.status.includes('EXCUSED')
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : r.status.includes('REVIEW_REQUIRED')
                                ? 'bg-orange-50 text-orange-700 border border-orange-200 animate-pulse'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{r.source}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {r.first_seen ? new Date(r.first_seen).toLocaleTimeString() : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {r.confidence ? `${Math.round(r.confidence * 100)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right flex items-center justify-end gap-1">
                          {r.status === 'REVIEW_REQUIRED' && (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    await overrideRecord(r.id, { status: 'PRESENT', remarks: 'Faculty Approved from Review' });
                                    if (selectedSessionId) loadSessionDetails(selectedSessionId);
                                  } catch(e) { alert('Failed to update record'); }
                                }}
                                className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                title="Accept as Present"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await overrideRecord(r.id, { status: 'ABSENT', remarks: 'Faculty Rejected from Review' });
                                    if (selectedSessionId) loadSessionDetails(selectedSessionId);
                                  } catch(e) { alert('Failed to update record'); }
                                }}
                                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                title="Reject Match (Absent)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setSelectedRecord(r);
                              setOverrideStatus(r.status.replace('MANUAL_', ''));
                              setOverrideRemarks(r.remarks || '');
                              setIsOverrideModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Override Status Manually"
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
      ) : (
        /* VIEW B: SESSIONS LIST VIEW */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Attendance Sessions</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Schedule, monitor, and manage AI-driven attendance sessions directly from the college timetable.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoDetectCurrentSession}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Auto-Detect Current Class</span>
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Session</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Classes</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Courses</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="ACTIVE">ACTIVE (Live)</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>

              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
              </select>
            </div>

            <button
              onClick={loadSessions}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              title="Refresh Session List"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Sessions Grid */}
          {loading ? (
            <div className="bg-white rounded-2xl p-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2 border border-slate-200 shadow-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading attendance sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center text-slate-400 text-xs border border-slate-200 shadow-sm space-y-3">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="font-bold text-slate-700 text-sm">No Attendance Sessions Created</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Click "Create Session" to schedule an attendance event directly from your official TE-B timetable.
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create From Timetable</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:border-blue-300 transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
                        {s.class_name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                            : s.status === 'SCHEDULED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            s.status === 'ACTIVE'
                              ? 'bg-emerald-500'
                              : s.status === 'SCHEDULED'
                              ? 'bg-blue-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span>{s.status}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-base text-slate-900 leading-snug">{s.subject}</h3>
                      {s.subject_code && (
                        <p className="text-[11px] font-mono text-slate-400 font-medium">{s.subject_code}</p>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.scheduled_date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.room}</span>
                      </div>
                    </div>

                    {/* Quick Attendance Pill Metrics */}
                    <div className="grid grid-cols-4 gap-1.5 pt-2 text-center text-[10px] font-bold">
                      <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg">
                        <div>{s.present_count}</div>
                        <div className="text-[8px] uppercase text-emerald-500">Pres</div>
                      </div>
                      <div className="bg-amber-50 text-amber-700 p-1.5 rounded-lg">
                        <div>{s.late_count}</div>
                        <div className="text-[8px] uppercase text-amber-500">Late</div>
                      </div>
                      <div className="bg-rose-50 text-rose-700 p-1.5 rounded-lg">
                        <div>{s.absent_count}</div>
                        <div className="text-[8px] uppercase text-rose-500">Abs</div>
                      </div>
                      <div className="bg-slate-50 text-slate-700 p-1.5 rounded-lg">
                        <div>{s.total_records}</div>
                        <div className="text-[8px] uppercase text-slate-400">Total</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs gap-2">
                    <button
                      onClick={() => setSelectedSessionId(s.id)}
                      className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-center"
                    >
                      View Details
                    </button>
                    {s.status === 'SCHEDULED' && (
                      <button
                        onClick={() => handleStart(s.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm"
                      >
                        <Play className="w-3 h-3" />
                        <span>Start</span>
                      </button>
                    )}
                    {s.status === 'ACTIVE' && onNavigate && (
                      <button
                        onClick={() => onNavigate('live')}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-sm"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Live</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REDESIGNED MODAL: TIMETABLE-DRIVEN & CUSTOM CREATE SESSION */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            {/* Modal Header & Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <span>Create Attendance Session</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a timetable slot to auto-populate class schedule, or define a custom session.
                </p>
              </div>

              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode('timetable');
                    setSelectedSlot(null);
                    setErrorMessage(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    creationMode === 'timetable'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>From Timetable</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode('custom');
                    setSelectedSlot(null);
                    setErrorMessage(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    creationMode === 'custom'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Custom Session</span>
                </button>
              </div>
            </div>

            {/* Error & Duplicate Warning Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{errorMessage}</span>
                    {conflictSessionId && (
                      <p className="text-[11px] text-rose-600 mt-1">
                        An attendance session already exists for this slot. You can view or start it directly.
                      </p>
                    )}
                  </div>
                </div>
                {conflictSessionId && (
                  <button
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setSelectedSessionId(conflictSessionId);
                    }}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0"
                  >
                    View Session
                  </button>
                )}
              </div>
            )}

            {/* =================================================================== */}
            {/* MODE A: FROM TIMETABLE */}
            {/* =================================================================== */}
            {creationMode === 'timetable' && (
              <div className="space-y-4">
                {/* Step 1: Select Class and Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>Class / Section</span>
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        setSelectedClassId(e.target.value);
                        setSelectedSlot(null);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.department} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Scheduled Date</span>
                    </label>
                    <input
                      type="date"
                      value={selectedTimetableDate}
                      onChange={(e) => {
                        setSelectedTimetableDate(e.target.value);
                        setSelectedSlot(null);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Day Detection Header */}
                <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">
                      {selectedClassObj ? selectedClassObj.name : 'TE-B'} · {selectedWeekday} Schedule
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">
                      {selectedTimetableDate}
                    </span>
                  </div>
                  <span className="text-slate-400 text-[11px]">
                    Effective From: {selectedClassObj?.effective_from || '15/06/2026'}
                  </span>
                </div>

                {/* Effective Date Check Warning */}
                {isBeforeCurriculum ? (
                  <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs text-center space-y-1.5">
                    <Info className="w-6 h-6 text-amber-600 mx-auto" />
                    <p className="font-bold text-sm">No Timetable Available for this Date</p>
                    <p className="text-[11px] text-amber-700 max-w-md mx-auto">
                      The official curriculum schedule for TE-B is effective from{' '}
                      <span className="font-bold">15/06/2026</span>. Please select a date on or after this effective date.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Timetable Slots List */}
                    {loadingTimetable ? (
                      <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2 border border-slate-200 rounded-2xl">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Loading timetable schedule for {selectedWeekday}...</span>
                      </div>
                    ) : timetableSlots.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs border border-slate-200 rounded-2xl space-y-1">
                        <Calendar className="w-6 h-6 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-700">No Scheduled Classes for {selectedWeekday}</p>
                        <p className="text-[11px] text-slate-400">The college timetable does not have slots defined on this day.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {timetableSlots.map((slot) => {
                          const isSubject = slot.entry_type === 'SUBJECT';
                          const isBreak = slot.entry_type === 'BREAK';
                          const isActivity = slot.entry_type === 'ACTIVITY';
                          const isCurrentSelected = selectedSlot?.id === slot.id;

                          return (
                            <div
                              key={slot.id}
                              className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                                isCurrentSelected
                                  ? 'bg-blue-50/70 border-blue-500 shadow-sm ring-1 ring-blue-500'
                                  : isBreak
                                  ? 'bg-amber-50/50 border-amber-200/70 text-amber-800'
                                  : isActivity
                                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                                  : 'bg-white border-slate-200 hover:border-blue-300 shadow-xs'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-center min-w-[75px] py-1 px-2 rounded-xl bg-slate-100 border border-slate-200">
                                  <div className="text-xs font-black text-slate-800">
                                    {slot.start_time.slice(0, 5)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-semibold">
                                    {slot.end_time.slice(0, 5)}
                                  </div>
                                </div>

                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 text-xs">{slot.label}</span>
                                    {slot.batch && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200">
                                        Batch {slot.batch}
                                      </span>
                                    )}
                                    {slot.room && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px]">
                                        Room: {slot.room}
                                      </span>
                                    )}
                                  </div>

                                  {/* Subject Mapping Line */}
                                  {isSubject && (
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                      {slot.subject_code ? (
                                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          <span>Mapped: [{slot.subject_code}] {slot.subject_name}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">
                                          Timetable Entry (Unmapped Abbreviation)
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {isActivity && (
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                      <BookOpen className="w-3 h-3 text-slate-400" />
                                      <span>Activity Slot (Mentoring / Library / HM)</span>
                                    </div>
                                  )}

                                  {isBreak && (
                                    <div className="text-[11px] text-amber-700 flex items-center gap-1">
                                      <Coffee className="w-3 h-3 text-amber-600" />
                                      <span>Lunch Break (Recess)</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Slot Actions */}
                              <div>
                                {slot.has_existing_session ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsCreateModalOpen(false);
                                      if (slot.existing_session_id) {
                                        setSelectedSessionId(slot.existing_session_id);
                                      }
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Scheduled</span>
                                  </button>
                                ) : isSubject ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSlot(slot)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                                      isCurrentSelected
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                    }`}
                                  >
                                    <span>{isCurrentSelected ? 'Selected' : 'Select Slot'}</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-semibold text-slate-400 px-2 py-1">
                                    No Attendance
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Step 2: Slot Selected Configuration Drawer */}
                    {selectedSlot && (
                      <form
                        onSubmit={handleCreateSubmit}
                        className="bg-blue-50/40 p-4 rounded-2xl border border-blue-200 space-y-4 text-xs animate-in fade-in-50"
                      >
                        <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            <span>Confirm Session Parameters</span>
                          </div>
                          <span className="text-blue-700 font-bold text-[11px] bg-blue-100 px-2 py-0.5 rounded-md">
                            {selectedSlot.start_time} – {selectedSlot.end_time}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Subject Mapping Selector */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700">Subject / Course Name *</label>
                            {selectedSlot.subject_id ? (
                              <input
                                type="text"
                                readOnly
                                value={`[${selectedSlot.subject_code}] ${selectedSlot.subject_name}`}
                                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 cursor-not-allowed"
                              />
                            ) : (
                              <select
                                value={createForm.subject_id || ''}
                                onChange={(e) => {
                                  const subj = availableSubjects.find((s) => s.id === e.target.value);
                                  setCreateForm({
                                    ...createForm,
                                    subject_id: e.target.value,
                                    subject: subj ? subj.name : selectedSlot.label,
                                  });
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                              >
                                <option value="">Use Timetable Label ({selectedSlot.label})</option>
                                {availableSubjects.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    [{s.code}] {s.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          {/* Room / Hall */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700">Room / Hall *</label>
                            <input
                              type="text"
                              required
                              value={createForm.room}
                              onChange={(e) => setCreateForm({ ...createForm, room: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          {/* Camera Selection */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700 flex items-center justify-between">
                              <span>Camera Source</span>
                              {availableCameras.length === 0 && (
                                <span className="text-[10px] text-amber-700 font-bold">No camera configured</span>
                              )}
                            </label>
                            <select
                              value={createForm.camera_id || ''}
                              onChange={(e) =>
                                setCreateForm({
                                  ...createForm,
                                  camera_id: e.target.value,
                                  camera_ids: e.target.value ? [e.target.value] : [],
                                })
                              }
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            >
                              {availableCameras.length === 0 ? (
                                <option value="">No camera configured</option>
                              ) : (
                                availableCameras.map((cam) => {
                                  const isRoomMatch =
                                    selectedSlot.room &&
                                    (cam.location.toLowerCase().includes(selectedSlot.room.toLowerCase()) ||
                                      cam.name.toLowerCase().includes(selectedSlot.room.toLowerCase()));
                                  return (
                                    <option key={cam.id} value={cam.id}>
                                      {cam.name} ({cam.location}) {isRoomMatch ? '★ (Matches Room)' : ''}
                                    </option>
                                  );
                                })
                              )}
                            </select>
                          </div>

                          {/* Late Threshold */}
                          <div className="space-y-1">
                            <label className="font-bold text-slate-700">Late Threshold (Minutes)</label>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              value={createForm.late_threshold_minutes}
                              onChange={(e) =>
                                setCreateForm({
                                  ...createForm,
                                  late_threshold_minutes: parseInt(e.target.value) || 10,
                                })
                              }
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* Confirmation Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-blue-100">
                          <button
                            type="button"
                            onClick={() => setSelectedSlot(null)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
                          >
                            Change Slot
                          </button>
                          <button
                            type="submit"
                            disabled={creatingSession}
                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {creatingSession && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                            <span>Create Attendance Session</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}

            {/* =================================================================== */}
            {/* MODE B: CUSTOM SESSION */}
            {/* =================================================================== */}
            {creationMode === 'custom' && (
              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Class / Section */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Class / Section *</label>
                    <select
                      required
                      value={createForm.class_id || ''}
                      onChange={(e) => {
                        const cls = availableClasses.find((c) => c.id === e.target.value);
                        setCreateForm({
                          ...createForm,
                          class_id: e.target.value,
                          class_name: cls ? cls.name : '',
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Class</option>
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.department} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Subject Dropdown */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Subject / Course *</label>
                    <select
                      required
                      value={createForm.subject_id || ''}
                      onChange={(e) => {
                        const subj = availableSubjects.find((s) => s.id === e.target.value);
                        setCreateForm({
                          ...createForm,
                          subject_id: e.target.value,
                          subject: subj ? subj.name : '',
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Subject</option>
                      {availableSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          [{s.code}] {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Room & Scheduled Date */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Room / Hall *</label>
                    <input
                      type="text"
                      required
                      value={createForm.room}
                      onChange={(e) => setCreateForm({ ...createForm, room: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Scheduled Date *</label>
                    <input
                      type="date"
                      required
                      value={createForm.scheduled_date}
                      onChange={(e) => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Start & End Time */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Start Time *</label>
                    <input
                      type="time"
                      required
                      value={createForm.start_time}
                      onChange={(e) => setCreateForm({ ...createForm, start_time: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">End Time *</label>
                    <input
                      type="time"
                      required
                      value={createForm.end_time}
                      onChange={(e) => setCreateForm({ ...createForm, end_time: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Camera & Late Threshold */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Camera Source</label>
                    <select
                      value={createForm.camera_id || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          camera_id: e.target.value,
                          camera_ids: e.target.value ? [e.target.value] : [],
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">(Default Live Camera)</option>
                      {availableCameras.map((cam) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.name} ({cam.location})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Late Threshold (Minutes)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={createForm.late_threshold_minutes}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          late_threshold_minutes: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingSession}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {creatingSession && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Custom Session</span>
                  </button>
                </div>
              </form>
            )}

            {/* Modal Footer Close Button (when not confirmed) */}
            {!selectedSlot && creationMode === 'timetable' && (
              <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANUAL OVERRIDE / EXCUSED ABSENCE */}
      {/* ========================================================================= */}
      {isOverrideModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Override Attendance</h3>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-slate-600">
                <div className="font-bold text-slate-900">{selectedRecord.student_name}</div>
                <div className="text-[11px] font-mono">Roll: {selectedRecord.roll_number || selectedRecord.student_code}</div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Attendance Status</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="REVIEW_REQUIRED">REVIEW REQUIRED</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="EXCUSED">EXCUSED</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Faculty Remarks / Reason</label>
                <textarea
                  rows={2}
                  value={overrideRemarks}
                  onChange={(e) => setOverrideRemarks(e.target.value)}
                  placeholder="Enter reason for adjustment (e.g. Medical leave, On Duty)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm flex items-center gap-1"
                >
                  {overrideSubmitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>Save Override</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
