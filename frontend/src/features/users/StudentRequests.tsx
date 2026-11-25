import { createElement, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, ImagePlus, ScanFace, ShieldCheck, Upload } from 'lucide-react';
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
  face_update_request: StudentRequest | null;
  can_update_face: boolean;
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
  const poseNumber = pose ? state.required_poses.indexOf(pose) + 1 : 0;

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

  const photoInput = <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-primary">
              <Upload size={16} aria-hidden /> {image ? 'Replace photo' : 'Upload a photo'}
              <input type="file" className="sr-only" accept="image/jpeg" disabled={busy} onChange={event => {
                const file = event.target.files?.[0];
                if (file) choosePhoto(file);
                event.target.value = '';
              }} />
            </label>;

  return <section id="face-registration" className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-surface">
    {complete && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
      <h2 className="flex items-center gap-2 font-semibold"><Check size={19} className="text-primary" /> Face registered</h2>
      {state.can_update_face && <Button variant="secondary" disabled={busy} onClick={() => {
        setEditing(!editing);
        setSelected('');
        setImage(null);
      }}>{editing ? 'Close editor' : 'Replace saved photos'}</Button>}
    </header>}
    {(!complete || (editing && state.can_update_face)) && <div className="grid gap-4 p-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)] lg:gap-6 sm:p-6">
      <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">Photos saved</span>
          <span className="tabular-nums text-text-muted">{count} of {state.required_poses.length}</span>
        </div>
        <div role="progressbar" aria-label="Registration photos saved" aria-valuemin={0}
          aria-valuemax={Math.max(1, state.required_poses.length)} aria-valuenow={count} aria-valuetext={`${count} of ${state.required_poses.length} photos saved`}
          className="flex gap-1.5">
          {state.required_poses.map(item => <span key={item} className={`h-2 flex-1 rounded-full ${enrolled.has(item) ? 'bg-primary' : item === pose ? 'bg-primary/35' : 'bg-border'}`} />)}
        </div>
      </div>
        {pose && <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <ScanFace size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-primary">{enrolled.has(pose) ? 'Replacing saved photo' : `Pose ${poseNumber} of ${state.required_poses.length}`}</p>
            <h3 className="mt-0.5 text-lg font-semibold leading-snug">{poseNames[pose] ?? label(pose)}</h3>
            {state.hints[pose] && state.hints[pose].trim() !== (poseNames[pose] ?? label(pose)).trim() &&
              <p className="mt-1 text-sm text-text-muted">{state.hints[pose]}</p>}
          </div>
        </div>}
      </div>
      <div className="min-w-0 space-y-3">
        {pose ? <>
          {image && preview && <div className="overflow-hidden rounded-xl border border-border bg-background">
            <img src={preview} alt="Photo selected for this pose" className="aspect-video w-full object-contain" />
          </div>}
          {!image && <div className="space-y-3">
            <WebcamPanel compact captureBusy={busy}
            secondaryAction={photoInput}
            cameraOptions={<label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={automatic}
                disabled={busy}
                onChange={event => {
                  stable.current = null;
                  autoEnabled.current = event.target.checked;
                  setAutomatic(event.target.checked);
                }} />
              Take photos automatically when ready
            </label>}
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
          </div>}
          {image && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} icon={<Camera size={16} />}
              onClick={() => { setImage(null); setError(''); }}>
              Retake with camera
            </Button>
            {photoInput}
          </div>}
          {image && <Button type="button" disabled={busy} onClick={() => void submitPhoto(image, pose)}>
            {busy ? 'Submitting…' : enrolled.has(pose) ? 'Save updated photo' : 'Save photo'}
          </Button>}
          {busy && !image && <p role="status" className="text-sm text-text-muted">Saving photo…</p>}
        </> : <p className="rounded-lg bg-background p-4 text-sm text-text-muted">
          All required poses are saved. Select a pose to update it.
        </p>}
      </div>
      <div className="space-y-3 lg:col-span-2">
        <details className="rounded-xl border border-border px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{complete ? 'Choose a photo to update' : 'View all photo poses'}</summary>
          <ul className="grid gap-2 pb-3 sm:grid-cols-2">
            {state.required_poses.map(item => <li key={item}>
              <button type="button" aria-pressed={item === pose} disabled={busy || (enrolled.has(item) && !state.can_update_face)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 text-left text-sm"
                onClick={() => { stable.current = null; setSelected(item); setImage(null); setError(''); }}>
                {poseNames[item] ?? label(item)}
                <span className="text-xs text-text-muted">{enrolled.has(item) ? 'Saved' : 'To do'}</span>
              </button>
            </li>)}
          </ul>
        </details>
        {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}
        <p className="flex items-start gap-2 text-sm text-text-muted"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>We save a face template for attendance and discard the photo.</span>
        </p>
      </div>
    </div>}
  </section>;
}

