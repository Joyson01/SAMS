import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { apiClient } from '../../services/api';
import {
  closeSession, createSession, fetchSessionById, fetchSessions, fetchSessionRoster,
  markManualAttendance, startSession, SessionRosterResponse,
} from '../../services/attendanceApi';
import { fetchAllTimetableEntries, fetchClasses, fetchSubjects } from '../../services/subjectApi';
import { AttendanceSession } from '../../types/attendance';
import { ClassSection, Subject, TimetableEntry } from '../../types/subject';
import { formatApiErrorMessage } from '../../utils/apiError';

const button = 'rounded-lg border border-slate-300 px-4 py-2.5 font-medium disabled:opacity-50';
const primary = 'rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50';

type CaptureResponse = {
  marked: number;
  recognized: number;
  pending: number;
  review: number;
  faces: number;
  quality: string;
  message_code: string;
};

function Capture({ sessionId, pairing, onCapture }: {
  sessionId: string;
  pairing?: string;
  onCapture?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream>();
  const running = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const request = useRef<AbortController>();
  const scannerId = useRef(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const releaseCamera = () => {
    running.current = false;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = undefined;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseCamera();
      request.current?.abort();
    };
  }, []);

  const upload = async (image: Blob, mode: 'live' | 'photo') => {
    const controller = new AbortController();
    request.current = controller;
    const { data } = await apiClient.post<CaptureResponse>(
      `/phone-attendance/${sessionId}/capture`, image, {
        signal: controller.signal,
        headers: {
          'Content-Type': image.type || 'application/octet-stream',
          'X-Capture-Mode': mode,
          'X-Scanner-ID': scannerId.current,
          ...(pairing ? { 'X-Attendance-Pairing': pairing } : {}),
        },
      },
    );
    if (!mounted.current) return;
    const feedback: Record<string, string> = {
      TOO_DARK: 'The image is too dark. Face the light and try again.',
      BLURRY: 'The image is blurry. Hold the phone steady and try again.',
      FACE_TOO_SMALL: 'Faces are too small. Move closer and try again.',
      LOW_QUALITY: 'Faces are unclear. Improve the light and hold the phone steady.',
      NO_FACE: 'No faces found. Aim at the class and try again.',
      PENDING_EVIDENCE: 'Face seen once. Keep the camera steady for confirmation.',
      AMBIGUOUS: 'A close match needs lecturer review. Check who is left.',
    };
    setMessage(data.marked ? `${data.marked} newly marked present.`
      : feedback[data.message_code] || (data.recognized
        ? 'Recognized students are already recorded.' : 'No confident match. Try moving closer.'));
    if (data.marked && navigator.vibrate) navigator.vibrate(80);
    onCapture?.();
  };

  const scan = async () => {
    if (pending.current) return;
    pending.current = true;
    running.current = true;
    setLive(true);
    setMessage('');
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this page over HTTPS to use live scan.');
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false,
      });
      if (!running.current) {
        camera.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = camera;
      if (!video.current) return;
      video.current.srcObject = camera;
      await video.current.play();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Live scan is unavailable in this browser.');
      while (running.current) {
        const preview = video.current;
        if (!preview || camera.getVideoTracks().every(track => track.readyState === 'ended')) {
          throw new Error('The camera disconnected. Start the scan again.');
        }
        if (preview.videoWidth) {
          const scale = Math.min(1, 1600 / preview.videoWidth);
          canvas.width = Math.round(preview.videoWidth * scale);
          canvas.height = Math.round(preview.videoHeight * scale);
          context.drawImage(preview, 0, 0, canvas.width, canvas.height);
          const frame = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
          if (frame && running.current) await upload(frame, 'live');
        }
        if (running.current) await new Promise(resolve => window.setTimeout(resolve, 700));
      }
    } catch (err) {
      if (mounted.current && running.current) {
        setError(formatApiErrorMessage(err, 'Camera unavailable. Check permissions or take a photo.'));
      }
    } finally {
      releaseCamera();
      pending.current = false;
      if (mounted.current) setLive(false);
    }
  };

  const takePhoto = async (image: File) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await upload(image, 'photo');
    } catch (err) {
      if (mounted.current) setError(formatApiErrorMessage(err, 'Photo could not be processed. Try again.'));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <div className="grid grid-cols-2 gap-2">
        <button className={primary} disabled={busy} onClick={live ? () => { releaseCamera(); request.current?.abort(); } : scan}>
          {live ? 'Stop scan' : 'Scan class'}
        </button>
        <label className={`${button} relative text-center ${busy || live ? 'opacity-50' : 'cursor-pointer'}`}>
          {busy ? 'Processing…' : 'Take photo'}
          <input aria-label="Take photo" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || live}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void takePhoto(file);
            }} />
        </label>
      </div>
      <video ref={video} muted playsInline className={live ? 'max-h-80 w-full rounded-lg bg-slate-900' : 'hidden'} />
      {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}

