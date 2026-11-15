import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Film,
  Upload,
  Play,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
  Trash2,
  X,
  StopCircle,
  AlertCircle,
  AlertTriangle,
  Check,
  ArrowRight,
  Sparkles,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import { fetchSessions } from '../../services/attendanceApi';
import { AttendanceSession } from '../../types/attendance';
import {
  analyzeImageAttendance,
  processVideoAttendance,
  fetchMediaJobs,
  fetchMediaJob,
  cancelMediaJob,
  deleteMediaJob,
  validateSessionBiometrics,
} from '../../services/mediaAttendanceApi';
import {
  MediaAnalysisResponse,
  MediaJobResponse,
  SessionBiometricValidationResponse,
} from '../../types/mediaAttendance';
import { formatApiErrorMessage } from '../../utils/apiError';

interface MediaAttendancePageProps {
  onNavigate?: (tab: string, extra?: any) => void;
}

const MAX_IMAGE_SIZE_MB = 20;
const MAX_VIDEO_SIZE_MB = 500;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_VIDEO_EXTS = ['.mp4', '.avi', '.mkv', '.mov', '.webm'];

/** Safe rounded rectangle drawing helper with universal browser canvas fallback */
function drawCanvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number = 4
) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export const MediaAttendancePage: React.FC<MediaAttendancePageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [sessionBiometrics, setSessionBiometrics] = useState<SessionBiometricValidationResponse | null>(null);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Image Mode State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<{ dimensions: string; size: string; width: number; height: number } | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState<boolean>(false);
  const [imageResult, setImageResult] = useState<MediaAnalysisResponse | null>(null);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);

  // Video Mode State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    duration: string;
    resolution: string;
    size: string;
  } | null>(null);
  const [sampleFps, setSampleFps] = useState<number>(3.0);
  const [activeVideoJob, setActiveVideoJob] = useState<MediaJobResponse | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  // History & Jobs State
  const [jobs, setJobs] = useState<MediaJobResponse[]>([]);
  const [selectedJobDetails, setSelectedJobDetails] = useState<MediaJobResponse | null>(null);

  // Refs for cleanup and overlay canvas
  const imageOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const imagePreviewRef = useRef<HTMLImageElement>(null);
  const pollIntervalRef = useRef<any>(null);
  const activeImageBlobUrlRef = useRef<string | null>(null);
  const activeVideoBlobUrlRef = useRef<string | null>(null);

  // Clean up object URLs upon unmount to prevent browser memory leaks
  useEffect(() => {
    return () => {
      if (activeImageBlobUrlRef.current) {
        try {
          URL.revokeObjectURL(activeImageBlobUrlRef.current);
        } catch (_) {}
      }
      if (activeVideoBlobUrlRef.current) {
        try {
          URL.revokeObjectURL(activeVideoBlobUrlRef.current);
        } catch (_) {}
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Load Sessions & History
  const loadData = useCallback(async () => {
    setLoadingSessions(true);
    setErrorMessage(null);
    try {
      const [sessionList, jobList] = await Promise.all([
        fetchSessions(),
        fetchMediaJobs(),
      ]);
      const validSessions = Array.isArray(sessionList) ? sessionList : [];
      setSessions(validSessions);
      setJobs(Array.isArray(jobList) ? jobList : []);

      const active = validSessions.find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSessionId(active.id);
      } else if (validSessions.length > 0) {
        setSelectedSessionId(validSessions[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load media attendance resources:', err);
      setErrorMessage('Failed to connect to backend server. Please verify services are running.');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load Session Biometric Enrollment Stats
  const loadSessionValidation = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setSessionBiometrics(null);
      return;
    }
    try {
      const res = await validateSessionBiometrics(sessionId);
      setSessionBiometrics(res);
    } catch (err) {
      console.warn('Could not load session biometric validation:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionValidation(selectedSessionId);
    }
  }, [selectedSessionId, loadSessionValidation]);

  // Video Progress Polling
  useEffect(() => {
    if (activeVideoJob && (activeVideoJob.status === 'PROCESSING' || activeVideoJob.status === 'QUEUED')) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const updated = await fetchMediaJob(activeVideoJob.id);
          if (updated) {
            setActiveVideoJob(updated);
            if (updated.status === 'COMPLETED' || updated.status === 'FAILED' || updated.status === 'CANCELLED') {
              clearInterval(pollIntervalRef.current);
              const refreshedJobs = await fetchMediaJobs();
              setJobs(Array.isArray(refreshedJobs) ? refreshedJobs : []);
              if (updated.status === 'COMPLETED') {
                setSuccessMessage(`Video processing completed! ${updated.attendance_marked_count} attendance records marked.`);
              } else if (updated.status === 'FAILED') {
                setErrorMessage(`Video processing failed: ${updated.error_message || 'Engine error'}`);
              }
            }
          }
        } catch (err) {
          console.error('Error polling video job:', err);
        }
      }, 1500);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeVideoJob]);

  // Draw Bounding Boxes Over Image Preview
  const drawImageBoundingBoxes = useCallback((faces: any[], imgEl: HTMLImageElement | null) => {
    const canvas = imageOverlayCanvasRef.current;
    if (!canvas || !imgEl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nw = imgEl.naturalWidth || 800;
    const nh = imgEl.naturalHeight || 600;

    canvas.width = nw;
    canvas.height = nh;
    ctx.clearRect(0, 0, nw, nh);

    if (!showOverlays || !Array.isArray(faces) || faces.length === 0) return;

    faces.forEach((face) => {
      const bbox = Array.isArray(face.bbox) ? face.bbox : [];
      if (bbox.length < 4) return;
      const [x1, y1, x2, y2] = bbox;
      const boxW = Math.max(1, x2 - x1);
      const boxH = Math.max(1, y2 - y1);

      const status = face.status || 'UNKNOWN';
      const isVerified = status === 'VERIFIED';
      const isVerifying = status === 'VERIFYING';
      const isLowQuality = status === 'LOW_QUALITY';

      let strokeColor = '#94a3b8'; // Slate
      let bgColor = 'rgba(51, 65, 85, 0.95)';
      let label = 'UNKNOWN PERSON';
      const confVal = Math.round((face.recognition_confidence || face.confidence || 0) * 100);
      let subLabel = `${confVal}% Similarity`;

      if (isLowQuality) {
        strokeColor = '#f43f5e';
        bgColor = 'rgba(225, 29, 72, 0.95)';
        label = 'LOW QUALITY FACE';
        subLabel = face.rejection_reason || 'Blurry / steep angle';
      } else if (isVerified) {
        strokeColor = '#10b981';
        bgColor = 'rgba(5, 150, 105, 0.95)';
        label = `${(face.identity || 'STUDENT').toUpperCase()} (VERIFIED • ${confVal}%)`;
        subLabel = 'MARKED PRESENT';
      } else if (isVerifying) {
        strokeColor = '#f59e0b';
        bgColor = 'rgba(217, 119, 6, 0.95)';
        label = `POSSIBLE MATCH (${confVal}%)`;
        subLabel = 'Needs Review • Unconfirmed';
      }

      // Draw Face Bounding Box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isVerified ? 4 : 3;
      ctx.beginPath();
      drawCanvasRoundRect(ctx, x1, y1, boxW, boxH, 8);
      ctx.stroke();

      // Top label badge
      ctx.font = 'bold 12px Inter, sans-serif';
      const mainTextWidth = ctx.measureText(label).width;
      const subTextWidth = ctx.measureText(subLabel).width;
      const pillWidth = Math.max(mainTextWidth, subTextWidth) + 18;
      const pillHeight = 34;
      const pillY = Math.max(6, y1 - pillHeight - 4);

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      drawCanvasRoundRect(ctx, x1, pillY, pillWidth, pillHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x1 + 8, pillY + 14);

      ctx.font = 'normal 10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(subLabel, x1 + 8, pillY + 28);
    });
  }, [showOverlays]);

  // Re-render bounding boxes when results or overlay toggle changes
  useEffect(() => {
    if (imagePreviewRef.current) {
      if (imageResult?.faces && showOverlays) {
        drawImageBoundingBoxes(imageResult.faces, imagePreviewRef.current);
      } else {
        const canvas = imageOverlayCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [imageResult, showOverlays, drawImageBoundingBoxes]);

  // Handle Image Selection with Complete File Validation & Safe Object URL
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. File size check
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_IMAGE_SIZE_MB) {
      setErrorMessage(`Image file is too large (${sizeMb.toFixed(1)} MB). Maximum allowed size is ${MAX_IMAGE_SIZE_MB} MB.`);
      return;
    }

    // 2. File type check
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !ALLOWED_IMAGE_EXTS.includes(ext)) {
      setErrorMessage(`Unsupported image format (${file.type || ext}). Please upload a JPEG, PNG, or WEBP photo.`);
      return;
    }

    // 3. Clean up previous object URL if any
    if (activeImageBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeImageBlobUrlRef.current);
      } catch (_) {}
    }

    // 4. Create safe object URL
    try {
      const url = URL.createObjectURL(file);
      activeImageBlobUrlRef.current = url;
      setImageFile(file);
      setImageResult(null);
      setImagePreviewUrl(url);

      const img = new Image();
      img.onload = () => {
        setImageMetadata({
          dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
          size: `${sizeMb.toFixed(2)} MB`,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = () => {
        setErrorMessage('Failed to decode image file. Please verify file is not corrupted.');
      };
      img.src = url;
    } catch (urlErr) {
      console.error('Error creating image preview URL:', urlErr);
      setErrorMessage('Could not load image preview. Please try another file.');
    }
  };

  // Handle Video Selection with Complete Validation & Safe Object URL
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. File size check
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_VIDEO_SIZE_MB) {
      setErrorMessage(`Video file is too large (${sizeMb.toFixed(1)} MB). Maximum allowed size is ${MAX_VIDEO_SIZE_MB} MB.`);
      return;
    }

    // 2. File type check
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_VIDEO_EXTS.includes(ext)) {
      setErrorMessage(`Unsupported video format (${ext}). Allowed formats: ${ALLOWED_VIDEO_EXTS.join(', ')}.`);
      return;
    }

    // 3. Clean up previous video object URL
    if (activeVideoBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeVideoBlobUrlRef.current);
      } catch (_) {}
    }

    // 4. Create safe video URL
    try {
      const url = URL.createObjectURL(file);
      activeVideoBlobUrlRef.current = url;
      setVideoFile(file);
      setActiveVideoJob(null);
      setVideoPreviewUrl(url);

      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        const dur = Math.round(vid.duration || 0);
        const mins = Math.floor(dur / 60);
        const secs = dur % 60;
        setVideoMetadata({
          duration: `${mins}m ${secs}s`,
          resolution: `${vid.videoWidth || 0} × ${vid.videoHeight || 0} px`,
          size: `${sizeMb.toFixed(2)} MB`,
        });
      };
      vid.onerror = () => {
        setErrorMessage('Failed to read video metadata.');
      };
      vid.src = url;
    } catch (urlErr) {
      console.error('Error creating video preview URL:', urlErr);
      setErrorMessage('Could not load video preview. Please try another file.');
    }
  };

  // Submit Image Analysis & Mark Attendance
  const handleAnalyzeImage = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedSessionId) {
      setErrorMessage('Please select an attendance session first.');
      return;
    }
    if (!imageFile) {
      setErrorMessage('Please select a classroom image to analyze.');
      return;
    }

    setAnalyzingImage(true);
    setImageResult(null);
    try {
      const res = await analyzeImageAttendance(selectedSessionId, imageFile);
      setImageResult(res);

      if (imagePreviewRef.current && res?.faces) {
        drawImageBoundingBoxes(res.faces, imagePreviewRef.current);
      }

      const refreshedJobs = await fetchMediaJobs();
      setJobs(Array.isArray(refreshedJobs) ? refreshedJobs : []);
      setSuccessMessage(
        `Analysis complete: ${res.faces_detected || 0} detected, ${res.recognized_count || 0} verified, ${res.attendance_marked_count || 0} marked present.`
      );
    } catch (err: any) {
      console.error('Error in analyzeImageAttendance:', err);
      const msg = formatApiErrorMessage(err, 'Unable to process image. Please verify format and try again.');
      setErrorMessage(msg);
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Submit Video Processing
  const handleAnalyzeVideo = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedSessionId) {
      setErrorMessage('Please select an attendance session first.');
      return;
    }
    if (!videoFile) {
      setErrorMessage('Please choose a video file to process.');
      return;
    }

    setUploadingVideo(true);
    try {
      const job = await processVideoAttendance(selectedSessionId, videoFile, sampleFps);
      setActiveVideoJob(job);
      const refreshedJobs = await fetchMediaJobs();
      setJobs(Array.isArray(refreshedJobs) ? refreshedJobs : []);
    } catch (err: any) {
      console.error('Error in processVideoAttendance:', err);
      const msg = formatApiErrorMessage(err, 'Failed to submit video for processing.');
      setErrorMessage(msg);
    } finally {
      setUploadingVideo(false);
    }
  };

  // Cancel Video Job
  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelMediaJob(jobId);
      if (activeVideoJob?.id === jobId) {
        setActiveVideoJob((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
      }
      const refreshedJobs = await fetchMediaJobs();
      setJobs(Array.isArray(refreshedJobs) ? refreshedJobs : []);
      setSuccessMessage('Video processing job cancelled.');
    } catch (err) {
      setErrorMessage(formatApiErrorMessage(err, 'Could not cancel job.'));
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId: string) => {
    try {
      await deleteMediaJob(jobId);
      if (activeVideoJob?.id === jobId) setActiveVideoJob(null);
      if (selectedJobDetails?.id === jobId) setSelectedJobDetails(null);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setSuccessMessage('Media record deleted.');
    } catch (err) {
      setErrorMessage(formatApiErrorMessage(err, 'Failed to delete media job.'));
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const isSessionCompleted = selectedSession?.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Media Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Process previously captured classroom group photos or pre-recorded lecture videos through the AI biometric engine.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('attendance')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition self-start sm:self-auto"
          >
            <span>View Attendance Sessions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* In-App Notifications Banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start justify-between gap-3 animate-in fade-in-50">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Error Processing Media</div>
              <div className="text-[11px] text-rose-700 mt-0.5">{errorMessage}</div>
            </div>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start justify-between gap-3 animate-in fade-in-50">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Success</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">{successMessage}</div>
            </div>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Target Session Selection & Biometrics Readiness Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Step 1: Select Attendance Session</span>
            </div>
            <p className="text-xs text-slate-500">
              Verified attendance records will be marked against the selected academic session.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {loadingSessions ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Loading sessions...</span>
              </div>
            ) : (
              <select
                value={selectedSessionId}
                onChange={(e) => {
                  setSelectedSessionId(e.target.value);
                  setErrorMessage(null);
                }}
                className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 shadow-xs"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject} · {s.class_name} ({s.scheduled_date}) — [{s.status}]
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Biometrics Readiness Info */}
        {sessionBiometrics && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Enrolled Students: <strong className="text-slate-900">{sessionBiometrics.total_enrolled_students}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>With Face Data: <strong className="text-emerald-900">{sessionBiometrics.students_with_face_data}</strong></span>
              </div>
              {sessionBiometrics.students_missing_face_data > 0 && (
                <div className="flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Missing Face Data: <strong className="text-amber-900">{sessionBiometrics.students_missing_face_data}</strong></span>
                </div>
              )}
            </div>

            {sessionBiometrics.warning_message && (
              <span className={`px-3 py-1 rounded-xl text-[11px] font-bold ${
                sessionBiometrics.can_process ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {sessionBiometrics.warning_message}
              </span>
            )}
          </div>
        )}

        {isSessionCompleted && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Historical Session Notice:</strong> This session is marked as <strong>COMPLETED</strong>. Processing media will append verified attendance records to this session.
            </span>
          </div>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button
          onClick={() => {
            setActiveTab('IMAGE');
            setErrorMessage(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'IMAGE'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Image Attendance</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('VIDEO');
            setErrorMessage(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'VIDEO'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Video Attendance</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: IMAGE ATTENDANCE */}
      {/* ========================================================================= */}
      {activeTab === 'IMAGE' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span>Upload Classroom Photo</span>
              </h2>
              <p className="text-xs text-slate-500">
                Upload a group classroom photo or portrait (JPEG, PNG, WEBP). Multiple students in a single frame are detected, aligned, quality-filtered, and evaluated independently.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200">
                <Upload className="w-4 h-4" />
                <span>Choose Image (JPG, PNG, WEBP)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} className="hidden" />
              </label>

              {imageFile && (
                <div className="text-xs font-mono text-slate-600 flex items-center gap-2">
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Selected: {imageFile.name}</span>
                  </span>
                  {imageMetadata && (
                    <span className="text-slate-400">
                      ({imageMetadata.dimensions} · {imageMetadata.size})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Image Preview & Bounding Box Overlay Canvas */}
            {imagePreviewUrl && (
              <div className="space-y-4 pt-2">
                <div className="relative max-h-[500px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
                  <img
                    ref={imagePreviewRef}
                    src={imagePreviewUrl}
                    alt="Classroom Preview"
                    onLoad={() => {
                      if (imagePreviewRef.current && imageResult?.faces) {
                        drawImageBoundingBoxes(imageResult.faces, imagePreviewRef.current);
                      }
                    }}
                    className="max-h-[500px] w-auto object-contain block select-none"
                  />
                  <canvas
                    ref={imageOverlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowOverlays(!showOverlays)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        showOverlays
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {showOverlays ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{showOverlays ? 'AI Overlays Visible' : 'AI Overlays Hidden'}</span>
                    </button>
                    <span className="text-xs text-slate-400 hidden sm:inline">
                      Click <strong>Analyze & Mark Attendance</strong> to process.
                    </span>
                  </div>

                  <button
                    onClick={handleAnalyzeImage}
                    disabled={analyzingImage || !selectedSessionId || (sessionBiometrics !== null && !sessionBiometrics.can_process)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                  >
                    {analyzingImage ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Photo & Marking Attendance...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Analyze & Mark Attendance</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Image Analysis Results */}
          {imageResult && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Image Attendance Results</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Session: <strong className="text-slate-800">{imageResult.session_subject}</strong> ({imageResult.session_class}) · Latency: {imageResult.processing_time_ms} ms
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Processing Done</span>
                </span>
              </div>

              {/* Stat Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Faces Detected</div>
                  <div className="text-xl font-black text-slate-900 mt-1">{imageResult.faces_detected || 0}</div>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Verified</div>
                  <div className="text-xl font-black text-emerald-700 mt-1">{imageResult.recognized_count || 0}</div>
                </div>
                <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-blue-600">Marked Present</div>
                  <div className="text-xl font-black text-blue-700 mt-1">{imageResult.attendance_marked_count || 0}</div>
                </div>
                <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-amber-600">Verifying</div>
                  <div className="text-xl font-black text-amber-700 mt-1">{imageResult.uncertain_count || 0}</div>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Unknown</div>
                  <div className="text-xl font-black text-slate-700 mt-1">{imageResult.unknown_count || 0}</div>
                </div>
                <div className="bg-rose-50/70 border border-rose-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-rose-600">Low Quality</div>
                  <div className="text-xl font-black text-rose-700 mt-1">{imageResult.low_quality_count || 0}</div>
                </div>
              </div>

              {/* Table of Recognized Students */}
              {Array.isArray(imageResult.recognized_students) && imageResult.recognized_students.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">Verified Students Marked Present</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Roll / Code</th>
                          <th className="p-3">Confidence</th>
                          <th className="p-3">Decision</th>
                          <th className="p-3">Attendance Status</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {imageResult.recognized_students.map((st, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition">
                            <td className="p-3 font-bold text-slate-900">{st.student_name}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">
                              {st.roll_number || st.student_code || '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-100">
                                {st.status || st.decision}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                {st.attendance_status}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] text-slate-400">{st.remarks || 'Media Image'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs border border-slate-200 rounded-2xl bg-slate-50">
                  No registered student identities matched above the verified threshold in this photo.
                </div>
              )}

              {/* Unresolved Faces Review Section */}
              {Array.isArray(imageResult.unresolved_faces) && imageResult.unresolved_faces.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Unresolved / Non-Enrolled Faces ({imageResult.unresolved_faces.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    These faces did not meet the verified cutoff or are not registered in the student gallery. No attendance was recorded.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {imageResult.unresolved_faces.map((unres, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>{unres.face_id}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              unres.status === 'LOW_QUALITY'
                                ? 'bg-rose-100 text-rose-800'
                                : unres.status === 'VERIFYING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {unres.status || unres.decision}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Sharpness: {unres.quality_score} · Conf: {unres.confidence_pct}%
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{unres.rejection_reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VIDEO ATTENDANCE */}
      {/* ========================================================================= */}
      {activeTab === 'VIDEO' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Film className="w-4 h-4 text-blue-600" />
                <span>Upload Recorded Classroom Video</span>
              </h2>
              <p className="text-xs text-slate-500">
                Upload a recorded lecture (MP4, AVI, MKV, WebM, MOV). Faces are tracked across frames with multi-frame verification, and exactly ONE attendance record is recorded per student.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200">
                  <Upload className="w-4 h-4" />
                  <span>Choose Video File</span>
                  <input type="file" accept="video/mp4,video/avi,video/quicktime,video/webm,video/x-matroska" onChange={handleVideoSelect} className="hidden" />
                </label>

                {videoFile && (
                  <div className="text-xs font-mono text-slate-600 space-y-0.5">
                    <div className="font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>{videoFile.name}</span>
                    </div>
                    {videoMetadata && (
                      <div className="text-slate-400">
                        {videoMetadata.resolution} · {videoMetadata.duration} · {videoMetadata.size}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Frame Sampling Rate</span>
                  <span className="font-mono text-blue-600 font-bold">{sampleFps} FPS</span>
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.5"
                  value={sampleFps}
                  onChange={(e) => setSampleFps(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <p className="text-[11px] text-slate-400">
                  Adaptive sampling balances processing speed and multi-frame tracking accuracy.
                </p>
              </div>
            </div>

            {/* Video Preview & Trigger */}
            {videoPreviewUrl && (
              <div className="space-y-4 pt-3 border-t border-slate-100">
                <div className="max-h-72 rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-slate-200">
                  <video src={videoPreviewUrl} controls className="max-h-72 w-full object-contain" />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleAnalyzeVideo}
                    disabled={uploadingVideo || !selectedSessionId || (activeVideoJob !== null && activeVideoJob.status === 'PROCESSING') || (sessionBiometrics !== null && !sessionBiometrics.can_process)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
                  >
                    {uploadingVideo ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Uploading Video...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Process Video Attendance</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Video Processing Job Progress Card */}
          {activeVideoJob && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Video Job Status</div>
                  <div className="text-base font-bold text-slate-900">{activeVideoJob.filename}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      activeVideoJob.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : activeVideoJob.status === 'PROCESSING' || activeVideoJob.status === 'QUEUED'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {(activeVideoJob.status === 'PROCESSING' || activeVideoJob.status === 'QUEUED') && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    )}
                    {activeVideoJob.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{activeVideoJob.status}</span>
                  </span>

                  {(activeVideoJob.status === 'PROCESSING' || activeVideoJob.status === 'QUEUED') && (
                    <button
                      onClick={() => handleCancelJob(activeVideoJob.id)}
                      className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold border border-rose-200 flex items-center gap-1 transition"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">Processing Progress</span>
                  <span className="text-blue-600 font-mono">{(activeVideoJob.progress_pct || 0).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, activeVideoJob.progress_pct || 0)}%` }}
                  />
                </div>
              </div>

              {/* Live Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-2">
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Frames Processed</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {activeVideoJob.frames_processed || 0} / {activeVideoJob.frames_total || 0}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Faces Tracked</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{activeVideoJob.faces_detected_total || 0}</div>
                </div>
                <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Students Verified</div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{activeVideoJob.recognized_count || 0}</div>
                </div>
                <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3">
                  <div className="text-[10px] uppercase font-bold text-blue-600">Attendance Marked</div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">{activeVideoJob.attendance_marked_count || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: MEDIA PROCESSING HISTORY TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Media Attendance Processing History</h3>
            <p className="text-xs text-slate-400">
              Audit log of all image and video attendance jobs executed on this system.
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 text-slate-400 hover:text-slate-600 transition rounded-lg hover:bg-slate-100"
            title="Refresh History"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Film className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">No media processing history yet</p>
            <p className="text-slate-400 max-w-sm mx-auto">
              Upload a classroom image or lecture video to begin attendance processing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Media</th>
                  <th className="p-3">Session</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Faces Detected</th>
                  <th className="p-3 text-right">Verified</th>
                  <th className="p-3 text-right">Unknown</th>
                  <th className="p-3 text-right">Marked</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {job.media_type === 'IMAGE' ? (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <Film className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        )}
                        <span className="truncate max-w-[140px]">{job.filename}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{job.resolution || '—'}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{job.session_subject || 'Session'}</div>
                      <div className="text-[10px] text-slate-400">{job.session_class || 'TE-B'}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : job.status === 'PROCESSING' || job.status === 'QUEUED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">{job.faces_detected_total || 0}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">{job.recognized_count || 0}</td>
                    <td className="p-3 text-right font-mono text-slate-500">{job.unknown_count || 0}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600">{job.attendance_marked_count || 0}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedJobDetails(job)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition border border-blue-200"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition"
                          title="Delete Job Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Job Results Modal */}
      {selectedJobDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>Processing Summary</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selectedJobDetails.media_type}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedJobDetails.filename}</p>
              </div>
              <button
                onClick={() => setSelectedJobDetails(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-400">Faces Detected</div>
                <div className="text-lg font-black text-slate-900 mt-0.5">{selectedJobDetails.faces_detected_total || 0}</div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="text-[10px] uppercase font-bold text-emerald-600">Verified Students</div>
                <div className="text-lg font-black text-emerald-700 mt-0.5">{selectedJobDetails.recognized_count || 0}</div>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100">
                <div className="text-[10px] uppercase font-bold text-blue-600">Attendance Marked</div>
                <div className="text-lg font-black text-blue-700 mt-0.5">{selectedJobDetails.attendance_marked_count || 0}</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500">Unknown Faces</div>
                <div className="text-lg font-black text-slate-700 mt-0.5">{selectedJobDetails.unknown_count || 0}</div>
              </div>
            </div>

            {/* Recognized Students Table in Modal */}
            {Array.isArray(selectedJobDetails.summary_json?.recognized) && selectedJobDetails.summary_json.recognized.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800">Recognized Students</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Student Name</th>
                        <th className="p-2.5">Roll / Code</th>
                        <th className="p-2.5">Confidence</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {selectedJobDetails.summary_json.recognized.map((st: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-slate-900">{st.student_name}</td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">{st.roll_number || st.student_code || '—'}</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-100">
                              {st.status || 'VERIFIED'}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                              MARKED PRESENT
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedJobDetails.error_message && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Error Details:</div>
                  <div className="font-mono text-[11px] text-rose-700 mt-0.5">{selectedJobDetails.error_message}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