type DetectedMatch = {
  bbox: [number, number, number, number];
  quality_flags?: string[];
} & (
  { status: 'VERIFIED'; name: string; similarity: number }
  | { status: 'NEEDS_REVIEW'; name?: string; similarity?: number }
  | { status: 'UNKNOWN' | 'LOW_QUALITY' }
);

type MatchResult = {
  width: number;
  height: number;
  faces: DetectedMatch[];
  gallery_size: number;
  latency_ms: number;
  verified_threshold: number;
};

export function FaceUpdateForm({ state, onSaved }: { state: RequestState; onSaved: () => void }) {
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = state.face_update_request;

  if (state.can_update_face) return <p className="text-sm">Approved for seven days after review. Open face setup to replace saved photos.</p>;
  if (request?.status === 'PENDING' || notice) return <p role="status" className="text-sm">Your request is waiting for an administrator.</p>;

  return <form className="max-w-lg space-y-3" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/student-portal/face/update-request', { reason });
      setNotice('Request submitted');
      onSaved();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Could not send your face update request.'));
    } finally {
      setBusy(false);
    }
  }}>
    {request?.status === 'REJECTED' && <p className="text-sm">Last request declined. {request.review_note}</p>}
    <label className="block text-sm">Why do you want to update your face photos?
      <textarea className={fieldClass} value={reason} minLength={2} maxLength={1000} required
        onChange={event => setReason(event.target.value)} />
    </label>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Button type="submit" disabled={busy || reason.trim().length < 2}>{busy ? 'Sending…' : 'Send to administrator'}</Button>
  </form>;
}

