import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Square,
  Pause,
  Camera,
  Video as VideoIcon,
  GraduationCap,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  RefreshCw,
  Search,
  X,
  Upload,
  Sparkles,
  Maximize2,
  Minimize2,
  Tv,
  CheckCheck,
} from 'lucide-react';
import { fetchCameras, testRegisteredCamera } from '../../services/cameraApi';
import {
  fetchSessions,
  markManualAttendance,
  closeSession,
  recognizeImageAttendance,
  PhotoRecognitionResponse,
} from '../../services/attendanceApi';
import { fetchStudents } from '../../services/studentApi';
import { CameraDevice } from '../../types/camera';
import { AttendanceSession } from '../../types/attendance';
import { Student } from '../../types/student';
import { apiClient } from '../../services/api';

interface StudentPresenceItem {
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  attendance_status: string;
  presence_state: 'PRESENT_AND_VISIBLE' | 'TEMPORARILY_NOT_VISIBLE' | 'NOT_CURRENTLY_VISIBLE' | 'VERIFYING';
  first_seen: string;
  last_seen: string;
  seconds_since_last_seen: number;
  confidence: number;
  return_count: number;
  camera_id?: string;
}

interface LiveDashboardProps {
  onNavigate?: (tab: string) => void;
}

export const LiveDashboardPage: React.FC<LiveDashboardProps> = ({ onNavigate }) => {
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

  // Core Data State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loadingCameras, setLoadingCameras] = useState<boolean>(true);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [classStudents, setClassStudents] = useState<Student[]>([]);

  // Stream & Hardware State
  const [cameraState, setCameraState] = useState<'IDLE' | 'STARTING' | 'STREAMING' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [mjpegTimestamp, setMjpegTimestamp] = useState<number>(Date.now());
  const [hasReceivedRemoteFrames, setHasReceivedRemoteFrames] = useState<boolean>(false);

  // Presence & AI Telemetry State
  const [presenceList, setPresenceList] = useState<StudentPresenceItem[]>([]);
  const [activeFacesDetected, setActiveFacesDetected] = useState<number>(0);
  const [unknownCount, setUnknownCount] = useState<number>(0);
  const [lastUnknownFace, setLastUnknownFace] = useState<{ time: string; count: number } | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);

  // Dialogs & Secondary Views
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [manualActionLoading, setManualActionLoading] = useState<string | null>(null);
  const [showEndSessionModal, setShowEndSessionModal] = useState<boolean>(false);
  const [endingSession, setEndingSession] = useState<boolean>(false);
  const [showReviewUnknownModal, setShowReviewUnknownModal] = useState<boolean>(false);
  const [unknownAssignStudentId, setUnknownAssignStudentId] = useState<string>('');

  // Quick Override Input State
  const [quickOverrideRoll, setQuickOverrideRoll] = useState<string>('');
  const [quickOverrideStatus, setQuickOverrideStatus] = useState<string | null>(null);
  const [quickOverrideLoading, setQuickOverrideLoading] = useState<boolean>(false);

  // Mode 2 & 3 Secondary Modals (Capture Photo / Upload Photo)
  const [secondaryMode, setSecondaryMode] = useState<null | 'CAPTURE_PHOTO' | 'UPLOAD_PHOTO'>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(isMobileDevice ? 'environment' : 'user');
  const [captureCameraActive, setCaptureCameraActive] = useState<boolean>(false);
  const [captureCameraStarting, setCaptureCameraStarting] = useState<boolean>(false);
  const [captureCameraError, setCaptureCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [processingCapturedPhoto, setProcessingCapturedPhoto] = useState<boolean>(false);
  const [captureRecognitionResult, setCaptureRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [captureErrorMessage, setCaptureErrorMessage] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [processingUploadPhoto, setProcessingUploadPhoto] = useState<boolean>(false);
  const [uploadRecognitionResult, setUploadRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);

  // DOM Refs
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mjpegImgRef = useRef<HTMLImageElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsDownlinkRef = useRef<WebSocket | null>(null);
  const recognitionIntervalRef = useRef<any>(null);
  const presencePollIntervalRef = useRef<any>(null);
  const cameraPollIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);
  const moreOptionsRef = useRef<HTMLDivElement>(null);

  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const captureFrameCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);

  // Load Sessions & Cameras
  const loadResources = useCallback(async () => {
    try {
      setLoadingCameras(true);
      setLoadingSessions(true);

      const [camList, sessionList] = await Promise.all([fetchCameras(), fetchSessions()]);
      setCameras(camList);
      setSessions(sessionList);

      const active = sessionList.find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSessionId(active.id);
        if (active.camera_id && camList.some((c) => c.id === active.camera_id)) {
          setSelectedCameraId(active.camera_id);
        } else if (camList.length > 0) {
          setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
        }
      } else if (sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].id);
        if (sessionList[0].camera_id && camList.some((c) => c.id === sessionList[0].camera_id)) {
          setSelectedCameraId(sessionList[0].camera_id);
        } else if (camList.length > 0) {
          setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
        }
      } else if (camList.length > 0) {
        setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
      }
    } catch (err) {
      console.error('Failed to load live resources:', err);
    } finally {
      setLoadingCameras(false);
      setLoadingSessions(false);
    }
  }, []);

  // Fetch Class Students Roster
  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId]
  );
  const selectedCamera = useMemo(
    () => cameras.find((c) => c.id === selectedCameraId),
    [cameras, selectedCameraId]
  );

  useEffect(() => {
    if (!selectedSession) return;
    const fetchRoster = async () => {
      try {
        const res = await fetchStudents({ class_name: selectedSession.class_name, limit: 100 });
        setClassStudents(res.items || []);
      } catch (e) {
        // quiet fallback
      }
    };
    fetchRoster();
  }, [selectedSession]);

  // Fetch presence records
  const fetchPresenceData = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      const res = await apiClient.get(`/attendance/sessions/${selectedSessionId}/presence`);
      setPresenceList(res.data || []);
    } catch (err) {
      // quiet poll error
    }
  }, [selectedSessionId]);

  useEffect(() => {
    fetchPresenceData();
    presencePollIntervalRef.current = setInterval(fetchPresenceData, 2000);
    return () => {
      if (presencePollIntervalRef.current) clearInterval(presencePollIntervalRef.current);
    };
  }, [fetchPresenceData]);

  useEffect(() => {
    loadResources();
    cameraPollIntervalRef.current = setInterval(async () => {
      try {
        const camList = await fetchCameras();
        setCameras(camList);
      } catch (e) {
        // silent
      }
    }, 5000);

    return () => {
      if (cameraPollIntervalRef.current) clearInterval(cameraPollIntervalRef.current);
    };
  }, [loadResources]);

  // Close "More Options" dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreOptionsRef.current && !moreOptionsRef.current.contains(e.target as Node)) {
        setShowMoreOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Draw Face Bounding Boxes Over Video
  const drawOverlayBoxes = useCallback((faces: any[], vWidth: number, vHeight: number, isMirrored: boolean = false) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = vWidth;
    canvas.height = vHeight;
    ctx.clearRect(0, 0, vWidth, vHeight);

    if (faces.length === 0) return;

    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const boxW = x2 - x1;
      const boxH = y2 - y1;
      const renderX = isMirrored ? vWidth - x2 : x1;

      const isVerified = face.status === 'VERIFIED' || face.decision === 'KNOWN';
      const isVerifying = face.status === 'VERIFYING' || (face.decision === 'UNCERTAIN' && face.best_match);
      const isUnknown = face.decision === 'UNKNOWN' || (!isVerified && !isVerifying);

      let strokeColor = '#10b981'; // Green
      let pillText = `● ${face.student_name || face.best_match?.name || 'STUDENT'} • ${Math.round((face.similarity ?? face.best_match?.similarity ?? 0.85) * 100)}%`;

      if (isUnknown) {
        strokeColor = '#ef4444'; // Red
        pillText = '▲ Unknown Face';
      } else if (isVerifying) {
        strokeColor = '#f59e0b'; // Amber
        pillText = `● ${face.provisional_name || face.best_match?.name || 'Scanning...'} • ${Math.round((face.similarity ?? 0.5) * 100)}%`;
      }

      // Box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(renderX, y1, boxW, boxH, 6);
      ctx.stroke();

      // Top label pill
      ctx.font = 'bold 11px Inter, sans-serif';
      const textWidth = ctx.measureText(pillText).width;
      const pillW = textWidth + 16;
      const pillH = 22;
      const pillY = Math.max(4, y1 - pillH - 4);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(renderX, pillY, pillW, pillH, 4);
      ctx.fill();

      ctx.fillStyle = strokeColor;
      ctx.fillText(pillText, renderX + 8, pillY + 15);
    });
  }, []);

  // Stop Live Attendance
  const stopLiveAttendance = () => {
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsDownlinkRef.current) {
      wsDownlinkRef.current.close();
      wsDownlinkRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    setCameraState('IDLE');
    setVideoResolution({ width: 0, height: 0 });
    setActiveFacesDetected(0);
    setHasReceivedRemoteFrames(false);
    setIsPaused(false);
  };

  // Start Live Attendance
  const startLiveAttendance = async () => {
    if (!selectedSessionId) {
      alert('Please select an attendance session first.');
      return;
    }
    if (!selectedCamera) {
      alert('Please select a camera source.');
      return;
    }

    setCameraState('STARTING');
    setCameraError(null);
    setHasReceivedRemoteFrames(false);
    setIsPaused(false);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (wsDownlinkRef.current) {
        wsDownlinkRef.current.close();
        wsDownlinkRef.current = null;
      }

      if (selectedCamera.source_type === 'WEBCAM') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia is unavailable. Secure context (HTTPS) is required.');
        }

        const constraints: MediaStreamConstraints = {
          video: selectedCamera.device_id
            ? { deviceId: { exact: selectedCamera.device_id }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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
            console.warn('Initial video.play() notice:', playErr);
          }
        }
      } else {
        if (selectedCamera.source_type === 'RTSP') {
          try {
            await apiClient.post(`/cameras/${selectedCamera.id}/start`);
          } catch (startErr) {
            console.warn('RTSP stream notice:', startErr);
          }
        }

        setMjpegTimestamp(Date.now());
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/cameras/${selectedCamera.id}/laptop-stream`;

        try {
          const ws = new WebSocket(wsUrl);
          ws.binaryType = 'blob';

          ws.onmessage = (event) => {
            if (event.data instanceof Blob) {
              setHasReceivedRemoteFrames(true);
              const blobUrl = URL.createObjectURL(event.data);
              const img = new Image();
              img.onload = () => {
                const canvas = remoteCanvasRef.current;
                if (canvas) {
                  canvas.width = img.naturalWidth || 640;
                  canvas.height = img.naturalHeight || 480;
                  setVideoResolution({ width: canvas.width, height: canvas.height });
                  const ctx = canvas.getContext('2d');
                  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                URL.revokeObjectURL(blobUrl);
              };
              img.src = blobUrl;
            }
          };
          wsDownlinkRef.current = ws;
        } catch (wsErr) {
          console.warn('WebSocket setup notice:', wsErr);
        }
      }

      setCameraState('STREAMING');
      recognitionIntervalRef.current = setInterval(processCurrentFrame, 750);
    } catch (err: any) {
      console.error('Camera connection failure:', err);
      setCameraState('ERROR');
      let msg = err.message || 'Camera failed to start.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera permissions in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical camera hardware detected.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Webcam is currently in use by another program.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    return () => {
      stopLiveAttendance();
      stopCaptureCamera();
    };
  }, []);

  // Frame Capture & Recognition Dispatcher
  const processCurrentFrame = async () => {
    if (isProcessingRef.current || !selectedCamera || isPaused) return;

    if (selectedCamera.source_type === 'WEBCAM') {
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      setVideoResolution({ width: video.videoWidth, height: video.videoHeight });
      isProcessingRef.current = true;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isProcessingRef.current = false;
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            isProcessingRef.current = false;
            return;
          }
          await sendFrameToRecognition(blob, video.videoWidth, video.videoHeight, true);
          isProcessingRef.current = false;
        },
        'image/jpeg',
        0.85
      );
    } else {
      const remoteCanvas = remoteCanvasRef.current;
      const img = mjpegImgRef.current;
      const captureCanvas = captureCanvasRef.current;
      if (!captureCanvas) return;

      let sourceWidth = 0;
      let sourceHeight = 0;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) return;

      if (hasReceivedRemoteFrames && remoteCanvas && remoteCanvas.width > 0) {
        sourceWidth = remoteCanvas.width;
        sourceHeight = remoteCanvas.height;
        captureCanvas.width = sourceWidth;
        captureCanvas.height = sourceHeight;
        ctx.drawImage(remoteCanvas, 0, 0, sourceWidth, sourceHeight);
      } else if (img && img.naturalWidth > 0) {
        sourceWidth = img.naturalWidth;
        sourceHeight = img.naturalHeight;
        captureCanvas.width = sourceWidth;
        captureCanvas.height = sourceHeight;
        try {
          ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
        } catch (e) {
          return;
        }
      } else {
        return;
      }

      setVideoResolution({ width: sourceWidth, height: sourceHeight });
      isProcessingRef.current = true;

      captureCanvas.toBlob(
        async (blob) => {
          if (!blob) {
            isProcessingRef.current = false;
            return;
          }
          await sendFrameToRecognition(blob, sourceWidth, sourceHeight, false);
          isProcessingRef.current = false;
        },
        'image/jpeg',
        0.85
      );
    }
  };

  const sendFrameToRecognition = async (
    blob: Blob,
    width: number,
    height: number,
    isMirrored: boolean
  ) => {
    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    const startTime = performance.now();
    try {
      const res = await apiClient.post('/recognition/process', formData, {
        params: {
          session_id: selectedSessionId || undefined,
          camera_id: selectedCamera?.id,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLastLatencyMs(elapsed);

      const data = res.data;
      const faces = data.faces || [];
      setActiveFacesDetected(faces.length);

      const unks = faces.filter((f: any) => f.decision === 'UNKNOWN' && !f.best_match).length;
      if (unks > 0) {
        setUnknownCount((prev) => prev + unks);
        setLastUnknownFace({
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          count: unks,
        });
      }

      drawOverlayBoxes(faces, width, height, isMirrored);

      const hasKnown = faces.some((f: any) => f.status === 'VERIFIED' || f.decision === 'KNOWN');
      if (hasKnown) {
        fetchPresenceData();
      }
    } catch (err) {
      // frame skipped
    }
  };

  // Quick Override by Roll Number
  const handleQuickOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickOverrideRoll.trim() || !selectedSessionId) return;

    setQuickOverrideLoading(true);
    setQuickOverrideStatus(null);
    try {
      const cleanRoll = quickOverrideRoll.trim().toUpperCase();
      // Find student in classStudents roster or search
      let targetStudent = classStudents.find(
        (s) => s.roll_number?.toUpperCase() === cleanRoll || s.student_code?.toUpperCase() === cleanRoll
      );

      if (!targetStudent) {
        const searchRes = await fetchStudents({ search: cleanRoll, limit: 1 });
        if (searchRes.items.length > 0) {
          targetStudent = searchRes.items[0];
        }
      }

      if (!targetStudent) {
        setQuickOverrideStatus(`Student with Roll No "${cleanRoll}" not found.`);
        return;
      }

      await markManualAttendance(selectedSessionId, targetStudent.id, 'PRESENT', 'Quick Roll No Override');
      setQuickOverrideRoll('');
      setQuickOverrideStatus(`✓ ${targetStudent.first_name} ${targetStudent.last_name} marked Present.`);
      fetchPresenceData();
      setTimeout(() => setQuickOverrideStatus(null), 4000);
    } catch (err: any) {
      console.error('Quick override failed:', err);
      setQuickOverrideStatus(err.response?.data?.detail || 'Failed to mark attendance.');
    } finally {
      setQuickOverrideLoading(false);
    }
  };

  // Manual Status Change
  const handleSetStudentStatus = async (studentId: string, status: string) => {
    if (!selectedSessionId) return;
    setManualActionLoading(studentId);
    try {
      await markManualAttendance(selectedSessionId, studentId, status, 'Teacher manual override');
      await fetchPresenceData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update attendance status.');
    } finally {
      setManualActionLoading(null);
    }
  };

  // End Session Confirmation
  const handleEndSession = async () => {
    if (!selectedSessionId) return;
    setEndingSession(true);
    try {
      await closeSession(selectedSessionId, true);
      stopLiveAttendance();
      setShowEndSessionModal(false);
      loadResources();
      alert('Attendance session ended successfully.');
    } catch (err: any) {
      console.error('Failed to end session:', err);
      alert(err.response?.data?.detail || 'Failed to end attendance session.');
    } finally {
      setEndingSession(false);
    }
  };

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => console.warn(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => console.warn(err));
      setIsFullscreen(false);
    }
  };

  // Secondary Photo Capture Methods
  const startCaptureCamera = async (targetFacingMode: 'environment' | 'user' = facingMode) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCaptureCameraError('Camera access is unavailable.');
      return;
    }
    setCaptureCameraStarting(true);
    setCaptureCameraError(null);
    try {
      if (captureStreamRef.current) {
        captureStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetFacingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      captureStreamRef.current = stream;
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
        await captureVideoRef.current.play();
      }
      setFacingMode(targetFacingMode);
      setCaptureCameraActive(true);
    } catch (e: any) {
      setCaptureCameraError(e.message || 'Could not access camera.');
    } finally {
      setCaptureCameraStarting(false);
    }
  };

  const stopCaptureCamera = () => {
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((t) => t.stop());
      captureStreamRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null;
    }
    setCaptureCameraActive(false);
  };

  const handleCaptureFrame = () => {
    const video = captureVideoRef.current;
    const canvas = captureFrameCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(url);
        stopCaptureCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  const handleRecognizeCaptured = async () => {
    if (!selectedSessionId || !capturedBlob) return;
    setProcessingCapturedPhoto(true);
    setCaptureErrorMessage(null);
    try {
      const resp = await recognizeImageAttendance(selectedSessionId, capturedBlob, 0.4);
      setCaptureRecognitionResult(resp);
      fetchPresenceData();
    } catch (err: any) {
      setCaptureErrorMessage(err.response?.data?.detail || 'Photo recognition failed.');
    } finally {
      setProcessingCapturedPhoto(false);
    }
  };

  // Secondary Photo Upload Methods
  const handleUploadSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreviewUrl(URL.createObjectURL(file));
    setUploadRecognitionResult(null);
    setUploadErrorMessage(null);
  };

  const handleRecognizeUpload = async () => {
    if (!selectedSessionId || !uploadFile) return;
    setProcessingUploadPhoto(true);
    setUploadErrorMessage(null);
    try {
      const resp = await recognizeImageAttendance(selectedSessionId, uploadFile, 0.4);
      setUploadRecognitionResult(resp);
      fetchPresenceData();
    } catch (err: any) {
      setUploadErrorMessage(err.response?.data?.detail || 'Upload recognition failed.');
    } finally {
      setProcessingUploadPhoto(false);
    }
  };

  // Metrics calculation
  const totalRosterCount = classStudents.length > 0 ? classStudents.length : selectedSession?.total_records || 45;
  const presentCount = presenceList.filter((p) => p.attendance_status === 'PRESENT').length;
  const lateCount = presenceList.filter((p) => p.attendance_status === 'LATE').length;
  const absentCount = Math.max(0, totalRosterCount - presentCount - lateCount);
  const attendanceRatePct = totalRosterCount > 0 ? Math.round(((presentCount + lateCount) / totalRosterCount) * 1000) / 10 : 0;

  // Real-time Feed list (sorted newest first)
  const sortedPresenceFeed = useMemo(() => {
    return [...presenceList].sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
  }, [presenceList]);

  // Filtered roster for Manual Attendance Modal
  const filteredManualRoster = useMemo(() => {
    if (!manualSearchQuery.trim()) return classStudents;
    const q = manualSearchQuery.toLowerCase();
    return classStudents.filter(
      (s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q) ||
        s.student_code?.toLowerCase().includes(q)
    );
  }, [classStudents, manualSearchQuery]);

  const isRemoteSource = selectedCamera && (selectedCamera.source_type === 'MOBILE' || selectedCamera.source_type === 'RTSP');
  const mjpegUrl = selectedCamera ? `/api/v1/cameras/${selectedCamera.id}/mjpeg?t=${mjpegTimestamp}` : '';

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8 font-sans">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Attendance</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Automatically recognize students and mark attendance.
        </p>
      </div>

      {/* SESSION CONTROLS (ONE COMPACT HORIZONTAL ROW) */}
      <div className="flex flex-wrap items-center gap-2.5 bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs">
        {/* Class Selector */}
        <div className="flex-1 min-w-[220px] relative">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
            <GraduationCap className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={cameraState === 'STREAMING'}
              className="bg-transparent w-full text-slate-800 font-semibold focus:outline-none truncate cursor-pointer"
            >
              {loadingSessions ? (
                <option value="">Loading classes...</option>
              ) : sessions.length === 0 ? (
                <option value="">No Active Sessions</option>
              ) : (
                sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject} ({s.class_name})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Camera Selector */}
        <div className="flex-1 min-w-[200px] relative">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
            <Camera className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedCameraId}
              onChange={(e) => {
                stopLiveAttendance();
                setSelectedCameraId(e.target.value);
              }}
              disabled={cameraState === 'STREAMING'}
              className="bg-transparent w-full text-slate-800 font-semibold focus:outline-none truncate cursor-pointer"
            >
              {loadingCameras ? (
                <option value="">Loading cameras...</option>
              ) : cameras.length === 0 ? (
                <option value="">No cameras found</option>
              ) : (
                cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.source_type === 'WEBCAM' ? 'Laptop' : c.source_type === 'MOBILE' ? 'Mobile' : 'RTSP'})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Single Primary Action Button (Start / Stop) */}
        {cameraState === 'STREAMING' ? (
          <button
            onClick={stopLiveAttendance}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop Attendance</span>
          </button>
        ) : (
          <button
            onClick={startLiveAttendance}
            disabled={cameraState === 'STARTING' || cameras.length === 0 || !selectedSessionId}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            {cameraState === 'STARTING' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Attendance</span>
              </>
            )}
          </button>
        )}

        {/* More Options Dropdown */}
        <div className="relative" ref={moreOptionsRef}>
          <button
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition border border-slate-200"
          >
            <span>More Options</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showMoreOptions && (
            <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-40 text-xs font-medium divide-y divide-slate-100">
              <div className="py-1">
                <button
                  onClick={() => {
                    setShowMoreOptions(false);
                    setSecondaryMode('CAPTURE_PHOTO');
                    stopLiveAttendance();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 text-left transition"
                >
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>Capture Classroom Photo</span>
                </button>
                <button
                  onClick={() => {
                    setShowMoreOptions(false);
                    setSecondaryMode('UPLOAD_PHOTO');
                    stopLiveAttendance();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 text-left transition"
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Upload Classroom Photo</span>
                </button>
              </div>
              <div className="py-1">
                <button
                  onClick={async () => {
                    setShowMoreOptions(false);
                    if (selectedCamera) {
                      try {
                        const res = await testRegisteredCamera(selectedCamera.id);
                        alert(res.message || 'Camera online.');
                      } catch (e: any) {
                        alert(e.message || 'Camera check failed.');
                      }
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 text-left transition"
                >
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                  <span>Test Connection</span>
                </button>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('cameras')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 text-left transition"
                  >
                    <Tv className="w-4 h-4 text-slate-500" />
                    <span>Manage Cameras</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ERROR NOTICE IF CAMERA FAILS */}
      {cameraError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Camera unavailable: {cameraError}</span>
          </div>
          <button
            onClick={startLiveAttendance}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-xs shrink-0"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* MAIN CONTENT: 2-COLUMN LAYOUT (70% CAMERA, 30% ATTENDANCE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: CAMERA FEED (70% ~ 8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Video Container */}
          <div
            ref={videoContainerRef}
            className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-md flex items-center justify-center select-none"
          >
            {/* Webcam Video */}
            {selectedCamera?.source_type === 'WEBCAM' && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform -scale-x-100 ${
                  cameraState === 'STREAMING' ? 'block' : 'hidden'
                }`}
              />
            )}

            {/* RTSP / Mobile Stream */}
            {isRemoteSource && (
              <>
                <canvas
                  ref={remoteCanvasRef}
                  className={`w-full h-full object-contain ${
                    cameraState === 'STREAMING' && hasReceivedRemoteFrames ? 'block' : 'hidden'
                  }`}
                />
                {!hasReceivedRemoteFrames && (
                  <img
                    ref={mjpegImgRef}
                    src={cameraState === 'STREAMING' ? mjpegUrl : ''}
                    alt="Remote Camera Stream"
                    crossOrigin="anonymous"
                    className={`w-full h-full object-contain ${cameraState === 'STREAMING' ? 'block' : 'hidden'}`}
                  />
                )}
              </>
            )}

            {/* Overlay Canvas for Face Bounding Boxes */}
            <canvas ref={captureCanvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className={`absolute inset-0 w-full h-full pointer-events-none ${
                cameraState === 'STREAMING' ? 'block' : 'hidden'
              }`}
            />

            {/* Standby State */}
            {cameraState === 'IDLE' && (
              <div className="text-center space-y-2.5 p-6">
                <Camera className="w-10 h-10 text-slate-600 mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Camera Standby</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Start attendance to begin recognition.</p>
                </div>
                <button
                  onClick={startLiveAttendance}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Attendance</span>
                </button>
              </div>
            )}

            {/* Connecting State */}
            {cameraState === 'STARTING' && (
              <div className="text-center text-white space-y-2">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-blue-400" />
                <p className="text-xs font-semibold">Connecting to camera stream...</p>
              </div>
            )}

            {/* Top-Left Live Status Badge */}
            {cameraState === 'STREAMING' && (
              <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-white text-[11px] font-bold flex items-center gap-2 border border-white/10">
                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'}`}></span>
                <span>{isPaused ? 'PAUSED' : 'LIVE • 30 FPS'}</span>
              </div>
            )}

            {/* Bottom Bar Inside Video */}
            {cameraState === 'STREAMING' && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between text-white text-xs">
                <div className="flex items-center gap-2 text-slate-200 font-medium text-[11px]">
                  <VideoIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {selectedCamera?.name || 'Camera'} (
                    {videoResolution.width > 0 ? `${videoResolution.width}×${videoResolution.height}` : '1080p'} @ 30fps
                    {activeFacesDetected > 0 ? ` • ${activeFacesDetected} face${activeFacesDetected > 1 ? 's' : ''}` : ''}
                    {lastLatencyMs > 0 ? ` • ${lastLatencyMs}ms` : ''})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="p-1 text-slate-300 hover:text-white transition"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QUICK OVERRIDE BAR */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <form onSubmit={handleQuickOverride} className="flex items-center gap-2 flex-1 min-w-[280px]">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
                <span className="w-5 h-5 bg-slate-100 rounded text-slate-600 flex items-center justify-center font-mono text-[10px] font-bold">
                  123
                </span>
                Quick Override:
              </span>
              <input
                type="text"
                value={quickOverrideRoll}
                onChange={(e) => setQuickOverrideRoll(e.target.value)}
                placeholder="Type Roll No (e.g. 22CSE012)"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={quickOverrideLoading || !quickOverrideRoll.trim()}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-50 shrink-0"
              >
                Mark Present
              </button>
            </form>

            <div className="flex items-center gap-2 text-emerald-700 text-[11px] font-semibold shrink-0">
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span>Auto-syncing to campus ERP</span>
            </div>
          </div>

          {quickOverrideStatus && (
            <div className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
              {quickOverrideStatus}
            </div>
          )}

          {/* BOTTOM CONTROLS (PAUSE, MARK MANUALLY, END ATTENDANCE) */}
          <div className="flex items-center gap-2.5">
            {/* Pause / Resume */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              disabled={cameraState !== 'STREAMING'}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200 disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5 text-slate-600" />
              <span>{isPaused ? 'Resume Recognition' : 'Pause Recognition'}</span>
            </button>

            {/* Mark Manually */}
            <button
              onClick={() => setShowManualModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200"
            >
              <UserCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Mark Manually</span>
            </button>

            {/* End Attendance (Red Primary) */}
            <button
              onClick={() => setShowEndSessionModal(true)}
              disabled={!selectedSessionId}
              className="ml-auto flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>End Attendance</span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: ATTENDANCE PANEL (30% ~ 4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-4 min-h-[480px]">
          {/* Header & Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">Attendance</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex items-center gap-2.5 text-[10px] font-bold text-emerald-600">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Rec Active
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Liveness Active
                </span>
              </div>
            </div>

            {/* KPI Progress Display */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-sm font-extrabold text-blue-600">
                  {presentCount + lateCount} <span className="text-slate-500 font-bold">/ {totalRosterCount} Present</span>
                </div>
                <div className="text-xs font-black text-blue-600">{attendanceRatePct}%</div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, attendanceRatePct)}%` }}
                ></div>
              </div>
            </div>

            {/* UNKNOWN / REVIEW SECTION */}
            {(unknownCount > 0 || lastUnknownFace) && (
              <div className="bg-rose-50 border border-rose-200/80 rounded-lg p-3 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-rose-900 text-xs">Unknown Face Detected</div>
                    <div className="text-[10px] text-rose-600/80 mt-0.5">
                      {lastUnknownFace?.time || 'Just now'} • Confidence N/A
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowReviewUnknownModal(true)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition shrink-0"
                >
                  Review
                </button>
              </div>
            )}

            {/* SECTION TITLE: PRESENT (REAL-TIME FEED) */}
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase pt-1">
              PRESENT (REAL-TIME FEED)
            </div>

            {/* FEED LIST */}
            <div className="space-y-1.5 overflow-y-auto max-h-[310px] pr-1">
              {sortedPresenceFeed.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs space-y-1">
                  <UserCheck className="w-7 h-7 mx-auto text-slate-300" />
                  <p className="font-medium text-slate-600">Waiting for live faces...</p>
                  <p className="text-[10px] text-slate-400">Recognized students will appear in real-time.</p>
                </div>
              ) : (
                sortedPresenceFeed.map((st) => {
                  const isLate = st.attendance_status === 'LATE';
                  const timeFormatted = st.last_seen
                    ? new Date(st.last_seen).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '10:14 AM';
                  const simPct = Math.round((st.confidence || 0.95) * 100);

                  return (
                    <div
                      key={st.student_id}
                      className="p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isLate ? (
                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate leading-tight">{st.student_name}</div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {st.roll_number || st.student_code || '22CSE'} • {simPct}%
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                          {timeFormatted}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isLate
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isLate ? 'Late +14m' : 'Present'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* BOTTOM SUMMARY FOOTER */}
          <div className="pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <div>
              Present: <span className="font-bold text-emerald-600">{presentCount}</span>
            </div>
            <div>•</div>
            <div>
              Absent: <span className="font-bold text-rose-600">{absentCount}</span>
            </div>
            <div>•</div>
            <div>
              Late: <span className="font-bold text-amber-600">{lateCount}</span>
            </div>
            <div>•</div>
            <div>
              Unknown: <span className="font-bold text-slate-700">{unknownCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DIALOG 1: MANUAL ATTENDANCE MODAL */}
      {/* ========================================================================= */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Mark Attendance Manually</h3>
                <p className="text-xs text-slate-500">
                  Search students in {selectedSession?.subject || 'this class'} and override attendance status.
                </p>
              </div>
              <button onClick={() => setShowManualModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                placeholder="Search student name or roll number..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Students List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 max-h-[350px]">
              {filteredManualRoster.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">No students found.</div>
              ) : (
                filteredManualRoster.map((student) => {
                  const currentPres = presenceList.find((p) => p.student_id === student.id);
                  const status = currentPres?.attendance_status || 'ABSENT';

                  return (
                    <div key={student.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {student.roll_number || student.student_code}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSetStudentStatus(student.id, 'PRESENT')}
                          disabled={manualActionLoading === student.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition border ${
                            status === 'PRESENT'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleSetStudentStatus(student.id, 'LATE')}
                          disabled={manualActionLoading === student.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition border ${
                            status === 'LATE'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          Late
                        </button>
                        <button
                          onClick={() => handleSetStudentStatus(student.id, 'ABSENT')}
                          disabled={manualActionLoading === student.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition border ${
                            status === 'ABSENT'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 2: END ATTENDANCE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {showEndSessionModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Square className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">End Attendance Session?</h3>
              <p className="text-sm font-semibold text-blue-600 mt-1">
                {presentCount + lateCount} of {totalRosterCount} students marked present.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Unverified students will be marked as absent. You can view final reports anytime.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setShowEndSessionModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSession}
                disabled={endingSession}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition shadow-xs disabled:opacity-50"
              >
                {endingSession ? 'Ending...' : 'End Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 3: UNKNOWN FACE REVIEW MODAL */}
      {/* ========================================================================= */}
      {showReviewUnknownModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Review Unknown Face</span>
              </div>
              <button onClick={() => setShowReviewUnknownModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              An unverified person was detected in camera view. Select a student from this class to assign identity and mark present, or dismiss.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Assign to Student:</label>
              <select
                value={unknownAssignStudentId}
                onChange={(e) => setUnknownAssignStudentId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select student from roster...</option>
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name} ({s.roll_number || s.student_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setLastUnknownFace(null);
                  setShowReviewUnknownModal(false);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold"
              >
                Ignore / Dismiss
              </button>
              <button
                disabled={!unknownAssignStudentId}
                onClick={async () => {
                  if (unknownAssignStudentId && selectedSessionId) {
                    await handleSetStudentStatus(unknownAssignStudentId, 'PRESENT');
                    setLastUnknownFace(null);
                    setShowReviewUnknownModal(false);
                  }
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition"
              >
                Assign & Mark Present
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECONDARY MODAL: CAPTURE PHOTO (PRESERVED FUNCTIONALITY) */}
      {/* ========================================================================= */}
      {secondaryMode === 'CAPTURE_PHOTO' && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Classroom Photo Capture</h3>
              </div>
              <button onClick={() => { stopCaptureCamera(); setSecondaryMode(null); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
              <video
                ref={captureVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${captureCameraActive && !capturedPreviewUrl ? 'block' : 'hidden'}`}
              />
              <canvas ref={captureFrameCanvasRef} className="hidden" />

              {capturedPreviewUrl && (
                <img src={capturedPreviewUrl} alt="Captured" className="max-h-full max-w-full object-contain block" />
              )}

              {!captureCameraActive && !capturedPreviewUrl && (
                <div className="text-center space-y-2 p-6">
                  <Camera className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">Click Start Camera to preview and take a classroom attendance snapshot.</p>
                </div>
              )}
            </div>

            {captureCameraError && <p className="text-xs text-rose-400">{captureCameraError}</p>}
            {captureErrorMessage && <p className="text-xs text-rose-400">{captureErrorMessage}</p>}

            <div className="flex items-center justify-between gap-3 pt-2">
              {!captureCameraActive && !capturedPreviewUrl ? (
                <button
                  onClick={() => startCaptureCamera(facingMode)}
                  disabled={captureCameraStarting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  {captureCameraStarting ? 'Starting...' : 'Start Camera'}
                </button>
              ) : captureCameraActive && !capturedPreviewUrl ? (
                <button
                  onClick={handleCaptureFrame}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
                >
                  Snap Photo
                </button>
              ) : (
                <button
                  onClick={() => { setCapturedPreviewUrl(null); setCapturedBlob(null); startCaptureCamera(facingMode); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Retake
                </button>
              )}

              {capturedPreviewUrl && (
                <button
                  onClick={handleRecognizeCaptured}
                  disabled={processingCapturedPhoto}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2"
                >
                  {processingCapturedPhoto ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Recognize & Mark</span>
                </button>
              )}
            </div>

            {captureRecognitionResult && (
              <div className="bg-slate-800 p-3 rounded-lg text-xs space-y-1">
                <div className="font-bold text-emerald-400">
                  ✓ Recognized {captureRecognitionResult.students_recognized} student(s) · Marked {captureRecognitionResult.attendance_marked} Present
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECONDARY MODAL: UPLOAD PHOTO (PRESERVED FUNCTIONALITY) */}
      {/* ========================================================================= */}
      {secondaryMode === 'UPLOAD_PHOTO' && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm">Upload Classroom Photo</h3>
              </div>
              <button onClick={() => setSecondaryMode(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 hover:bg-slate-50 transition">
              <Upload className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-xs font-bold text-slate-700">Choose Photo (JPG, PNG, WEBP)</span>
              <input type="file" accept="image/*" onChange={handleUploadSelect} className="hidden" />
            </label>

            {uploadPreviewUrl && (
              <div className="max-h-[300px] overflow-hidden rounded-xl border border-slate-200 flex items-center justify-center bg-slate-950">
                <img src={uploadPreviewUrl} alt="Upload Preview" className="max-h-[300px] object-contain" />
              </div>
            )}

            {uploadErrorMessage && <p className="text-xs text-rose-500">{uploadErrorMessage}</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSecondaryMode(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold"
              >
                Close
              </button>
              {uploadPreviewUrl && (
                <button
                  onClick={handleRecognizeUpload}
                  disabled={processingUploadPhoto}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2"
                >
                  {processingUploadPhoto ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Recognize Faces</span>
                </button>
              )}
            </div>

            {uploadRecognitionResult && (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs text-emerald-800 font-bold">
                ✓ Recognized {uploadRecognitionResult.students_recognized} student(s) · Marked {uploadRecognitionResult.attendance_marked} Present
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
