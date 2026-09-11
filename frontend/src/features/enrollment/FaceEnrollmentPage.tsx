import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  Activity,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { Student } from '../../types/student';
import { fetchStudents } from '../../services/studentApi';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';

const POSE_INSTRUCTIONS = [
  'Look straight at the camera (Frontal)',
  'Turn your head slightly to the left (Left 15°)',
  'Turn your head slightly to the right (Right 15°)',
  'Tilt your head slightly upwards (Up 10°)',
  'Tilt your head slightly downwards (Down 10°)',
  'Smile or natural expression',
  'With glasses or accessory (if applicable)',
  'Under different ambient lighting',
  'Slight turn left 25°',
  'Slight turn right 25°',
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

interface FaceEnrollmentPageProps {
  initialStudentId?: string;
  onNavigate?: (tab: string) => void;
}

export const FaceEnrollmentPage: React.FC<FaceEnrollmentPageProps> = ({
  initialStudentId,
  onNavigate,
}) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [targetSamples, setTargetSamples] = useState<number>(6);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);
  const [enrolledThumbnails, setEnrolledThumbnails] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'camera' | 'batch_upload'>('camera');

  // Real-time detector states
  const [detectedFaces, setDetectedFaces] = useState<DetectedFaceData[]>([]);
  const [liveGuidance, setLiveGuidance] = useState<string>('Opening camera...');
  const [guidanceType, setGuidanceType] = useState<'neutral' | 'success' | 'warning'>('neutral');
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [detectorLatencyMs, setDetectorLatencyMs] = useState<number>(0);
  const [fpsCount, setFpsCount] = useState<number>(0);
  const [frameDimensions, setFrameDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);
  const fpsCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load student list
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const res = await fetchStudents({ limit: 100 });
        setStudents(res.items);
        if (!selectedStudentId && res.items.length > 0) {
          const pending = res.items.find((s) => s.enrollment_status !== 'ENROLLED');
          setSelectedStudentId(pending ? pending.id : res.items[0].id);
        }
      } catch (err) {
        console.error('Failed to load students:', err);
      }
    };
    loadStudents();
  }, [selectedStudentId]);

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam mediaDevices API not available in this browser context.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            setLiveGuidance('Align face inside the oval reticle');
            setGuidanceType('neutral');
          } catch (e) {
            console.warn('Video play error:', e);
          }
        };
      }
    } catch (err: any) {
      console.error('Failed to access webcam:', err);
      setCameraError(err.message || 'Unable to access local camera.');
      setLiveGuidance('Camera unavailable — check permissions');
      setGuidanceType('warning');
    }
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (detectionLoopRef.current) {
        clearInterval(detectionLoopRef.current);
      }
    };
  }, [activeTab]);

  // Draw Bounding Boxes and Landmarks
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
      ctx.fillStyle = isGood ? 'rgba(16, 185, 129, 0.9)' : 'rgba(245, 158, 11, 0.9)';
      const labelText = isGood
        ? `Face #${idx + 1} (${Math.round(face.confidence * 100)}%)`
        : face.rejection_reason || 'Uncertain';
      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(labelText).width;

      ctx.beginPath();
      ctx.roundRect(mirroredX1, Math.max(4, y1 - 22), textWidth + 12, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX1 + 6, Math.max(16, y1 - 8));
    });
  }, []);

  // Real-time Detection Frame Loop
  const runDetectionScan = async () => {
    if (activeTab !== 'camera' || isDetectingRef.current || !videoRef.current || !captureCanvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    isDetectingRef.current = true;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setFrameDimensions((prev) =>
      prev.w === video.videoWidth && prev.h === video.videoHeight
        ? prev
        : { w: video.videoWidth, h: video.videoHeight }
    );

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isDetectingRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        isDetectingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const tStart = performance.now();
      try {
        const res = await apiClient.post('/recognition/detect', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const elapsed = Math.round(performance.now() - tStart);
        if (debugMode) {
          setDetectorLatencyMs(elapsed);
        }
        fpsCounterRef.current += 1;

        const data = res.data;
        const faces: DetectedFaceData[] = data.faces || [];
        if (debugMode) {
          setDetectedFaces(faces);
        }

        drawBoundingBoxes(faces, video.videoWidth, video.videoHeight);

        let nextGuidance = '';
        let nextType: 'neutral' | 'success' | 'warning' = 'neutral';

        if (faces.length === 0) {
          nextGuidance = 'Face not detected — position face clearly in frame';
          nextType = 'warning';
        } else if (faces.length > 1) {
          nextGuidance = `Multiple faces (${faces.length}) detected — ensure only 1 student is in view`;
          nextType = 'warning';
        } else {
          const f = faces[0];
          if (!f.is_valid) {
            nextGuidance = f.rejection_reason || 'Hold steady for clear sample';
            nextType = 'warning';
          } else if (!f.pose.is_frontal && sampleCount === 0) {
            nextGuidance = `Face angle steep (${f.pose.pose_type}) — turn towards camera`;
            nextType = 'warning';
          } else {
            nextGuidance = 'Good sample detected — click capture';
            nextType = 'success';
          }
        }

        setLiveGuidance((prev) => (prev === nextGuidance ? prev : nextGuidance));
        setGuidanceType((prev) => (prev === nextType ? prev : nextType));
      } catch (err) {
        // quiet background frame error
      } finally {
        isDetectingRef.current = false;
      }
    }, 'image/jpeg', 0.80);
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      detectionLoopRef.current = setInterval(runDetectionScan, 350);
      const fpsInterval = setInterval(() => {
        setFpsCount(fpsCounterRef.current);
        fpsCounterRef.current = 0;
      }, 1000);

      return () => {
        if (detectionLoopRef.current) clearInterval(detectionLoopRef.current);
        clearInterval(fpsInterval);
      };
    }
  }, [activeTab, drawBoundingBoxes, sampleCount]);

  const currentInstruction = POSE_INSTRUCTIONS[sampleCount % POSE_INSTRUCTIONS.length] || 'Face sample';
  const isComplete = sampleCount >= targetSamples;

  // Capture face sample from webcam
  const handleCaptureSample = async () => {
    if (!videoRef.current || !captureCanvasRef.current || !selectedStudentId || capturing || isComplete) return;

    setCapturing(true);
    setLiveGuidance('Verifying & generating 512-d ArcFace embeddings...');
    setGuidanceType('neutral');

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

      const previewUrl = canvas.toDataURL('image/jpeg');
      const formData = new FormData();
      formData.append('file', blob, `sample_${sampleCount + 1}.jpg`);
      formData.append('pose_type', `SAMPLE_${sampleCount + 1}`);

      try {
        const response = await apiClient.post(`/students/${selectedStudentId}/enroll`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
          const nextCount = sampleCount + 1;
          setSampleCount(nextCount);
          setEnrolledThumbnails((prev) => [...prev, previewUrl]);
          setGuidanceType('success');

          if (nextCount >= targetSamples) {
            setLiveGuidance(`Enrollment complete (${nextCount} multi-pose samples active in gallery).`);
          } else {
            setLiveGuidance(`Sample ${nextCount} enrolled. Next: ${POSE_INSTRUCTIONS[nextCount % POSE_INSTRUCTIONS.length]}`);
          }
        } else {
          setGuidanceType('warning');
          setLiveGuidance(response.data.message || 'Face not clear. Please hold steady.');
        }
      } catch (err: any) {
        setGuidanceType('warning');
        setLiveGuidance(formatApiErrorMessage(err, 'Failed to process biometrics.'));
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.95);
  };

  // Batch Image File Upload
  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedStudentId) return;

    setUploadingFiles(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pose_type', `UPLOAD_${i + 1}`);

      try {
        const res = await apiClient.post(`/students/${selectedStudentId}/enroll`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          successCount++;
          const reader = new FileReader();
          reader.onload = (re) => {
            if (re.target?.result) {
              setEnrolledThumbnails((prev) => [...prev, re.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        console.warn(`Failed to enroll image ${file.name}:`, err);
      }
    }

    setSampleCount((prev) => prev + successCount);
    setUploadingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    alert(`Successfully enrolled ${successCount} out of ${files.length} photos.`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('students')}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Students</span>
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Multi-Sample Face Enrollment</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Capture 5 to 10+ multi-angle poses for robust recognition in variable lighting and distance.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'camera' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Webcam Live</span>
          </button>
          <button
            onClick={() => setActiveTab('batch_upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'batch_upload' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photos</span>
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shadow-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* Target Samples Selector & Student Selection */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Target Student</label>
          <select
            value={selectedStudentId}
            onChange={(e) => {
              setSelectedStudentId(e.target.value);
              setSampleCount(0);
              setEnrolledThumbnails([]);
              setLiveGuidance('Align face inside the frame');
              setGuidanceType('neutral');
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name} ({s.student_code || s.roll_number}) {s.enrollment_status === 'ENROLLED' ? '✓ Enrolled' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Multi-Sample Target</label>
          <div className="grid grid-cols-3 gap-2">
            {[6, 10, 15].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setTargetSamples(count)}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  targetSamples === count
                    ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {count} Samples
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* WEBCAM LIVE ENROLLMENT VIEW */}
      {activeTab === 'camera' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <canvas ref={captureCanvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Target Oval Reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-44 h-56 border-2 rounded-[50%] transition-colors duration-200 ${
                  isComplete
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : guidanceType === 'success'
                    ? 'border-emerald-400/80'
                    : guidanceType === 'warning'
                    ? 'border-amber-400/80'
                    : 'border-white/40'
                }`}
              ></div>
            </div>

            {/* Live Feed Status Pill */}
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  detectedFaces.length === 1 && detectedFaces[0].is_valid
                    ? 'bg-emerald-500 animate-pulse'
                    : detectedFaces.length > 1
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              ></span>
              <span>
                {detectedFaces.length === 0
                  ? 'Scanning...'
                  : `${detectedFaces.length} Face(s) Detected`}
              </span>
            </div>

            {/* Debug Mode Toggle */}
            <button
              onClick={() => setDebugMode(!debugMode)}
              className="absolute top-3 right-3 bg-black/60 backdrop-blur-md hover:bg-black/80 px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5 transition"
            >
              <Activity className="w-3 h-3 text-blue-400" />
              <span>{debugMode ? 'Hide Diagnostics' : 'Show Diagnostics'}</span>
            </button>
          </div>

          {/* Diagnostics Panel */}
          {debugMode && (
            <div className="p-3 bg-slate-900 rounded-xl text-slate-300 font-mono text-[11px] space-y-1 border border-slate-800">
              <div className="flex items-center justify-between text-blue-400 font-bold border-b border-slate-800 pb-1">
                <span>LIVE DETECTOR DIAGNOSTICS</span>
                <span>SCRFD-10G ONNX</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <span className="text-slate-500 block">Resolution</span>
                  <span>{frameDimensions.w} × {frameDimensions.h}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Inference</span>
                  <span className="text-emerald-400">{detectorLatencyMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Detect Rate</span>
                  <span>{fpsCount} FPS</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Faces</span>
                  <span className="text-blue-400">{detectedFaces.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* Guidance & Step Feedback */}
          <div className="text-center space-y-1.5 py-1">
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-full ${
                guidanceType === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : guidanceType === 'warning'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  guidanceType === 'success'
                    ? 'bg-emerald-500'
                    : guidanceType === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }`}
              ></span>
              <span>{liveGuidance}</span>
            </div>

            <div className="text-sm font-bold text-slate-800">
              {isComplete ? 'Enrollment Target Reached' : `Pose Guide: ${currentInstruction}`}
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Progress: {sampleCount} of {targetSamples} enrolled samples
            </div>
          </div>

          {/* Capture Trigger Button */}
          <div className="pt-2">
            {isComplete ? (
              <button
                onClick={() => onNavigate && onNavigate('students')}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Finish & Return to Students</span>
              </button>
            ) : (
              <button
                onClick={handleCaptureSample}
                disabled={capturing || !selectedStudentId}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {capturing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Extracting 512-d ArcFace Embeddings...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Capture Sample ({sampleCount + 1}/{targetSamples})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* BATCH UPLOAD VIEW */}
      {activeTab === 'batch_upload' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center space-y-3 transition bg-slate-50/50">
            <Upload className="w-10 h-10 mx-auto text-blue-500" />
            <div>
              <div className="text-sm font-bold text-slate-800">Select Multiple Face Photos</div>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload 5 to 20 images of the student (PNG, JPEG, WebP) from disk
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleBatchFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingFiles || !selectedStudentId}
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {uploadingFiles ? 'Enrolling Photos...' : 'Choose Files from Computer'}
            </button>
          </div>
        </div>
      )}

      {/* Enrolled Face Samples Grid */}
      {enrolledThumbnails.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Enrolled Face Samples ({enrolledThumbnails.length})
            </span>
            <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              Active in Vector Gallery
            </span>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            {enrolledThumbnails.map((thumb, idx) => (
              <div key={idx} className="relative group shrink-0">
                <img
                  src={thumb}
                  alt={`Sample ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-xl border-2 border-emerald-500/60 shadow-sm"
                />
                <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] px-1 rounded font-mono font-bold">
                  #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
