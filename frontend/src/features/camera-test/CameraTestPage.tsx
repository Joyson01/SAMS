import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sliders,
  Tv,
  ArrowLeft,
} from 'lucide-react';

interface DeviceItem {
  deviceId: string;
  label: string;
}

export const CameraTestPage: React.FC = () => {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraState, setCameraState] = useState<'IDLE' | 'CONNECTING' | 'LIVE' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState<number>(0);
  const [videoHeight, setVideoHeight] = useState<number>(0);
  const [trackLabel, setTrackLabel] = useState<string>('');
  const [trackState, setTrackState] = useState<string>('');
  const [fps, setFps] = useState<number>(0);
  const [isSecure, setIsSecure] = useState<boolean>(false);
  const [testSnapshotUrl, setTestSnapshotUrl] = useState<string | null>(null);
  const [avgLuminance, setAvgLuminance] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameCountRef = useRef<number>(0);

  // Check secure context and enumerate devices
  useEffect(() => {
    setIsSecure(window.isSecureContext);

    const loadDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          throw new Error('navigator.mediaDevices is not available. Please verify HTTPS or localhost context.');
        }

        // Trigger initial permission if needed to get labels
        const initialDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = initialDevices
          .filter((d) => d.kind === 'videoinput')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${idx + 1} (${d.deviceId ? d.deviceId.slice(0, 8) : 'Integrated'})`,
          }));

        setDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err: any) {
        console.error('Failed to enumerate devices:', err);
        setErrorMessage(err.message || 'Could not list video devices.');
      }
    };

    loadDevices();
  }, []);

  // Start Camera Stream
  const startCamera = async (deviceIdToUse?: string) => {
    setCameraState('CONNECTING');
    setErrorMessage(null);
    setTestSnapshotUrl(null);
    setAvgLuminance(null);

    try {
      // Stop old tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is unavailable in this environment.');
      }

      const constraints: MediaStreamConstraints = {
        video: deviceIdToUse
          ? { deviceId: { exact: deviceIdToUse }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch (playErr) {
          console.warn('Auto video.play() warning:', playErr);
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setTrackLabel(videoTrack.label || 'Default Video Track');
        setTrackState(videoTrack.readyState);
      }

      setCameraState('LIVE');

      // Refresh device labels if they were blank before permission
      const updatedDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = updatedDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setDevices(videoInputs);
    } catch (err: any) {
      console.error('getUserMedia failure:', err);
      setCameraState('ERROR');
      let msg = err.message || 'Unknown camera error';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please click the lock/camera icon in your browser address bar and select "Allow".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware found on this computer.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera hardware is busy or in use by another program (e.g. Chrome tab, Zoom, OBS).';
      } else if (err.name === 'SecurityError') {
        msg = 'Insecure context. Camera access requires HTTPS or http://localhost.';
      }
      setErrorMessage(msg);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('IDLE');
    setVideoWidth(0);
    setVideoHeight(0);
    setTrackLabel('');
    setTrackState('stopped');
  };

  // Launch camera when selectedDeviceId is ready
  useEffect(() => {
    startCamera(selectedDeviceId || undefined);
    return () => stopCamera();
  }, [selectedDeviceId]);

  // Track video dimensions and FPS
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        setVideoWidth(videoRef.current.videoWidth);
        setVideoHeight(videoRef.current.videoHeight);
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Frame counter via requestVideoFrameCallback or standard loop
  useEffect(() => {
    let animId: number;
    const countFrame = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        frameCountRef.current += 1;
      }
      animId = requestAnimationFrame(countFrame);
    };
    animId = requestAnimationFrame(countFrame);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Capture test snapshot to verify non-black pixels
  const handleTestSnapshot = () => {
    if (!videoRef.current || !snapshotCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = snapshotCanvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setTestSnapshotUrl(dataUrl);

    // Compute average pixel luminance to prove it is not a black frame
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let totalLuma = 0;
    const step = 4 * 10; // sample every 10th pixel for speed
    let samples = 0;
    for (let i = 0; i < imgData.length; i += step) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      totalLuma += 0.299 * r + 0.587 * g + 0.114 * b;
      samples++;
    }
    const avg = samples > 0 ? Math.round(totalLuma / samples) : 0;
    setAvgLuminance(avg);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </a>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Hardware Camera Diagnostic Test</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Isolated webcam inspection without AI models or attendance dependencies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {cameraState === 'LIVE' ? (
            <button
              onClick={stopCamera}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition"
            >
              Stop Camera
            </button>
          ) : (
            <button
              onClick={() => startCamera(selectedDeviceId)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
            >
              Start Camera
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm">Camera Connection Failed</div>
            <p>{errorMessage}</p>
            <div className="text-[11px] text-rose-700 pt-1">
              Secure Context: {isSecure ? 'Active (HTTPS / Localhost)' : 'Insecure (Camera access restricted)'}
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport & Device Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Video Viewport */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-3">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
              {/* The Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={async () => {
                  if (videoRef.current) {
                    setVideoWidth(videoRef.current.videoWidth);
                    setVideoHeight(videoRef.current.videoHeight);
                    try {
                      await videoRef.current.play();
                    } catch (e) {
                      console.warn('Play error on loadedmetadata:', e);
                    }
                  }
                }}
                className="w-full h-full object-contain"
              />
              <canvas ref={snapshotCanvasRef} className="hidden" />

              {cameraState === 'CONNECTING' && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center space-y-2 text-white">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-xs font-semibold">Negotiating camera hardware stream...</span>
                </div>
              )}

              {cameraState === 'IDLE' && (
                <div className="text-center text-slate-500 space-y-2 p-6">
                  <Tv className="w-10 h-10 mx-auto text-slate-700" />
                  <p className="text-xs font-semibold text-slate-400">Camera stream stopped</p>
                </div>
              )}

              {/* Status Badge */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-2 border border-white/10">
                <span
                  className={`w-2 h-2 rounded-full ${
                    cameraState === 'LIVE'
                      ? 'bg-emerald-500 animate-pulse'
                      : cameraState === 'CONNECTING'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                ></span>
                <span>
                  {cameraState === 'LIVE'
                    ? `Live Feed (${videoWidth} × ${videoHeight})`
                    : cameraState === 'CONNECTING'
                    ? 'Connecting...'
                    : 'Offline'}
                </span>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center justify-between pt-1 px-1">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>Select Hardware Source:</span>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500 font-medium"
                >
                  {devices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleTestSnapshot}
                disabled={cameraState !== 'LIVE'}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verify Frame Snapshot</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Telemetry & Snapshot Inspector */}
        <div className="lg:col-span-4 space-y-4">
          {/* Telemetry Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
              Hardware Stream Telemetry
            </h3>

            <div className="space-y-2 font-mono text-xs text-slate-700">
              <div className="flex justify-between border-b border-slate-50 pb-1">
                <span className="text-slate-400 font-sans">Status:</span>
                <span className={`font-bold ${cameraState === 'LIVE' ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {cameraState}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1">
                <span className="text-slate-400 font-sans">Resolution:</span>
                <span className="font-bold">{videoWidth} × {videoHeight}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1">
                <span className="text-slate-400 font-sans">Stream Rate:</span>
                <span className="text-blue-600 font-bold">{fps} FPS</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1">
                <span className="text-slate-400 font-sans">Track State:</span>
                <span className="font-bold">{trackState || 'None'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-1">
                <span className="text-slate-400 font-sans">Device Label:</span>
                <span className="text-[11px] truncate max-w-[150px]" title={trackLabel}>
                  {trackLabel || 'Unlabeled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Secure Context:</span>
                <span className={isSecure ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                  {isSecure ? 'YES (HTTPS)' : 'NO'}
                </span>
              </div>
            </div>
          </div>

          {/* Snapshot Verification Card */}
          {testSnapshotUrl && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Verified Frame Buffer
                </h3>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <img
                src={testSnapshotUrl}
                alt="Verified snapshot"
                className="w-full rounded-lg border border-slate-200 aspect-video object-cover"
              />
              <div className="text-[11px] font-mono text-slate-600 flex justify-between pt-1">
                <span>Avg Luminance: {avgLuminance} / 255</span>
                <span className={avgLuminance && avgLuminance > 15 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                  {avgLuminance && avgLuminance > 15 ? 'Valid RGB Feed' : 'Low Light'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

