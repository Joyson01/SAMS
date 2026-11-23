import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Upload } from 'lucide-react';
import { FrameResult, WebcamPanel } from '../../components/camera/WebcamPanel';
import { Button } from '../../components/ui';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

export type StudentRequest = {
  id: string;
  kind: 'CORRECTION' | 'FACE_REGISTER' | 'FACE_UPDATE' | 'LEAVE' | 'MEDICAL' | 'ON_DUTY';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  record_id: string | null;
  requested_status: string | null;
  reason: string | null;
  pose: string | null;
  review_note: string | null;
};

export type RequestState = {
  items: StudentRequest[];
  existing_poses: string[];
  required_poses: string[];
  hints: Record<string, string>;
};

type ReviewItem = StudentRequest & {
  student_name: string;
  student_pid: string;
  current_status: string | null;
  subject: string | null;
  date: string | null;
};

export const fieldClass = 'mt-2 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-text';
const marks = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const label = (value: string) => value.replace(/_/g, ' ').toLowerCase();
const requestLabels: Record<StudentRequest['kind'], string> = {
  CORRECTION: 'Attendance correction',
  FACE_REGISTER: 'Face registration',
  FACE_UPDATE: 'Face update',
  LEAVE: 'Leave request',
  MEDICAL: 'Medical request',
  ON_DUTY: 'On-duty request',
};

export function CorrectionForm({ record, request, onSaved }: {
  record: { id: string; status: string };
  request?: StudentRequest;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState<StudentRequest['kind']>('CORRECTION');
  const recordedAbsence = record.status.replace(/^MANUAL_/, '') === 'ABSENT';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return <div className="basis-full text-sm">
    {request && <p className="mb-2">{requestLabels[request.kind]} · {label(request.status)}{request.review_note && ` · ${request.review_note}`}</p>}
    {request?.status !== 'PENDING' && (
      <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Request a change'}</Button>
    )}
    {open && request?.status !== 'PENDING' && <form className="mt-3 max-w-md space-y-3" onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setError('');
      try {
        await apiClient.post('/student-portal/corrections', { record_id: record.id, requested_status: kind === 'CORRECTION' ? status : 'EXCUSED', reason, kind });
        setOpen(false);
        setStatus('');
        setKind('CORRECTION');
        setReason('');
        onSaved();
      } catch (err) {
        setError(formatApiErrorMessage(err, 'Could not submit your request.'));
      } finally {
        setBusy(false);
      }
    }}>
      {recordedAbsence && (
        <label className="block">Request type
          <select className={fieldClass} value={kind} onChange={event => setKind(event.target.value as StudentRequest['kind'])}>
            {(['CORRECTION', 'LEAVE', 'MEDICAL', 'ON_DUTY'] as const).map(value => (
              <option key={value} value={value}>{requestLabels[value]}</option>
            ))}
          </select>
        </label>
      )}
      {kind === 'CORRECTION' && <label className="block">Requested mark
        <select required className={fieldClass} value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Choose a mark</option>
          {marks.filter(mark => mark !== record.status.replace(/^MANUAL_/, '')).map(mark => (
            <option value={mark} key={mark}>{label(mark)}</option>
          ))}
        </select>
      </label>}
      <label className="block">Reason
        <textarea required minLength={2} maxLength={1000} className={fieldClass} value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <Button type="submit" size="sm" disabled={busy}>Submit for review</Button>
    </form>}
  </div>;
}

const poseNames: Record<string, string> = {
  FRONT: 'Look straight ahead',
  LEFT_15: 'Turn left',
  RIGHT_15: 'Turn right',
  TILT_UP: 'Tilt chin up',
  TILT_DOWN: 'Tilt chin down',
  ROLL_RIGHT: 'Tilt head sideways',
  BACKUP_FRONT: 'Backup front photo',
};

