import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { apiClient } from '../../services/api';
import { fetchStudentById } from '../../services/studentApi';
import { Student } from '../../types/student';
import { formatApiErrorMessage } from '../../utils/apiError';

const TARGET_SAMPLES = 6;
const INSTRUCTIONS = [
  'Look straight at the camera',
  'Turn your head slightly left',
  'Turn your head slightly right',
  'Tilt your chin slightly up',
  'Tilt your chin slightly down',
  'Natural smile or neutral face',
];

interface DetectedFaceData {
  box: [number, number, number, number];
  confidence: number;
  landmarks: [number, number][];
  sharpness: number;
  brightness: number;
  is_valid: boolean;
  rejection_reason?: string | null;
  pose: {
    yaw: number;
    pitch: number;
    roll: number;
    is_frontal: boolean;
    pose_type: string;
  };
}

export const MobileEnrollmentPage: React.FC = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const studentId = queryParams.get('student_id') || '';

  const [student, setStudent] = useState<Student | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Align your face inside the frame');
  const [statusType, setStatusType] = useState<'neutral' | 'success' | 'warning'>('neutral');
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFaceData[]>([]);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<any>(null);
  const isScanningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!studentId) {
      setErrorMessage('No student ID provided in enrollment link.');
      return;
    }
    const loadStudent = async () => {
      try {
        const s = await fetchStudentById(studentId);
        setStudent(s);
      } catch (err) {
        console.error('Failed to load student details:', err);
        setErrorMessage('Could not load student profile. Check your connection.');
      }
    };
    loadStudent();
  }, [studentId]);

  const drawBoundingBoxes = useCallback((faces: DetectedFaceData[], vWidth: number, vHeight: number) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = vWidth;
    canvas.height = vHeight;
    ctx.clearRect(0, 0, vWidth, vHeight);

    if (faces.length === 0) return;

    faces.forEach((face, idx) => {
      const [x1, y1, x2, y2] = face.box;
      const boxW = x2 - x1;
      const boxH = y2 - y1;
      const mirroredX1 = vWidth - x2;

      const isGood = face.is_valid && faces.length === 1;
      const strokeColor = isGood ? '#10b981' : '#f59e0b';

      // Bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(mirroredX1, y1, boxW, boxH, 8);
      ctx.stroke();

      // Landmarks
      if (face.landmarks && face.landmarks.length > 0) {
        ctx.fillStyle = '#60a5fa';
        face.landmarks.forEach(([lx, ly]) => {
          const mlx = vWidth - lx;
          ctx.beginPath();
          ctx.arc(mlx, ly, 3, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

      // Label chip
      ctx.fillStyle = isGood ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.85)';
      const labelText = isGood
        ? `Face #${idx + 1} (${Math.round(face.confidence * 100)}%)`
        : face.rejection_reason || 'Uncertain';
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(labelText).width;

      ctx.beginPath();
      ctx.roundRect(mirroredX1, Math.max(4, y1 - 20), textWidth + 12, 16, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX1 + 6, Math.max(15, y1 - 7));
    });
  }, []);

  const runDetectionScan = async () => {
    if (isScanningRef.current || !videoRef.current || !captureCanvasRef.current || isFinished) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    isScanningRef.current = true;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isScanningRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        isScanningRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const t0 = performance.now();
      try {
        const res = await apiClient.post('/recognition/detect', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setLatencyMs(Math.round(performance.now() - t0));
        const faces: DetectedFaceData[] = res.data.faces || [];
        setDetectedFaces(faces);

        drawBoundingBoxes(faces, video.videoWidth, video.videoHeight);

        if (faces.length === 0) {
          setStatusMessage('Face not detected — look directly into camera');
          setStatusType('warning');
        } else if (faces.length > 1) {
          setStatusMessage(`Multiple faces (${faces.length}) detected`);
          setStatusType('warning');
        } else {
          const f = faces[0];
          if (!f.is_valid) {
            setStatusMessage(f.rejection_reason || 'Hold steady for a clear photo');
            setStatusType('warning');
          } else {
            setStatusMessage('Good sample detected — tap button to capture');
            setStatusType('success');
          }
        }
      } catch (err) {
        // quiet frame error
      } finally {
        isScanningRef.current = false;
      }
    }, 'image/jpeg', 0.80);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatusMessage('Camera online. Detecting face...');
    } catch (err: any) {
      console.error('Camera error:', err);
      setErrorMessage(`Camera error (${err.name}): Please ensure HTTPS and camera permissions.`);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
  };

  useEffect(() => {
    startCamera();
    loopRef.current = setInterval(runDetectionScan, 400);
    return () => stopCamera();
  }, [drawBoundingBoxes, isFinished]);

  const handleCapture = async () => {
    if (!videoRef.current || !captureCanvasRef.current || !studentId || capturing || isFinished) return;

    setCapturing(true);
    setStatusMessage('Checking sample quality & embeddings...');
    setStatusType('neutral');

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCapturing(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, `mobile_sample_${sampleCount + 1}.jpg`);
      formData.append('pose_type', `SAMPLE_${sampleCount + 1}`);

      try {
        const response = await apiClient.post(`/students/${studentId}/enroll`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
          const nextCount = sampleCount + 1;
          setSampleCount(nextCount);
          setStatusType('success');

          if (nextCount >= TARGET_SAMPLES) {
            setIsFinished(true);
            setStatusMessage('Enrollment complete! Profile saved.');
          } else {
            setStatusMessage(`Sample ${nextCount} saved. Next: ${INSTRUCTIONS[nextCount]}`);
          }
        } else {
          setStatusType('warning');
          setStatusMessage(response.data.message || 'Face not clear. Please hold steady.');
        }
      } catch (err: any) {
        setStatusType('warning');
        setStatusMessage(formatApiErrorMessage(err, 'Error processing sample.'));
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 max-w-md mx-auto font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs text-white">
            AD
          </div>
          <div>
            <h1 className="font-bold text-sm leading-none">AttedDEL</h1>
            <p className="text-[10px] text-slate-400">Smart Attendance — Mobile Face Enrollment</p>
          </div>
        </div>

        {student && (
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-200 block">
              {student.first_name} {student.last_name}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{student.student_code}</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="my-2 p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Completion View or Camera View */}
      {isFinished ? (
        <div className="my-auto bg-slate-800/80 border border-slate-700 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Enrollment Complete!</h2>
            <p className="text-xs text-slate-400">
              Your biometric profile has been successfully generated and verified. You can now use automated face attendance in class.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
            {student?.first_name} {student?.last_name} ({student?.student_code})
          </div>
        </div>
      ) : (
        <div className="my-auto space-y-3">
          {/* Camera Oval Frame with Canvas Overlay */}
          <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <canvas ref={captureCanvasRef} className="hidden" />
            <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {/* Target Reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-44 h-56 border-2 rounded-[50%] transition-colors duration-200 ${
                  statusType === 'success'
                    ? 'border-emerald-400/80'
                    : statusType === 'warning'
                    ? 'border-amber-400/80'
                    : 'border-white/40'
                }`}
              ></div>
            </div>

            {/* Instruction Overlay */}
            <div className="absolute bottom-3 inset-x-3 bg-black/75 backdrop-blur-md px-3 py-2 rounded-xl text-center border border-white/10">
              <span className="text-xs font-semibold text-slate-200 block">
                {INSTRUCTIONS[sampleCount] || 'Hold steady'}
              </span>
              <span className="text-[10px] text-slate-400">
                Sample {sampleCount} of {TARGET_SAMPLES}
              </span>
            </div>

            {/* Debug Toggle */}
            <button
              onClick={() => setDebugMode(!debugMode)}
              className="absolute top-3 right-3 bg-black/60 px-2 py-1 rounded-full text-[10px] text-slate-300 flex items-center gap-1"
            >
              <Activity className="w-3 h-3 text-blue-400" />
              <span>{debugMode ? 'Hide' : 'Debug'}</span>
            </button>
          </div>

          {debugMode && (
            <div className="p-2 bg-slate-800 rounded-lg text-[10px] font-mono text-slate-300 flex justify-between">
              <span>Latency: {latencyMs}ms</span>
              <span>Faces: {detectedFaces.length}</span>
              <span>Detector: SCRFD-10G</span>
            </div>
          )}

          {/* Status Message */}
          <div
            className={`p-2.5 rounded-xl text-xs text-center font-medium ${
              statusType === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : statusType === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {statusMessage}
          </div>
        </div>
      )}

      {/* Bottom Button */}
      {!isFinished && (
        <div className="pt-2">
          <button
            onClick={handleCapture}
            disabled={capturing || !studentId}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition disabled:opacity-50"
          >
            {capturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing Biometrics...</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Take Photo ({sampleCount + 1}/{TARGET_SAMPLES})</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
