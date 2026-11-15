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
  const version = useRef(0);
  useEffect(() => {
    version.current++; setFiles([]); setPreview(null); setSelected({}); setMessage(''); setBusy(false);
    return () => { version.current++; };
  }, [sessionId, active]);
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
  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > 3) { setMessage('Choose at most three photos. Clear the selection to start again.'); return; }
    if (next.some(file => file.size > 15 * 1024 * 1024)) { setMessage('Each photo must be at most 15 MB.'); return; }
    version.current++; setFiles(next); setPreview(null); setSelected({}); setMessage('');
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
  if (!active) return <p className="text-sm text-slate-500">Start an attendance session to use Photo Attendance.</p>;
  return <section id={`photo-review-${sessionId}`} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <div><h2 className="text-lg font-bold">Photo Attendance</h2><p className="text-sm text-slate-500">Take 2–3 photos from the front at face height in good lighting. Review before saving.</p></div>
    <div className="flex flex-wrap gap-3">
      <label className="rounded border px-3 py-2 cursor-pointer">Take photo<input aria-label="Take classroom photo" disabled={busy} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => {addFiles(e.target.files); e.target.value='';}} /></label>
      <label className="rounded border px-3 py-2 cursor-pointer">Choose photos<input aria-label="Choose classroom photos" disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={e => {addFiles(e.target.files); e.target.value='';}} /></label>
      <button disabled={busy} onClick={() => {version.current++; setFiles([]); setPreview(null); setSelected({}); setMessage('');}} className="text-sm underline">Clear</button>
    </div>
    <p className="text-sm">{files.length}/3 photos {files.map(f => f.name).join(', ')}</p>
    <button disabled={busy || !files.length} onClick={analyze} className="rounded bg-blue-700 text-white px-4 py-2 disabled:opacity-40">{busy ? 'Processing…' : 'Preview photos'}</button>
    {message && <p role="status" className="text-sm bg-slate-100 p-3 rounded">{message}</p>}
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
      <button disabled={busy || !Object.values(selected).some(Boolean)} onClick={confirm} className="rounded bg-emerald-700 text-white px-4 py-2 disabled:opacity-40">Confirm &amp; Mark Present</button>
      <p className="text-xs text-slate-500">Confirm within 15 minutes. Arrivals confirmed after the session grace period are marked LATE.</p>
    </>}
  </section>;
}
