import { getAccessToken } from '../services/api';
import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Radio, AlertTriangle } from 'lucide-react';
import { CameraDevice } from '../types/camera';

interface CameraPreviewProps {
  camera: CameraDevice;
  className?: string;
  autoPlay?: boolean;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  camera,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [streamError, setStreamError] = useState<string | null>(null);
  const [hasReceivedFrames, setHasReceivedFrames] = useState<boolean>(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [imgError, setImgError] = useState<boolean>(false);

  // Setup stream based on camera source type
  useEffect(() => {
    setStreamError(null);
    setImgError(false);
    setHasReceivedFrames(false);

    if (camera.source_type === 'WEBCAM') {
      let isMounted = true;
      const startWebcam = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            video: camera.device_id
              ? { deviceId: { exact: camera.device_id }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!isMounted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            if (autoPlay) await videoRef.current.play();
          }
        } catch (err: unknown) {
          console.warn('Webcam preview launch error:', err);
          if (isMounted) setStreamError(err instanceof Error ? err.message : 'Could not access webcam stream.');
        }
      };

      startWebcam();

      return () => {
        isMounted = false;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    } else {
      // Remote Stream (Mobile or CCTV RTSP)
      // 1. Setup MJPEG stream fallback
      const mjpegEndpoint = `/api/v1/cameras/${camera.id}/mjpeg`;
      setSnapshotUrl(mjpegEndpoint);

      // 2. Connect high-performance WebSocket Downlink
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/cameras/${camera.id}/laptop-stream`;

      try {
        const ws = new WebSocket(wsUrl, ['sams-auth', getAccessToken() || 'missing']);
        ws.binaryType = 'blob';

        ws.onmessage = (event) => {
          if (event.data instanceof Blob) {
            setHasReceivedFrames(true);
            const blobUrl = URL.createObjectURL(event.data);
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = img.naturalWidth || 640;
                canvas.height = img.naturalHeight || 480;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              }
              URL.revokeObjectURL(blobUrl);
            };
            img.src = blobUrl;
          }
        };

        wsRef.current = ws;
      } catch (err) {
        console.warn('WebSocket downlink notice:', err);
      }

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      };
    }
  }, [camera, autoPlay]);

  const isStreaming = camera.status === 'STREAMING';
  const isNoFrame = camera.status === 'NO_FRAME' || (camera.status === 'OFFLINE' && !hasReceivedFrames);

  return (
    <div
      className={`relative bg-[#020617] rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-800 shadow-inner ${className}`}
    >
      {camera.source_type === 'WEBCAM' ? (
        streamError ? (
          <div className="text-center p-4 space-y-2 text-slate-400">
            <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto" />
            <div className="text-xs font-semibold text-[#cbd5e1]">Webcam Unavailable</div>
            <div className="text-[11px] text-slate-500 max-w-xs">{streamError}</div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay={autoPlay}
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
        )
      ) : (
        // Remote Stream: Real-Time Canvas / MJPEG Fallback
        <div className="w-full h-full relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className={`w-full h-full object-contain ${hasReceivedFrames ? 'block' : 'hidden'}`}
          />

          {!hasReceivedFrames && (
            <>
              {!imgError && snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt={camera.name}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6 text-slate-400 space-y-2">
                  {camera.source_type === 'MOBILE' ? (
                    <Smartphone className="w-8 h-8 mx-auto text-blue-400 animate-pulse" />
                  ) : (
                    <Radio className="w-8 h-8 mx-auto text-purple-400 animate-pulse" />
                  )}
                  <div className="text-xs font-semibold text-[#e2e8f0]">
                    {camera.status === 'OFFLINE'
                      ? 'Camera Feed Offline'
                      : isNoFrame
                      ? 'Waiting for Phone Stream...'
                      : 'Awaiting Frame Ingestion'}
                  </div>
                  <div className="text-[11px] text-slate-400 max-w-xs">
                    {camera.source_type === 'MOBILE'
                      ? 'Open the QR pairing link on your phone and tap "Start Camera" to stream live video.'
                      : 'Ensure RTSP IP camera endpoint is reachable on the local network.'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Floating Status HUD Overlay */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border shadow-sm ${
            isStreaming
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
              : isNoFrame
              ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
              : 'bg-[#0f172a]/80 text-slate-400 border-slate-700/50'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? 'bg-emerald-400 animate-pulse' : isNoFrame ? 'bg-amber-400' : 'bg-slate-500'
            }`}
          />
          <span>{camera.status}</span>
        </span>

        <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/80 text-[10px] font-mono border border-white/10">
          {camera.source_type}
        </span>
      </div>

      {/* Resolution & FPS Indicator Bottom Right */}
      <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono text-[#cbd5e1] border border-white/10">
        {camera.resolution} · {camera.fps > 0 ? `${camera.fps} FPS` : `${camera.target_fps} FPS (Target)`}
      </div>
    </div>
  );
};