export function FaceRequests({ state, onSaved }: { state: RequestState; onSaved: () => void }) {
  const [selected, setSelected] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedPoses, setSavedPoses] = useState<string[] | null>(null);
  const [checkingMatch, setCheckingMatch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const autoEnabled = useRef(true);
  const saving = useRef(false);
  const stable = useRef<{ pose: string; since: number; lastFrame: number } | null>(null);
  const enrolled = new Set(savedPoses ?? state.existing_poses);
  const pose = selected || state.required_poses.find(pose => !enrolled.has(pose));
  const currentPose = useRef(pose);
  currentPose.current = pose;
  const count = state.required_poses.filter(pose => enrolled.has(pose)).length;

  const complete = count > 0 && count === state.required_poses.length;

  useEffect(() => { setSavedPoses(null); }, [state.existing_poses]);

  useEffect(() => {
    if (!image) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function choosePhoto(photo: File) {
    if (saving.current) return;
    stable.current = null;
    if (photo.type !== 'image/jpeg' || photo.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG photo under 2 MB.');
      return;
    }
    setImage(photo);
    setError('');
  }

  async function submitPhoto(photo: File, targetPose: string) {
    if (saving.current || currentPose.current !== targetPose) return;
    saving.current = true;
    stable.current = null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = new FormData();
      payload.append('pose', targetPose);
      payload.append('file', photo);
      const { data } = await apiClient.post<{ completed_poses: string[] }>('/student-portal/face', payload);
      setSavedPoses(data.completed_poses);
      setEditing(false);
      setImage(null);
      setSelected('');
      setNotice(`${poseNames[targetPose] ?? label(targetPose)} photo saved.`);
      onSaved();
    } catch (err) {
      setImage(photo);
      setError(formatApiErrorMessage(err, 'Could not submit this face photo.'));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <section className="overflow-hidden rounded-xl border border-border bg-surface">
    <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold">{complete ? 'Face registered' : 'Face registration'}</h2>
        <p className="text-sm text-text-muted">{complete ? `All ${count} required poses saved.` : 'Follow the pose prompts to save your face for attendance.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {enrolled.size > 0 && <Button variant="secondary" disabled={busy} onClick={() => {
          stable.current = null;
          setImage(null);
          setCheckingMatch(!checkingMatch);
          setEditing(false);
        }}>{checkingMatch ? 'Close match check' : 'Check face match'}</Button>}
        {complete && <Button variant="secondary" disabled={busy} onClick={() => {
          setCheckingMatch(false);
          setEditing(!editing);
          setSelected('');
          setImage(null);
        }}>{editing ? 'Close editor' : 'Update photos'}</Button>}
      </div>
    </header>
    {checkingMatch ? <FaceMatchPanel /> : (!complete || editing) && <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.85fr)]">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <h3 className="font-semibold">Required poses</h3>
          <span className="text-text-muted">{count} of {state.required_poses.length} saved</span>
        </div>
        <progress className="mb-4 block h-2 w-full accent-primary" aria-label="Saved poses"
          max={Math.max(1, state.required_poses.length)} value={count} />
        <ul className="space-y-1.5">
          {state.required_poses.map(item => {
            const approved = enrolled.has(item);
            return <li key={item}>
              <button type="button" aria-pressed={item === pose} disabled={busy}
                onClick={() => { if (item !== pose) { stable.current = null; setSelected(item); setImage(null); setError(''); } }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${item === pose ? 'border-primary bg-primary/10' : 'border-transparent bg-background'}`}>
                {approved ? <Check size={16} className="shrink-0 text-success" aria-hidden />
                  : <Camera size={16} className="shrink-0 text-text-muted" aria-hidden />}
                <span className="flex-1 font-medium">{poseNames[item] ?? label(item)}</span>
                {approved && <span className="text-xs text-text-muted">Saved</span>}
              </button>
            </li>;
          })}
        </ul>
      </div>
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
        {pose ? <>
          <div>
            <h3 className="font-semibold">{poseNames[pose] ?? label(pose)}</h3>
            <p className="mt-1 text-sm text-text-muted">{state.hints[pose]}</p>
          </div>
          {image && preview && <div className="overflow-hidden rounded-xl border border-border bg-background">
            <img src={preview} alt="Photo selected for this pose" className="aspect-video w-full object-contain" />
          </div>}
          <div hidden={Boolean(image)}>
            <WebcamPanel
            onCapture={blob => choosePhoto(new File([blob], 'face.jpg', {type: 'image/jpeg'}))}
            onFrame={async (blob, signal): Promise<FrameResult> => {
              if (image || saving.current) return {};
              const payload = new FormData();
              payload.append('pose', pose);
              payload.append('file', blob, 'face.jpg');
              const { data } = await apiClient.post('/student-portal/face/check', payload, { signal });
              if (signal.aborted || currentPose.current !== pose) return {};
              const now = performance.now();
              const previous = stable.current;
              if (!data.valid) {
                stable.current = null;
              } else if (previous?.pose !== pose || now - previous.lastFrame > 1500) {
                stable.current = { pose, since: now, lastFrame: now };
              } else if (autoEnabled.current && now - previous.since >= 1000) {
                await submitPhoto(new File([blob], 'face.jpg', { type: 'image/jpeg' }), pose);
                return {};
              } else {
                previous.lastFrame = now;
              }
              return {
                valid: data.valid,
                message: data.valid ? (automatic ? 'Hold still for automatic capture.' : 'Pose looks good. Capture the photo when ready.') : data.hint,
                boxes: data.bbox ? [{
                  bbox: data.bbox,
                  label: data.valid ? 'Ready' : data.hint,
                  color: data.valid ? '#16a34a' : '#d97706',
                }] : [],
              };
            }}
          />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={automatic}
                disabled={busy}
                onChange={event => {
                  stable.current = null;
                  autoEnabled.current = event.target.checked;
                  setAutomatic(event.target.checked);
                }} />
              Automatically capture and save after 1 second of a valid pose
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {image && <Button type="button" variant="secondary" disabled={busy} icon={<Camera size={16} />}
              onClick={() => { setImage(null); setError(''); }}>
              Retake with camera
            </Button>}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-primary">
              <Upload size={16} aria-hidden /> {image ? 'Replace photo' : 'Upload JPEG'}
              <input type="file" className="sr-only" accept="image/jpeg" disabled={busy} onChange={event => {
                const file = event.target.files?.[0];
                if (file) choosePhoto(file);
                event.target.value = '';
              }} />
            </label>
          </div>
          {image && <Button type="button" disabled={busy} onClick={() => void submitPhoto(image, pose)}>
            {busy ? 'Submitting…' : enrolled.has(pose) ? 'Save updated photo' : 'Save photo'}
          </Button>}
          {busy && !image && <p role="status" className="text-sm text-text-muted">Saving photo…</p>}
        </> : <p className="rounded-lg bg-background p-4 text-sm text-text-muted">
          All required poses are saved. Select a pose to update it.
        </p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      </div>
    </div>}
  </section>;
}

function FaceMatchPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const [source, setSource] = useState<'camera' | 'upload'>('camera');
  const lastFrame = useRef(-Infinity);
  const cameraSignal = useRef<AbortSignal>();
  const liveResult = useRef<{ valid?: boolean; message?: string }>({});

  async function compare(photo: Blob, signal?: AbortSignal) {
    const payload = new FormData();
    payload.append('file', photo, 'face.' + (photo.type === 'image/png' ? 'png' : 'jpg'));
    const { data } = await apiClient.post<{ matched: boolean }>('/student-portal/face/match', payload, { signal });
    return { valid: data.matched, message: data.matched ? 'Face matches your saved scan.' : 'Face did not match your saved scan.' };
  }

  async function check(photo: Blob) {
    if (busy) return;
    if (photo.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(photo.type)) {
      setResult('');
      setError('Choose a JPEG or PNG photo under 10 MB.');
      return;
    }
    setBusy(true);
    setResult('');
    setError('');
    try {
      setResult((await compare(photo)).message);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Could not check your face match.'));
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4 p-5 sm:p-6">
    <h3 className="font-semibold">Check face match</h3>
    <p className="text-sm text-text-muted">Use your camera or choose a photo with one clear face. Only your saved face is checked.</p>
    <div className="flex gap-2">
      {(['camera', 'upload'] as const).map(mode => <Button key={mode} variant={source === mode ? 'primary' : 'secondary'}
        disabled={busy} aria-pressed={source === mode} onClick={() => {
          setSource(mode);
          setResult('');
          setError('');
          lastFrame.current = -Infinity;
        }}>{mode === 'camera' ? 'Live camera' : 'Upload photo'}</Button>)}
    </div>
    {source === 'upload' ? <label className="block text-sm font-medium">Check an uploaded photo
      <input type="file" accept="image/jpeg,image/png" disabled={busy} className="mt-2 block max-w-full"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void check(file);
        }} />
    </label> : <WebcamPanel compact onFrame={async (frame, signal) => {
      if (cameraSignal.current !== signal) {
        cameraSignal.current = signal;
        liveResult.current = {};
        lastFrame.current = -Infinity;
      }
      if (performance.now() - lastFrame.current < 1500) return liveResult.current;
      lastFrame.current = performance.now();
      try {
        const result = await compare(frame, signal);
        if (!signal.aborted) liveResult.current = result;
      } catch (err) {
        if (!signal.aborted) liveResult.current = { message: formatApiErrorMessage(err, 'Could not check this frame.') };
      }
      return liveResult.current;
    }} />}
    {busy && <p role="status" className="text-sm">Checking face…</p>}
    {result && <p role="status" className="text-sm font-medium">{result}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}

function ReviewCard({ item, onReviewed }: { item: ReviewItem; onReviewed: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError('');
    try {
      await apiClient.post(`/student-portal/review/${item.id}`, { decision, note });
      onReviewed();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Could not save the review.'));
    } finally {
      setBusy(false);
    }
  }

  return <article className="space-y-3 border-t border-border p-4">
    <h3 className="font-medium">{requestLabels[item.kind]} · {item.student_name}</h3>
    <p className="text-sm text-text-muted">{item.student_pid}{item.subject && ` · ${item.subject} · ${item.date}`}</p>
    <p className="text-sm">{label(item.current_status ?? '')} → {label(item.requested_status ?? '')}</p>
    <p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
    <label className="block max-w-md text-sm">Review note
      <textarea className={fieldClass} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
    </label>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex gap-2">
      <Button size="sm" disabled={busy || note.trim().length < 2}
        onClick={() => void decide('APPROVED')}>Approve</Button>
      <Button size="sm" variant="secondary" disabled={busy || note.trim().length < 2}
        onClick={() => void decide('REJECTED')}>Reject</Button>
    </div>
  </article>;
}

export function StudentReviewQueue() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState('');
  async function load() {
    try {
      setItems((await apiClient.get<ReviewItem[]>('/student-portal/review')).data);
      setError('');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Could not load student requests.'));
    }
  }
  useEffect(() => { void load(); }, []);

  return <section className="rounded-xl border border-border bg-surface">
    <div className="flex items-center justify-between gap-4 p-4">
      <h2 className="font-semibold">Student requests</h2>
      <Button variant="secondary" size="sm" onClick={() => void load()}>Refresh requests</Button>
    </div>
    {error && <p role="alert" className="px-4 pb-4 text-sm text-danger">{error}</p>}
    {!error && !items && <p className="px-4 pb-4 text-sm">Loading requests…</p>}
    {!error && items?.length === 0 && <p className="px-4 pb-4 text-sm text-text-muted">No requests pending review.</p>}
    {items?.map(item => <ReviewCard key={item.id} item={item} onReviewed={() => void load()} />)}
  </section>;
}
