import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
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

export function PhotoAttendancePanel({ sessionId, active, onConfirmed }: {
  sessionId: string; active: boolean; onConfirmed?: () => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const version = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  }
  useEffect(() => {
    version.current++; setFiles([]); setPreview(null); setSelected({}); setMessage(''); setBusy(false);
    stopCamera();
    return () => { version.current++; cameraStreamRef.current?.getTracks().forEach(track => track.stop()); };
  }, [sessionId, active]);
  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{sessionId: string; files: File[]}>).detail;
      if (detail.sessionId !== sessionId || !active || busy) return;
      version.current++; setFiles(detail.files.slice(0, 3)); setPreview(null); setSelected({});
      setMessage('Photos ready. Click Preview photos to review before saving.');
      document.getElementById(`photo-review-${sessionId}`)?.scrollIntoView({behavior: 'smooth'});
    };
    window.addEventListener('photo-review-files', receive);
    return () => window.removeEventListener('photo-review-files', receive);
  }, [sessionId, active, busy]);
  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const picked = Array.isArray(incoming) ? incoming : Array.from(incoming);
    const next = [...files, ...picked];
    if (next.length > 3) { setMessage('Choose at most three photos. Clear the selection to start again.'); return; }
    if (next.some(file => file.size > 15 * 1024 * 1024)) { setMessage('Each photo must be at most 15 MB.'); return; }
    version.current++; setFiles(next); setPreview(null); setSelected({}); setMessage('');
  }
  async function openLaptopCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera access is unavailable. Open the app on localhost or HTTPS and allow camera access.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setMessage('Allow camera access in your browser if prompted.');
    } catch {
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
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) { setMessage('Could not capture an image from the camera.'); return; }
    addFiles([new File([blob], `laptop-camera-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
    stopCamera();
  }
  async function analyze() {
    const current = ++version.current;
    setBusy(true); setMessage(''); setPreview(null); setSelected({});
    try {
      const data = new FormData(); data.append('session_id', sessionId);
      files.forEach(file => data.append('images', file));
      const response = await apiClient.post<Preview>('/media-attendance/image/preview', data, {timeout: 180000});
      if (current !== version.current) return;
      const best = new Map<string, Face>();
      response.data.images.forEach(image => image.faces.forEach(face => {
        if (face.bucket === 'VERIFIED' && face.student_id && (!best.has(face.student_id) || best.get(face.student_id)!.similarity < face.similarity)) best.set(face.student_id, face);
      }));
      setSelected(Object.fromEntries([...best].map(([id, face]) => [face.face_ref, id])));
      setPreview(response.data);
    } catch (error) { if (current === version.current) setMessage(errorMessage(error)); }
    finally { if (current === version.current) setBusy(false); }
  }
  async function confirm() {
    const current = ++version.current;
    setBusy(true); setMessage('');
    try {
      const response = await apiClient.post<Confirmation>('/media-attendance/image/confirm', {
        session_id: sessionId,
        selections: Object.entries(selected).filter(([,id]) => id).map(([face_ref, student_id]) => ({face_ref, student_id})),
      });
      if (current !== version.current) return;
      setMessage(`${response.data.marked} marked; ${response.data.unchanged} already present or protected. ${response.data.records.filter(r => r.status === 'LATE').length} late.`);
      setPreview(null); setSelected({}); setFiles([]);
      await onConfirmed?.();
    } catch (error) { if (current === version.current) setMessage(errorMessage(error)); }
    finally { if (current === version.current) setBusy(false); }
  }
  if (!active) return <p className="text-sm text-text-muted">Start an attendance session to use Photo Attendance.</p>;
  return <section id={`photo-review-${sessionId}`} className="rounded-xl border border-border bg-surface p-4 space-y-4">
    <div><h2 className="text-lg font-bold">Photo Attendance</h2><p className="text-sm text-text-muted">Take 2–3 photos from the front at face height in good lighting. Review before saving.</p></div>
    <div className="flex flex-wrap gap-3 rounded-xl border-2 border-dashed border-border bg-surface-muted p-5" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)addFiles(event.dataTransfer.files);}}>
      <button type="button" disabled={busy || files.length >= 3} onClick={openLaptopCamera} className="rounded border px-3 py-2 disabled:opacity-40">Use laptop camera</button>
      <label className="rounded border px-3 py-2 cursor-pointer">Take photo<input aria-label="Take classroom photo" disabled={busy} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => {addFiles(e.target.files); e.target.value='';}} /></label>
      <label className="rounded border px-3 py-2 cursor-pointer">Choose photos<input aria-label="Choose classroom photos" disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={e => {addFiles(e.target.files); e.target.value='';}} /></label>
      <button disabled={busy} onClick={() => {version.current++; setFiles([]); setPreview(null); setSelected({}); setMessage('');}} className="text-sm underline">Clear</button>
    </div>
    {cameraStream && <div className="space-y-3 rounded border p-3">
      <video ref={videoRef} autoPlay playsInline muted className="max-h-[60vh] w-full rounded bg-black" aria-label="Laptop camera preview" />
      <div className="flex gap-3">
        <button type="button" onClick={captureLaptopPhoto} disabled={busy || files.length >= 3} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-40">Capture photo</button>
        <button type="button" onClick={stopCamera} className="rounded border px-4 py-2">Close camera</button>
      </div>
    </div>}
    <p className="break-words text-sm text-text-muted">{files.length}/3 photos {files.map(f => f.name).join(', ')}</p>
    <button disabled={busy || !files.length} onClick={analyze} className="rounded bg-primary text-white px-4 py-2 disabled:opacity-40">{busy ? 'Processing…' : 'Preview photos'}</button>
    {message && <p role="status" className="text-sm bg-surface-muted p-3 rounded">{message}</p>}
    {preview && <>
      {!preview.images.some(image => image.faces.length) && <p>No faces found. Move closer and try another photo.</p>}
      {preview.images.map((image, imageIndex) => <div key={image.image_id} className="grid gap-4 lg:grid-cols-2 border-t pt-4">
        <img src={image.annotated_image} alt={`Photo ${imageIndex+1}: green verified, amber needs review, red unknown`} className="w-full rounded" />
        <div className="space-y-4">{(['VERIFIED','NEEDS_REVIEW','UNKNOWN'] as Bucket[]).map(bucket => <div key={bucket}>
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
      <button disabled={busy || !Object.values(selected).some(Boolean)} onClick={confirm} className="sticky bottom-4 z-10 min-h-12 w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 font-semibold shadow-lg disabled:opacity-40">Confirm &amp; Mark Present</button>
      <p className="text-xs text-text-muted">Confirm within 15 minutes. Arrivals confirmed after the session grace period are marked LATE.</p>
    </>}
  </section>;
}
