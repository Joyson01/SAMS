import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

type DetectionResult = {
  mode: 'anonymous';
  frame_width: number;
  frame_height: number;
  face_count: number;
  latency_ms: number;
  faces: { bbox: [number, number, number, number]; detection_score: number; small_face: boolean }[];
};

export function AnonymousDetectionPage() {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function analyze(file: File) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult(null);
    setError('');
    setPreview(null);
    if (!file.size || file.size > 15 * 1024 * 1024) {
      setError('Choose a nonempty image up to 15 MB.');
      return;
    }
    setPreview({ url: URL.createObjectURL(file), name: file.name });
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await apiClient.post<DetectionResult>('/detection/photo', form, {
        signal: controller.signal,
        timeout: 120000,
      });
      if (!controller.signal.aborted) setResult(response.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(formatApiErrorMessage(cause, 'Unable to detect faces. Please try again.'));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const smallCount = result?.faces.filter(face => face.small_face).length ?? 0;

  return <div className="space-y-6 text-text">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">Anonymous detection</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
        Locate visible faces in a photo. This mode does not identify people or record attendance.
      </p>
    </header>
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-6" aria-busy={busy}>
      <label className="block text-sm font-medium" htmlFor="anonymous-photo">Choose the original photo</label>
      <p id="anonymous-photo-help" className="mt-1 text-xs text-text-muted">Still JPEG, PNG or WebP · up to 15 MB and 24 megapixels</p>
      <input id="anonymous-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        aria-describedby="anonymous-photo-help" className="mt-4 block w-full max-w-full text-sm"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void analyze(file);
        }} />
      <div role="status" aria-live="polite" className="mt-5 text-sm">
        {busy ? 'Finding visible faces… The first run may take a little longer.' : result
          ? `${result.face_count} ${result.face_count === 1 ? 'face' : 'faces'} detected`
          : 'Upload a photo to check detection.'}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {result && <div className="mt-2 space-y-2 text-sm text-text-muted">
        <p>{result.frame_width} × {result.frame_height} pixels · {(result.latency_ms / 1000).toFixed(1)} seconds</p>
        {smallCount > 0 && <p>{smallCount} small {smallCount === 1 ? 'face needs' : 'faces need'} visual review (dashed boxes).</p>}
        {result.face_count === 0 && <p>No visible faces found. Try a clearer photo with faces turned toward the camera.</p>}
      </div>}
      {preview && <figure className="mt-5">
        <div className="relative mx-auto max-w-4xl">
          <img src={preview.url} alt="Uploaded photo for anonymous face detection" className="block h-auto w-full rounded-lg" />
          {result && <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${result.frame_width} ${result.frame_height}`}
            role="img" aria-label={`${result.face_count} detected face boxes`}>
            {result.faces.map((face, index) => {
              const [x1, y1, x2, y2] = face.bbox;
              return <rect key={index} x={x1} y={y1} width={x2 - x1} height={y2 - y1}
                fill="none" stroke={face.small_face ? '#fbbf24' : '#34d399'} strokeWidth="2"
                strokeDasharray={face.small_face ? '5 3' : undefined} vectorEffect="non-scaling-stroke">
                <title>{`Face ${index + 1}${face.small_face ? ', small: review visually' : ''}`}</title>
              </rect>;
            })}
          </svg>}
        </div>
        <figcaption className="mt-3 break-words text-xs text-text-muted">{preview.name}</figcaption>
      </figure>}
    </section>
    <p className="max-w-2xl text-sm leading-relaxed text-text-muted">
      This is a count of detected faces, not everyone in the room. Small, covered or turned-away faces may be missed. Check the boxes visually.
    </p>
  </div>;
}