export function FaceMatchPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; match: MatchResult }>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const [source, setSource] = useState<'camera' | 'upload'>('camera');
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);

  function clearCheck() {
    request.current?.abort();
    setBusy(false);
    setPreview(undefined);
    setResult(null);
    setError('');
  }

  const statusLabel = (face: DetectedMatch) => {
    switch (face.status) {
      case 'VERIFIED': return face.name + ' · Match';
      case 'NEEDS_REVIEW': return face.name ? `Possible match: ${face.name}` : 'Uncertain match';
      case 'LOW_QUALITY': return 'Could not check';
      default: return 'Unknown';
    }
  };

  async function analyze(photo: Blob, signal: AbortSignal, live = false) {
    const payload = new FormData();
    payload.append('file', photo, photo.type === 'image/png' ? 'face.png' : 'face.jpg');
    const { data } = await apiClient.post<MatchResult>('/student-portal/face/match', payload, { signal, params: { live, photo: !live } });
    if (!signal.aborted) setResult(data);
    return data;
  }

  async function analyzeFrame(photo: Blob, signal: AbortSignal): Promise<FrameResult> {
    const data = await analyze(photo, signal, true);
    return {
      boxes: data.faces.map((face, index) => ({
        bbox: face.bbox,
        label: `${index + 1} · ${statusLabel(face)}`,
        color: face.status === 'VERIFIED' ? '#15803d' : face.status === 'UNKNOWN' ? '#b91c1c' : '#92400e',
      })),
    };
  }

  async function check(photo: Blob) {
    if (request.current && !request.current.signal.aborted) return;
    if (photo.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(photo.type)) {
      setResult(null);
      setError('Choose a JPEG or PNG photo under 10 MB.');
      return;
    }
    setPreview(undefined);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const data = await analyze(photo, controller.signal);
      if (!controller.signal.aborted) setPreview({ url: URL.createObjectURL(photo), match: data });
    } catch (err) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(err, 'Could not check your face match.'));
    } finally {
      if (request.current === controller) { request.current = undefined; setBusy(false); }
    }
  }

  const matchCount = result?.faces.filter(face => face.status === 'VERIFIED').length ?? 0;

  return <div className="min-w-0 space-y-4 p-1 sm:p-4">
    <h3 className="text-xl font-semibold">Recognition test</h3>
    <p className="text-sm text-text-muted">Check enrolled students in your class and division using the live camera or a photo. This test does not record attendance.</p>
    {createElement('sakuga-recognition-source', { className: 'block' },
    <div role="group" aria-label="Recognition source" className="grid w-full grid-cols-2 gap-2 rounded-xl border border-border bg-surface-muted p-1 sm:max-w-sm">
      {(['camera', 'upload'] as const).map(mode => {
        const Icon = mode === 'camera' ? Camera : ImagePlus;
        return <Button key={mode} variant={source === mode ? 'primary' : 'ghost'}
          className="min-w-0 !px-2" aria-pressed={source === mode} onClick={() => {
            if (source === mode) return;
            clearCheck();
            setSource(mode);
          }}><Icon size={17} className="shrink-0" aria-hidden="true" />{mode === 'camera' ? 'Live camera' : 'Upload photo'}</Button>;
      })}
    </div>)}
    <div className={`grid items-start gap-4 ${source === 'camera' ? 'lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)]' : ''}`}>
    <div className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-2.5 sm:p-4">
    {source === 'upload' ? <label className="flex min-h-24 cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-surface-muted p-3 focus-within:ring-2 focus-within:ring-primary sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Upload size={19} aria-hidden="true" /></span>
      <span><span className="block text-sm font-semibold">{busy ? 'Checking photo…' : preview ? 'Choose another photo' : 'Choose a photo'}</span>
        <span className="mt-1 block text-xs text-text-muted">JPEG or PNG, up to 10 MB</span></span>
      <input type="file" accept="image/jpeg,image/png" disabled={busy} className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void check(file);
        }} />
    </label> : <WebcamPanel onFrame={analyzeFrame} frameInterval={350} showGuide={false} previewControls onCameraChange={clearCheck} />}
    {preview && <figure className="w-full">
      <figcaption className="mb-2 text-sm font-medium">Checked image</figcaption>
      <div className="relative overflow-hidden rounded-xl">
        <img src={preview.url} alt="The image used for your face check" width={preview.match.width} height={preview.match.height}
          className="block h-auto w-full" />
        {preview.match.faces.map((face, index) => {
          const [left, top, right, bottom] = face.bbox;
          const { width, height } = preview.match;
          const status = face.status === 'VERIFIED' ? `${face.name} · ${face.similarity.toFixed(3)}` : statusLabel(face);
          return <div key={index} className={`pointer-events-none absolute border-2 ${face.status === 'VERIFIED' ? 'border-green-400' : face.status === 'UNKNOWN' ? 'border-rose-400' : 'border-amber-400'}`}
            style={{ left: 100 * left / width + '%', top: 100 * top / height + '%',
              width: 100 * (right - left) / width + '%', height: 100 * (bottom - top) / height + '%' }}>
            <span aria-label={`Face ${index + 1}: ${status}`} className={`absolute w-max max-w-36 truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight text-white sm:max-w-48 sm:text-xs
                ${top / height >= 0.055 ? 'bottom-full' : 'top-0'}
                ${left / width > 0.55 ? 'right-0' : 'left-0'}
                ${face.status === 'VERIFIED' ? 'bg-green-800' : face.status === 'UNKNOWN' ? 'bg-red-800' : 'bg-amber-800'}`}>
              {status}
            </span>
          </div>;
        })}
      </div>
    </figure>}
    {busy && <p role="status" className="sr-only">Checking photo…</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
    <aside className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <ScanFace size={19} className="shrink-0 text-primary" aria-hidden="true" />
        <h4 className="min-w-0 font-semibold">Detected faces</h4>
        {result && <span className="ml-auto rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">{result.faces.length}</span>}
      </div>
      <p className="mt-2 text-sm text-text-muted" role={source === 'upload' ? 'status' : undefined}>
        {!result ? 'Start the camera or upload a photo to see matches.'
          : !result.faces.length ? 'No faces detected. Try better lighting.'
          : `${matchCount} of ${result.faces.length} faces matched`}
      </p>
      {!!result?.faces.length && <ol className="mt-3 grid gap-2">
        {result.faces.map((face, index) => <li key={index} className="min-w-0 rounded-lg border border-border p-3 text-sm">
          <span className="font-medium">Face {index + 1}</span>
          <p className={face.status === 'VERIFIED' ? 'text-success' : face.status === 'UNKNOWN' ? 'text-text-muted' : 'text-warning'}>{statusLabel(face)}</p>
          {(face.status === 'VERIFIED' || face.status === 'NEEDS_REVIEW') && face.similarity !== undefined &&
            <p className="text-xs text-text-muted">Similarity {face.similarity.toFixed(3)}</p>}
          {!!face.quality_flags?.length && <p className="mt-1 text-xs text-text-muted">{face.quality_flags.map(flag => flag.replace(/_/g, ' ')).join(' · ')}</p>}
        </li>)}
      </ol>}
      {result && <details className="mt-3 border-t border-border">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-medium text-text-muted">
          Test details <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <dl className="grid gap-2 pb-1 text-sm">
          {[
            ['Saved faces in scope', result.gallery_size],
            ['Processing time', `${Math.round(result.latency_ms)} ms`],
            ['Match threshold', result.verified_threshold.toFixed(2)],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-text-muted">{label}</dt><dd className="font-medium tabular-nums">{value}</dd>
          </div>)}
        </dl>
      </details>}
      {result?.gallery_size === 0 && <p className="mt-2 text-sm text-text-muted">No saved faces are available in your class yet.</p>}
    </aside>
    </div>
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
    {item.kind === 'FACE_UPDATE'
      ? <p className="text-sm">Approval lets the student replace saved photos for seven days.</p>
      : <p className="text-sm">{label(item.current_status ?? '')} → {label(item.requested_status ?? '')}</p>}
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
