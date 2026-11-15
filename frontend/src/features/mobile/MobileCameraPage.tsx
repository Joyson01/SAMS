import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Play,
  RotateCw,
  Tv,
  AlertCircle,
  ShieldAlert,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { apiClient } from '../../services/api';

export const MobileCameraPage: React.FC = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const cameraIdParam = queryParams.get('camera_id') || '';
  const tokenParam = queryParams.get('token') || '';
  const sessionIdParam = queryParams.get('session_id') || '';

  const [cameraId, setCameraId] = useState<string>(cameraIdParam);
  const [cameraName, setCameraName] = useState<string>('Smartphone Station');
  const [cameraLocation, setCameraLocation] = useState<string>('');
  const [sessionValid, setSessionValid] = useState<boolean>(true);
  const [validatingSession, setValidatingSession] = useState<boolean>(!!tokenParam);

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [framesSent, setFramesSent] = useState<number>(0);
  const [liveFps, setLiveFps] = useState<number>(0);
  const [lastRecognition, setLastRecognition] = useState<string>('Ready to stream');
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<'WEBSOCKET' | 'HTTP_FALLBACK'>('WEBSOCKET');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcRef = useRef<number>(Date.now());

  // Validate Pairing Session on Mount
  useEffect(() => {
    if (!tokenParam) {
      setValidatingSession(false);
      return;
    }

    const validate = async () => {
      try {
        const res = await apiClient.get(`/cameras/pairing-session/${tokenParam}`);
        if (res.data && res.data.valid) {
          setCameraId(res.data.camera_id);
          setCameraName(res.data.camera_name || 'Mobile Camera');
          setCameraLocation(res.data.location || 'Classroom');
          setSessionValid(true);
        } else {
          setSessionValid(false);
        }
      } catch (err) {
        setSessionValid(false);
      } finally {
        setValidatingSession(false);
      }
    };

    validate();
  }, [tokenParam]);

  // Establish WebSocket Uplink to Backend
  const connectWebSocket = () => {
    if (!cameraId) return null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/cameras/${cameraId}/mobile-uplink?token=${tokenParam || ''}&session_id=${sessionIdParam || ''}`;

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'blob';

      ws.onopen = () => {
        setTransportMode('WEBSOCKET');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry') {
            setDetectedCount(data.faces_detected || 0);
            if (data.recognized && data.recognized.length > 0) {
              setLastRecognition(`Identified: ${data.recognized.join(', ')}`);
            } else if (data.faces_detected > 0) {
              setLastRecognition(`${data.faces_detected} face(s) tracking...`);
            } else {
              setLastRecognition('Scanning for faces...');
            }
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = () => {
        setTransportMode('HTTP_FALLBACK');
      };

      ws.onclose = () => {
        wsRef.current = null;
      };

      wsRef.current = ws;
      return ws;
    } catch (err) {
      setTransportMode('HTTP_FALLBACK');
      return null;
    }
  };

  const startCamera = async () => {
    setErrorMessage(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Connect WebSocket Uplink
      connectWebSocket();
      setIsStreaming(true);

      // Start frame capture loop at ~10-12 FPS (every 90ms)
      frameCountRef.current = 0;
      lastFpsCalcRef.current = Date.now();
      intervalRef.current = setInterval(sendFrameToBackend, 90);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMessage(
        'Could not access smartphone camera. Please verify camera permissions and HTTPS secure context.'
      );
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsStreaming(false);
    setLiveFps(0);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    }
  }, [facingMode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const sendFrameToBackend = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Calculate real live transmission FPS
    frameCountRef.current += 1;
    const now = Date.now();
    if (now - lastFpsCalcRef.current >= 1000) {
      setLiveFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsCalcRef.current = now;
    }

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        // Preferred Path: Fast binary WebSocket transmission
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(blob);
          setFramesSent((prev) => prev + 1);
          return;
        }

        // Fallback Path: HTTP POST
        const formData = new FormData();
        formData.append('file', blob, 'mobile_frame.jpg');
        formData.append('camera_id', cameraId);
        if (tokenParam) formData.append('token', tokenParam);
        if (sessionIdParam) formData.append('session_id', sessionIdParam);

        try {
          const res = await apiClient.post('/cameras/mobile-frame', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setFramesSent((prev) => prev + 1);
          const data = res.data;
          setDetectedCount(data.faces_detected || 0);
          if (data.results && data.results.length > 0) {
            const names = data.results
              .map((r: any) => r.name)
              .filter((n: string) => n !== 'UNKNOWN');
            if (names.length > 0) {
              setLastRecognition(`Identified: ${names.join(', ')}`);
            }
          }
        } catch (err) {
          // network frame skip
        }
      },
      'image/jpeg',
      0.75
    );
  };

  if (validatingSession) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center text-xs">
        <div className="space-y-3">
          <Smartphone className="w-10 h-10 animate-bounce mx-auto text-blue-500" />
          <p className="font-semibold">Validating wireless pairing session...</p>
        </div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm space-y-4 shadow-xl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">Pairing Session Expired</h2>
          <p className="text-xs text-slate-400">
            This wireless camera pairing token is invalid, expired, or was revoked. Please generate a new QR code from the AttedDEL console.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs text-white shadow">
            AD
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight text-slate-100">{cameraName}</h1>
            <p className="text-[11px] text-slate-400">{cameraLocation || 'Mobile Camera Station'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <span className="text-slate-300 font-semibold">
            {isStreaming ? 'Streaming' : 'Standby'}
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="my-2 p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Video Viewport */}
      <div className="my-auto space-y-3">
        <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              facingMode === 'user' ? 'transform -scale-x-100' : ''
            }`}
          />
          <canvas ref={canvasRef} className="hidden" />

          {!isStreaming && (
            <div className="text-center p-6 text-slate-400 space-y-2">
              <Tv className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium text-slate-200">Smartphone Camera Ready</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Tap "Start Camera" below to stream live video directly to the AttedDEL console preview.
              </p>
            </div>
          )}

          {/* Real-time Recognition Overlay HUD */}
          {isStreaming && (
            <div className="absolute bottom-3 inset-x-3 bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-xl text-center border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-200 font-medium truncate">{lastRecognition}</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                {detectedCount} Face(s)
              </span>
            </div>
          )}
        </div>

        {/* Telemetry Counter */}
        <div className="flex items-center justify-between px-2 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>{transportMode}</span>
          </span>
          <span>{liveFps > 0 ? `${liveFps} FPS` : ''} · Frames: {framesSent}</span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              onClick={stopCamera}
              className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]"
            >
              <Square className="w-4 h-4" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]"
            >
              <Play className="w-4 h-4" />
              <span>Start Camera</span>
            </button>
          )}

          <button
            onClick={toggleFacingMode}
            className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition active:scale-[0.98]"
            title="Switch Front / Rear Camera"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[10px] text-center text-slate-500">
          Keep this browser window active on your phone while capturing classroom attendance.
        </p>
      </div>
    </div>
  );
};