export function PairedAttendancePage() {
  const sessionId = new URLSearchParams(window.location.search).get('session');
  const pairing = useRef(new URLSearchParams(window.location.hash.slice(1)).get('pair'));
  useEffect(() => {
    if (pairing.current) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 text-slate-900">
      <h1 className="text-2xl font-semibold">Class attendance</h1>
      {pairing.current && sessionId
        ? <Capture sessionId={sessionId} pairing={pairing.current} />
        : <p>Scan the pairing QR code from the open attendance session.</p>}
    </main>
  );
}

export function PhoneAttendancePage({ onLogout }: { onLogout: () => void }) {
  const [session, setSession] = useState<AttendanceSession>();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [slots, setSlots] = useState<TimetableEntry[]>([]);
  const [custom, setCustom] = useState(false);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [roster, setRoster] = useState<SessionRosterResponse>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [qr, setQr] = useState('');
  const [review, setReview] = useState(false);
  const [rosterView, setRosterView] = useState<'unresolved' | 'all'>('unresolved');
  const [rosterSearch, setRosterSearch] = useState('');
  const currentSessionId = useRef<string>();
  const initialId = useRef(new URLSearchParams(window.location.search).get('session'));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const campusTime = (value: Date) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(value);
  const dateParts = today.formatToParts();
  const date = ['year', 'month', 'day'].map(part => dateParts.find(value => value.type === part)?.value).join('-');
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format();

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (err) { setError(formatApiErrorMessage(err, 'Could not complete that action. Try again.')); }
    finally { setBusy(false); }
  };

  const loadClasses = async () => {
    const loadSessions = async () => {
      const pageSize = 100;
      const list: AttendanceSession[] = [];
      for (let page = 1; ; page += 1) {
        const rows = await fetchSessions({ scheduled_date: date, page, page_size: pageSize });
        list.push(...rows);
        if (rows.length < pageSize) return list;
      }
    };
    const [list, entries] = await Promise.all([loadSessions(), fetchAllTimetableEntries(undefined, weekday, date)]);
    setSessions(list);
    setSlots(entries.filter(slot => slot.entry_type === 'SUBJECT' && slot.status === 'ACTIVE'));
  };

  useEffect(() => {
    void perform(async () => {
      if (initialId.current) setSession(await fetchSessionById(initialId.current));
      else await loadClasses();
    });
  }, []);

  const sessionId = session?.id;
  currentSessionId.current = sessionId;
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [next, rows] = await Promise.all([fetchSessionById(sessionId), fetchSessionRoster(sessionId)]);
        if (!cancelled) {
          setSession(previous => previous?.status === 'COMPLETED' ? previous : next);
          setRoster(rows);
        }
      } catch (err) {
        if (!cancelled) setError(formatApiErrorMessage(err, 'Could not refresh the roster.'));
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [sessionId]);

  const open = async (item: AttendanceSession) => {
    setCustom(false);
    setSession(item.status === 'SCHEDULED' ? await startSession(item.id) : item);
    setRoster(undefined);
    setReview(false);
    setConfirm(false);
    setQr('');
    window.history.replaceState(null, '', `/phone-attendance?session=${encodeURIComponent(item.id)}`);
  };

  const startSlot = (slot: TimetableEntry) => perform(async () => {
    if (slot.existing_session_id) {
      await open(await fetchSessionById(slot.existing_session_id));
      return;
    }
    const item = await createSession({
      timetable_entry_id: slot.id, class_id: slot.class_id, subject_id: slot.subject_id,
      class_name: slot.class_name || slot.class_id, subject: slot.subject_name || slot.label,
      room: slot.room || 'Classroom', scheduled_date: date, start_time: slot.start_time, end_time: slot.end_time,
    });
    await open(item);
  });

  const startCustom = () => perform(async () => {
    const group = classes.find(item => item.id === classId);
    const subject = subjects.find(item => item.id === subjectId);
    if (!group || !subject) return;
    const now = new Date();
    const start = campusTime(now);
    const end = campusTime(new Date(now.getTime() + 60 * 60 * 1000));
    await open(await createSession({
      class_name: group.name, class_id: group.id, subject: subject.name, subject_id: subject.id,
      room: 'Classroom', scheduled_date: date, start_time: start,
      end_time: end > start ? end : '23:59:59',
    }));
  });

  const needsReview = (status: string) => status === 'NOT_RECORDED' || status === 'REVIEW_REQUIRED';
  const unmarked = roster?.roster.filter(student => needsReview(student.attendance_status)).length ?? 0;
  const remaining = roster?.roster.filter(student => needsReview(student.attendance_status)).length;
  const displayedRoster = roster?.session_id === sessionId ? roster : undefined;
  const visibleStudents = displayedRoster?.roster.filter(student => {
    const query = rosterSearch.trim().toLowerCase();
    const matches = session?.status === 'COMPLETED' || !query
      || `${student.student_name} ${student.roll_number}`.toLowerCase().includes(query);
    return matches && (session?.status === 'COMPLETED' || rosterView === 'all' || needsReview(student.attendance_status));
  }) ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-4 bg-slate-50 p-4 text-slate-900 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <a href="/" className="text-sm font-medium text-blue-700">Workspace</a>
        <button className={button} onClick={onLogout}>Sign out</button>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!session ? <>
        <h1 className="text-2xl font-bold">Today’s classes</h1>
        {busy && <p role="status">Loading classes…</p>}
        {sessions.filter(item => !['CANCELLED', 'COMPLETED'].includes(item.status))
          .sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))
          .map(item => (
          <button key={item.id} disabled={busy} className={`${button} block w-full bg-white text-left`}
            onClick={() => void perform(() => open(item))}>
            <span className="block">{item.class_name} · {item.subject}</span>
            <span className="text-sm text-slate-600">{item.status === 'ACTIVE' ? 'Resume attendance' : item.start_time.slice(0, 5)}</span>
          </button>
        ))}
        {slots.filter(slot => !sessions.some(item => item.timetable_entry_id === slot.id || item.id === slot.existing_session_id)).map(slot => (
          <button key={slot.id} disabled={busy} className={`${button} block w-full bg-white text-left`} onClick={() => void startSlot(slot)}>
            <span className="block">{slot.class_name} · {slot.subject_name || slot.label}</span>
            <span className="text-sm text-slate-600">{slot.start_time.slice(0, 5)}</span>
          </button>
        ))}
        {!busy && !sessions.length && !slots.length && <p className="text-sm text-slate-600">No classes are scheduled today.</p>}
        {custom ? <form className="space-y-3 rounded-xl border bg-white p-4" onSubmit={event => {
          event.preventDefault();
          void startCustom();
        }}>
          <label className="block text-sm font-medium">Class
            <select className={`${button} mt-1 block w-full bg-white`} value={classId}
              onChange={event => setClassId(event.target.value)} required>
              <option value="">Choose a class</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Subject
            <select className={`${button} mt-1 block w-full bg-white`} value={subjectId}
              onChange={event => setSubjectId(event.target.value)} required>
              <option value="">Choose a subject</option>
              {subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button className={primary} disabled={busy || !classId || !subjectId}>Start attendance</button>
            <button type="button" className={button} onClick={() => setCustom(false)}>Cancel</button>
          </div>
        </form> : <button className={button} disabled={busy} onClick={() => void perform(async () => {
          const [groups, availableSubjects] = await Promise.all([fetchClasses(undefined, undefined, 'ACTIVE'), fetchSubjects(undefined, undefined, 'ACTIVE')]);
          setClasses(groups);
          setSubjects(availableSubjects);
          setCustom(true);
        })}>Start an unscheduled class</button>}
      </> : <>
        <button className="text-sm font-medium text-blue-700" onClick={() => {
          setSession(undefined); setRoster(undefined); setQr(''); setConfirm(false);
          window.history.replaceState(null, '', '/phone-attendance');
          void perform(loadClasses);
        }}>Today’s classes</button>
        <h1 className="text-2xl font-bold">{session.subject}</h1>
        <p className="text-sm text-slate-600">{session.class_name} · {session.room}</p>
        {session.status === 'SCHEDULED' && <button className={primary} disabled={busy} onClick={() => void perform(() => open(session))}>Start attendance</button>}
        {session.status === 'ACTIVE' && !review && <>
          <Capture key={session.id} sessionId={session.id} onCapture={() => {
            void fetchSessionRoster(session.id).then(next => {
              if (currentSessionId.current === next.session_id) setRoster(next);
            }).catch(() => {});
          }} />
          <button className={button} disabled={busy} onClick={() => void perform(async () => {
            const response = await apiClient.post<{ token: string }>(`/phone-attendance/${session.id}/pair`);
            const link = new URL('/attendance-capture', window.location.origin);
            link.searchParams.set('session', session.id);
            link.hash = new URLSearchParams({ pair: response.data.token }).toString();
            setQr(await QRCode.toDataURL(link.toString(), { width: 240 }));
          })}>{qr ? 'Refresh pairing code' : 'Pair phone'}</button>
          {qr && <figure className="rounded-xl border bg-white p-4">
            <img src={qr} alt="Scan this QR code with the phone camera" width="240" height="240" />
            <figcaption className="text-sm text-slate-600">Scan with your phone. The code expires in 15 minutes.</figcaption>
          </figure>}
        </>}
        {displayedRoster && <p className="rounded-xl border bg-white p-4 font-semibold" aria-live="polite">
          {displayedRoster.present_count + displayedRoster.late_count} of {displayedRoster.total_enrolled} present
          {remaining ? ` · ${remaining} to review` : ''}
        </p>}
        {session.status === 'COMPLETED' && <p role="status" className="font-semibold text-green-800">Attendance saved.</p>}
        {session.status === 'ACTIVE' && <button className={review ? button : primary} disabled={!displayedRoster}
          onClick={() => { setReview(!review); setConfirm(false); setQr(''); }}>
          {review ? 'Back to capture' : 'Review roster'}
        </button>}
        {(review || session.status === 'COMPLETED') && displayedRoster && <>
          {session.status === 'ACTIVE' && <div className="space-y-3 rounded-xl border bg-white p-3">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Roster view">
              <button className={rosterView === 'unresolved' ? primary : button} onClick={() => setRosterView('unresolved')}>
                Who’s left ({remaining ?? 0})
              </button>
              <button className={rosterView === 'all' ? primary : button} onClick={() => setRosterView('all')}>
                All students ({displayedRoster.total_enrolled})
              </button>
            </div>
            <label className="block text-sm font-medium">Find by name or roll number
              <input className={`${button} mt-1 block w-full bg-white font-normal`} type="search"
                value={rosterSearch} onChange={event => setRosterSearch(event.target.value)}
                placeholder="Start typing…" />
            </label>
          </div>}
          <ul className="divide-y rounded-xl border bg-white">
            {[...visibleStudents].sort((a, b) => Number(needsReview(b.attendance_status)) - Number(needsReview(a.attendance_status))).map(student => (
              <li key={student.student_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">{student.student_name}</p>
                  <p className="text-sm capitalize text-slate-600">{student.roll_number} · {student.attendance_status.toLowerCase().replace(/_/g, ' ')}</p>
                </div>
                {session.status === 'ACTIVE' && <div className="flex gap-2">
                  {['PRESENT', 'ABSENT'].map(status => (
                    <button key={status} className={`${button} text-sm capitalize`} disabled={busy}
                      aria-label={`Mark ${student.student_name} ${status.toLowerCase()}`}
                      onClick={() => void perform(async () => {
                        await markManualAttendance(session.id, student.student_id, `MANUAL_${status}`);
                        setRoster(await fetchSessionRoster(session.id));
                      })}>{status.toLowerCase()}</button>
                  ))}
                </div>}
              </li>
            ))}
            {!visibleStudents.length && <li className="p-4 text-sm text-slate-600">
              {rosterSearch ? 'No students match that search.' : session.status === 'COMPLETED'
                ? 'No students were enrolled in this session.' : 'Everyone is resolved. You can finish attendance.'}
            </li>}
          </ul>
          {session.status === 'ACTIVE' && review && <button className={button} onClick={() => setReview(false)}>Rescan class</button>}
          {session.status === 'ACTIVE' && (confirm ? <div className="space-y-3 rounded-xl border bg-white p-4">
            <p>{unmarked} unmarked students will be recorded absent. Save attendance?</p>
            <div className="flex gap-2">
              <button className={primary} disabled={busy} onClick={() => void perform(async () => {
                setSession(await closeSession(session.id));
                setRoster(await fetchSessionRoster(session.id));
                setConfirm(false);
              })}>Save attendance</button>
              <button className={button} disabled={busy} onClick={() => setConfirm(false)}>Keep reviewing</button>
            </div>
          </div> : <button className={primary} disabled={busy} onClick={() => setConfirm(true)}>Finish attendance</button>)}
        </>}
      </>}
    </main>
  );
}
