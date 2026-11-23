import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, ImagePlus, Monitor } from 'lucide-react';
import { apiClient } from '../services/api';

type Bucket = 'VERIFIED' | 'NEEDS_REVIEW' | 'UNKNOWN';
interface Face {
  face_ref: string; bucket: Bucket; student_id: string | null; similarity: number;
  bbox: number[]; candidates: { student_id: string; score: number }[]; quality_flags: string[];
}
interface Preview {
  session_id: string;
  images: { image_id: string; annotated_image: string; faces: Face[] }[];
  students: { student_id: string; name: string; roll_number: string }[];
}
interface Confirmation { marked: number; unchanged: number; records: {student_id: string; status: string}[] }
function errorMessage(error: unknown): string {
  if (axios.isAxiosError<{detail: unknown}>(error) && typeof error.response?.data.detail === 'string') return error.response.data.detail;
  return 'Photo attendance failed. Please try again.';
}

export function PhotoAttendancePanel({ sessionId, active, visible = true, onConfirmed, onManualReview }: {
  sessionId: string;
  active: boolean;
  visible?: boolean;
  onConfirmed?: () => void | Promise<void>;
  onManualReview?: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<'analyze' | 'confirm' | null>(null);
  const busy = operation !== null;
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const version = useRef(0);
  const cameraRequest = useRef(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  function stopCamera() {
    cameraRequest.current++;
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  }
  useEffect(() => {
    version.current++; setFiles([]); setPreview(null); setSelected({}); setMessage(''); setOperation(null); setConfirmed(false);
    stopCamera();
    return () => { version.current++; cameraRequest.current++; cameraStreamRef.current?.getTracks().forEach(track => track.stop()); };
  }, [sessionId, active]);
  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);
  useEffect(() => {
    if (!visible) stopCamera();
  }, [visible]);
  useEffect(() => {
    if (preview && visible) reviewHeading.current?.focus();
  }, [preview, visible]);
  useEffect(() => {
    if (confirmed && visible) statusMessage.current?.focus();
  }, [confirmed, visible]);
  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming?.length) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > 3) { setMessage('Choose at most three photos. Clear the selection to start again.'); return; }
    if (next.some(file => file.size > 15 * 1024 * 1024)) { setMessage('Each photo must be at most 15 MB.'); return; }
    if (next.some(file => !/\.(jpe?g|png|webp)$/i.test(file.name) && !/^image\/(jpeg|png|webp)$/i.test(file.type))) {
      setMessage('Choose JPEG, PNG, or WebP photos.');
      return;
    }
    setFiles(next);
    void analyze(next);
  }
  async function openLaptopCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera access is unavailable. Open the app on localhost or HTTPS and allow camera access.');
      return;
    }
    stopCamera();
    const request = cameraRequest.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setMessage('');
    } catch {
      if (request !== cameraRequest.current) return;
      setMessage('Could not open the camera. Check browser camera permission and that no other app is using it.');
    }
  }
  async function captureLaptopPhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setMessage('Camera is still starting. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { setMessage('Could not capture an image from the camera.'); return; }
    context.drawImage(video, 0, 0);
    const request = cameraRequest.current;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (request !== cameraRequest.current) return;
    if (!blob) { setMessage('Could not capture an image from the camera.'); return; }
    addFiles([new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
  }
  async function analyze(images: File[]) {
    const current = ++version.current;
    stopCamera();
    setOperation('analyze'); setConfirmed(false); setMessage(''); setPreview(null); setSelected({});
    try {
      const data = new FormData(); data.append('session_id', sessionId);
      images.forEach(file => data.append('images', file));
      const response = await apiClient.post<Preview>('/media-attendance/image/preview', data, {timeout: 180000});
      if (current !== version.current) return;
      const best = new Map<string, Face>();
      response.data.images.forEach(image => image.faces.forEach(face => {
        if (face.bucket === 'VERIFIED' && face.student_id && (!best.has(face.student_id) || best.get(face.student_id)!.similarity < face.similarity)) best.set(face.student_id, face);
      }));
      setSelected(Object.fromEntries([...best].map(([id, face]) => [face.face_ref, id])));
      setPreview(response.data);
    } catch (error) { if (current === version.current) setMessage(errorMessage(error)); }
    finally { if (current === version.current) setOperation(null); }
  }
  async function confirm() {
    const current = ++version.current;
    setOperation('confirm'); setMessage('');
    try {
      const response = await apiClient.post<Confirmation>('/media-attendance/image/confirm', {
        session_id: sessionId,
        selections: Object.entries(selected).filter(([,id]) => id).map(([face_ref, student_id]) => ({face_ref, student_id})),
      });
      if (current !== version.current) return;
      const { marked, unchanged } = response.data;
      const late = response.data.records.filter(record => record.status === 'LATE').length;
      setMessage(`Marked ${marked} student${marked === 1 ? '' : 's'}${late ? ` (${late} late)` : ''}.${unchanged ? ` ${unchanged} existing record${unchanged === 1 ? '' : 's'} unchanged.` : ''}`);
      setConfirmed(true);
      setPreview(null); setSelected({}); setFiles([]);
      await onConfirmed?.();
    } catch (error) { if (current === version.current) setMessage(errorMessage(error)); }
    finally { if (current === version.current) setOperation(null); }
  }
  if (!active) return <p className="text-sm text-text-muted">Start an attendance session to use Photo Attendance.</p>;
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const reviewCount = preview?.images.reduce((count, image) =>
    count + image.faces.filter(face => face.bucket === 'NEEDS_REVIEW' && !selected[face.face_ref]).length, 0) ?? 0;
  return <section aria-label="Class photo attendance" className="space-y-4 rounded-xl border border-border bg-surface p-4">
    <div>
      <h2 className="text-lg font-bold">Class photo</h2>
      <p className="text-sm text-text-muted">Take or upload up to three photos from the front at face height. Attendance is saved after you confirm.</p>
    </div>
    <div className="flex flex-wrap gap-2" onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault();
      if (!busy) addFiles(event.dataTransfer.files);
    }}>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus-within:ring-2 has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
        <Camera className="h-4 w-4" /> Take photo
        <input aria-label="Take classroom photo" disabled={busy || files.length >= 3} type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
      </label>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold focus-within:ring-2 has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
        <ImagePlus className="h-4 w-4" /> {files.length ? 'Add photos' : 'Choose photos'}
        <input aria-label={files.length ? 'Add classroom photos' : 'Choose classroom photos'} disabled={busy || files.length >= 3} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
      </label>
      <button type="button" disabled={busy || files.length >= 3 || !!cameraStream} onClick={openLaptopCamera} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">
        <Monitor className="h-4 w-4" /> Use webcam
      </button>
    </div>
    {cameraStream && <div className="space-y-3 rounded border p-3">
      <video ref={videoRef} autoPlay playsInline muted className="max-h-[60vh] w-full rounded bg-black" aria-label="Laptop camera preview" />
      <div className="flex gap-3">
        <button type="button" onClick={captureLaptopPhoto} disabled={busy || files.length >= 3} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-40">Capture photo</button>
        <button type="button" onClick={stopCamera} className="rounded border px-4 py-2">Close camera</button>
      </div>
    </div>}
    {files.length > 0 && (
      <div className="flex items-start justify-between gap-2 text-sm text-text-muted">
        <p className="min-w-0 break-words">{files.map(file => file.name).join(', ')}</p>
        <button disabled={busy} onClick={() => { setFiles([]); setPreview(null); setSelected({}); setMessage(''); }} className="shrink-0 underline disabled:opacity-50">Clear photos</button>
      </div>
    )}
    {operation === 'analyze' && <p role="status" className="text-sm">Checking photos for matches…</p>}
    {message && <p ref={statusMessage} tabIndex={-1} role="status" className="rounded bg-surface-muted p-3 text-sm">{message}</p>}
    {files.length > 0 && !busy && !preview && (
      <button type="button" onClick={() => void analyze(files)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Retry photo review</button>
    )}
    {(confirmed || (preview && !selectedCount)) && onManualReview && (
      <button type="button" onClick={onManualReview} className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold">Review unmarked students</button>
    )}
    {preview && <>
      <div className="border-t border-border pt-4">
        <h3 ref={reviewHeading} tabIndex={-1} className="font-bold">Review photo matches</h3>
        <p className="text-sm text-text-muted">{selectedCount} ready to mark · {reviewCount} to review. Uncheck incorrect matches. Use the roster for students the photos missed.</p>
      </div>
      {!preview.images.some(image => image.faces.length) && <p>No faces found. Move closer and try another photo.</p>}
      {preview.images.map((image, imageIndex) => <div key={image.image_id} className="space-y-4 border-t border-border pt-4">
        <img src={image.annotated_image} alt={`Photo ${imageIndex+1}: green verified, amber needs review, red unknown`} className="w-full rounded" />
        <div className="space-y-4">{(['NEEDS_REVIEW','VERIFIED','UNKNOWN'] as Bucket[]).filter(bucket => image.faces.some(face => face.bucket === bucket)).map(bucket => <div key={bucket}>
          <h3 className="font-semibold">{{VERIFIED:'Verified',NEEDS_REVIEW:'Needs review',UNKNOWN:'Unknown'}[bucket]}</h3>
          {image.faces.map((face, index) => ({face,index})).filter(({face}) => face.bucket===bucket).map(({face,index}) => <div key={face.face_ref} className="py-2 border-b text-sm">
            <p>Face {index+1} · similarity {face.similarity.toFixed(2)} {face.quality_flags.join(', ')}</p>
            {bucket==='VERIFIED' && <label><input type="checkbox" disabled={busy || (!!face.student_id && Object.entries(selected).some(([ref,id]) => ref!==face.face_ref && id===face.student_id))} checked={!!selected[face.face_ref]} onChange={e => setSelected({...selected,[face.face_ref]:e.target.checked ? face.student_id! : ''})} /> {preview.students.find(s => s.student_id===face.student_id)?.name} {Object.entries(selected).some(([ref,id]) => ref!==face.face_ref && id===face.student_id) ? '(selected in another face/photo)' : ''}</label>}
            {bucket==='NEEDS_REVIEW' && <select aria-label={`Identify photo ${imageIndex+1} face ${index+1}`} disabled={busy} className="border rounded p-2 w-full" value={selected[face.face_ref] || ''} onChange={e => setSelected({...selected,[face.face_ref]:e.target.value})}>
              <option value="">Reject / do not mark</option>{preview.students.map(student => <option key={student.student_id} value={student.student_id} disabled={Object.entries(selected).some(([ref,id]) => ref!==face.face_ref && id===student.student_id)}>{student.roll_number} — {student.name}</option>)}
            </select>}
            {bucket==='UNKNOWN' && <p className="text-red-700">Not eligible for photo attendance.</p>}
          </div>)}
        </div>)}</div>
      </div>)}
      <button disabled={busy || selectedCount === 0} onClick={confirm} className="sticky bottom-4 z-10 min-h-12 w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 font-semibold shadow-lg disabled:opacity-40">
        {operation === 'confirm' ? 'Saving attendance…' : `Confirm attendance${selectedCount ? ` (${selectedCount})` : ''}`}
      </button>
      <p className="text-xs text-text-muted">Confirm within 15 minutes. Students confirmed after the grace period are marked late.</p>
    </>}
  </section>;
}
