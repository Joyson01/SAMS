import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Square,
  Pause,
  Camera,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Users,
  CheckCircle2,
  X,
  Search,
  MoreVertical,
  Upload,
  Eye,
  SwitchCamera,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { fetchCameras, testRegisteredCamera } from '../../services/cameraApi';
import {
  fetchSessions,
  startSession,
  closeSession,
  markManualAttendance,
  recognizeImageAttendance,
  PhotoRecognitionResponse,
  fetchSessionRoster,
  SessionRosterResponse,
  ClassRosterStudentItem,
} from '../../services/attendanceApi';
import { fetchStudents } from '../../services/studentApi';
import { CameraDevice } from '../../types/camera';
import { AttendanceSession } from '../../types/attendance';
import { Student } from '../../types/student';
import { apiClient } from '../../services/api';
import { StatusBadge } from '../../components/ui';

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

interface UnknownFaceEvent {
  id: string;
  timestamp: string;
  timeStr: string;
  cameraName?: string;
  confidence?: number;
}

interface LiveDashboardProps {
  onNavigate?: (tab: string) => void;
}

export const LiveDashboardPage: React.FC<LiveDashboardProps> = ({ onNavigate }) => {
  // Mode Selector: LIVE_CAMERA | CAPTURE_PHOTO | UPLOAD_PHOTO
  const [attendanceMode, setAttendanceMode] = useState<'LIVE_CAMERA' | 'CAPTURE_PHOTO' | 'UPLOAD_PHOTO'>('LIVE_CAMERA');

  // Resource Data State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loadingCameras, setLoadingCameras] = useState<boolean>(true);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);

  // Camera Diagnostic Test State
  const [testingCamera, setTestingCamera] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Live Stream State
  const [cameraState, setCameraState] = useState<'IDLE' | 'STARTING' | 'STREAMING' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [mjpegTimestamp, setMjpegTimestamp] = useState<number>(Date.now());
  const [hasReceivedRemoteFrames, setHasReceivedRemoteFrames] = useState<boolean>(false);

  // Presence & Recognition State
  const [presenceList, setPresenceList] = useState<StudentPresenceItem[]>([]);
  const [sessionRoster, setSessionRoster] = useState<SessionRosterResponse | null>(null);
  const [rosterTab, setRosterTab] = useState<'ALL' | 'IN_FRAME' | 'AWAY'>('ALL');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [activeFacesDetected, setActiveFacesDetected] = useState<number>(0);
  const [unknownEvents, setUnknownEvents] = useState<UnknownFaceEvent[]>([]);
  const lastUnknownLoggedAtRef = useRef<number>(0);

  // Dialog & Modal State
  const [showEndSessionModal, setShowEndSessionModal] = useState<boolean>(false);
  const [isEndingSession, setIsEndingSession] = useState<boolean>(false);
  const [sessionCompletedSummary, setSessionCompletedSummary] = useState<{
    present: number;
    absent: number;
    late: number;
    unknown: number;
  } | null>(null);

  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');
  const [markingStudentId, setMarkingStudentId] = useState<string | null>(null);

  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [selectedUnknownEvent, setSelectedUnknownEvent] = useState<UnknownFaceEvent | null>(null);
  const [reviewStudentId, setReviewStudentId] = useState<string>('');

  const [showRosterModal, setShowRosterModal] = useState<boolean>(false);
  const [rosterSearchQuery, setRosterSearchQuery] = useState<string>('');
  const [showMoreOptionsDropdown, setShowMoreOptionsDropdown] = useState<boolean>(false);

  // Debug & Diagnostic Overlay State
  const [showDebugDiagnostics, setShowDebugDiagnostics] = useState<boolean>(false);
  const [debugDiagnostics, setDebugDiagnostics] = useState<{
    raw_count: number;
    nms_count: number;
    tracks_count: number;
    recognized_count: number;
  } | null>(null);

  // Photo Modes State
  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(isMobileDevice ? 'environment' : 'user');
  const [captureCameraActive, setCaptureCameraActive] = useState<boolean>(false);
  const [captureCameraStarting, setCaptureCameraStarting] = useState<boolean>(false);
  const [captureCameraError, setCaptureCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [processingCapturedPhoto, setProcessingCapturedPhoto] = useState<boolean>(false);
  const [captureRecognitionResult, setCaptureRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [captureErrorMessage, setCaptureErrorMessage] = useState<string | null>(null);
  const [showCaptureOverlay, setShowCaptureOverlay] = useState<boolean>(true);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [processingUploadPhoto, setProcessingUploadPhoto] = useState<boolean>(false);
  const [uploadRecognitionResult, setUploadRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [showUploadOverlay, setShowUploadOverlay] = useState<boolean>(true);

  // DOM Refs - Live Camera
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
  const isPausedRef = useRef<boolean>(false);

  // DOM Refs - Capture Photo
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const captureFrameCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureImageRef = useRef<HTMLImageElement>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);

  // DOM Refs - Upload Photo
  const uploadImageRef = useRef<HTMLImageElement>(null);
  const uploadOverlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Keep isPausedRef in sync with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Load Sessions & Registered Cameras
  const loadResources = useCallback(async () => {
    try {
      setLoadingCameras(true);
      setLoadingSessions(true);

      const [camList, sessionList] = await Promise.all([
        fetchCameras(),
        fetchSessions(),
      ]);

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

  useEffect(() => {
    loadResources();
    cameraPollIntervalRef.current = setInterval(async () => {
      try {
        const camList = await fetchCameras();
        setCameras(camList);
      } catch (e) {
        // silent poll
      }
    }, 5000);

    return () => {
      if (cameraPollIntervalRef.current) clearInterval(cameraPollIntervalRef.current);
    };
  }, [loadResources]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedCamera = cameras.find((c) => c.id === selectedCameraId);

  // Auto-align camera if session has preferred room
  useEffect(() => {
    if (selectedSession && selectedSession.camera_id && cameras.some((c) => c.id === selectedSession.camera_id)) {
      setSelectedCameraId(selectedSession.camera_id);
    }
  }, [selectedSession, cameras]);

  // Load enrolled students for current session/class
  const loadEnrolledStudents = useCallback(async () => {
    if (!selectedSession) return;
    try {
      const res = await fetchStudents({
        class_name: selectedSession.class_name,
        limit: 100,
      });
      if (res && res.items) {
        setEnrolledStudents(res.items);
      }
    } catch (err) {
      console.warn('Could not fetch enrolled students for class:', err);
    }
  }, [selectedSession]);

  useEffect(() => {
    loadEnrolledStudents();
  }, [loadEnrolledStudents]);

  // Poll presence state from backend
  const isFetchingPresenceRef = useRef<boolean>(false);
  const fetchPresenceData = useCallback(async () => {
    if (!selectedSessionId || isFetchingPresenceRef.current) return;
    isFetchingPresenceRef.current = true;
    try {
      const res = await apiClient.get(`/attendance/sessions/${selectedSessionId}/presence`);
      setPresenceList(res.data || []);
    } catch (err) {
      // quiet poll
    } finally {
      isFetchingPresenceRef.current = false;
    }
  }, [selectedSessionId]);

  // Poll complete session roster from backend
  const isFetchingRosterRef = useRef<boolean>(false);
  const fetchRosterData = useCallback(async () => {
    if (!selectedSessionId || isFetchingRosterRef.current) return;
    isFetchingRosterRef.current = true;
    try {
      const data = await fetchSessionRoster(selectedSessionId);
      setSessionRoster(data);
    } catch (err) {
      // quiet poll
    } finally {
      isFetchingRosterRef.current = false;
    }
  }, [selectedSessionId]);

  useEffect(() => {
    fetchPresenceData();
    fetchRosterData();
    presencePollIntervalRef.current = setInterval(() => {
      fetchPresenceData();
      fetchRosterData();
    }, 2000);
    return () => {
      if (presencePollIntervalRef.current) clearInterval(presencePollIntervalRef.current);
    };
  }, [fetchPresenceData, fetchRosterData]);

  // Format Helper Functions
  const getInitials = (name: string) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Just now';
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return 'Just now';
    }
  };

  // Draw Subtle Face Bounding Boxes Over Video with Mathematical Aspect-Ratio & Mirroring Mapping
  const drawOverlayBoxes = useCallback((
    faces: any[],
    vWidth: number,
    vHeight: number,
    isMirrored: boolean = false,
    fitMode: 'cover' | 'contain' = 'cover'
  ) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas internal resolution to match container client display pixels (1-to-1 crisp mapping)
    const cWidth = canvas.clientWidth || vWidth;
    const cHeight = canvas.clientHeight || vHeight;
    if (canvas.width !== cWidth || canvas.height !== cHeight) {
      canvas.width = cWidth;
      canvas.height = cHeight;
    }
    ctx.clearRect(0, 0, cWidth, cHeight);

    if (faces.length === 0 || vWidth === 0 || vHeight === 0) return;

    const vAspect = vWidth / vHeight;
    const cAspect = cWidth / cHeight;

    let renderW = cWidth;
    let renderH = cHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (fitMode === 'cover') {
      if (vAspect > cAspect) {
        renderH = cHeight;
        renderW = cHeight * vAspect;
        offsetX = (cWidth - renderW) / 2.0;
        offsetY = 0.0;
      } else {
        renderW = cWidth;
        renderH = cWidth / vAspect;
        offsetX = 0.0;
        offsetY = (cHeight - renderH) / 2.0;
      }
    } else {
      // contain mode (letterboxed/pillarboxed)
      if (vAspect > cAspect) {
        renderW = cWidth;
        renderH = cWidth / vAspect;
        offsetX = 0.0;
        offsetY = (cHeight - renderH) / 2.0;
      } else {
        renderH = cHeight;
        renderW = cHeight * vAspect;
        offsetX = (cWidth - renderW) / 2.0;
        offsetY = 0.0;
      }
    }

    const scaleX = renderW / vWidth;
    const scaleY = renderH / vHeight;

    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const boxW = Math.max(4, (x2 - x1) * scaleX);
      const boxH = Math.max(4, (y2 - y1) * scaleY);
      const screenX = offsetX + x1 * scaleX;
      const screenY = offsetY + y1 * scaleY;

      // Handle horizontal mirroring when webcam is mirrored in CSS (transform -scale-x-100)
      const renderX = isMirrored ? cWidth - (screenX + boxW) : screenX;

      const status = face.status || (face.decision === 'KNOWN' ? 'VERIFIED' : face.decision === 'UNCERTAIN' ? 'VERIFYING' : 'UNKNOWN');
      const isVerified = status === 'VERIFIED';
      const isVerifying = status === 'VERIFYING';
      const isRejected = status === 'QUALITY_REJECTED' || face.is_quality_valid === false;

      let strokeColor = '#dc2626'; // Default Unknown (Red)
      let bgColor = 'rgba(220, 38, 38, 0.95)';
      let label = 'UNKNOWN FACE';
      const simVal = face.similarity !== undefined ? face.similarity : (face.best_match ? face.best_match.similarity : 0.40);

      if (isRejected) {
        strokeColor = '#f43f5e';
        bgColor = 'rgba(225, 29, 72, 0.95)';
        label = 'LOW QUALITY';
      } else if (isVerified) {
        strokeColor = '#16a34a'; // Green
        bgColor = 'rgba(22, 163, 74, 0.95)';
        const name = face.student_name || (face.best_match ? face.best_match.name : 'STUDENT');
        const conf = Math.round(simVal * 100);
        label = `${name.toUpperCase()} • ${conf}%`;
      } else if (isVerifying) {
        strokeColor = '#d97706'; // Amber
        bgColor = 'rgba(217, 119, 6, 0.95)';
        const name = face.provisional_name || face.student_name || (face.best_match ? face.best_match.name : 'SCANNING...');
        const conf = Math.round(simVal * 100);
        label = `${name.toUpperCase()} • ${conf}%`;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isVerified ? 2.5 : 2;
      ctx.beginPath();
      ctx.roundRect(renderX, screenY, boxW, boxH, 6);
      ctx.stroke();

      ctx.font = 'bold 10px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const pillW = textWidth + 14;
      const pillH = 20;
      const pillY = Math.max(2, screenY - pillH - 3);

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(renderX, pillY, pillW, pillH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, renderX + 7, pillY + 14);
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
    setDebugDiagnostics(null);
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
      // Mark session ACTIVE in backend if SCHEDULED
      if (selectedSession && selectedSession.status === 'SCHEDULED') {
        try {
          await startSession(selectedSession.id);
          const updatedSessions = await fetchSessions();
          setSessions(updatedSessions);
        } catch (e) {
          console.warn('Session start notification notice:', e);
        }
      }

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
          throw new Error('Webcam requires a secure context (HTTPS or localhost).');
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
            console.warn('Video initial play handled:', playErr);
          }
        }
      } else {
        if (selectedCamera.source_type === 'RTSP') {
          try {
            await apiClient.post(`/cameras/${selectedCamera.id}/start`);
          } catch (startErr) {
            console.warn('RTSP worker start notice:', startErr);
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
          console.warn('WebSocket downlink notice:', wsErr);
        }
      }

      setCameraState('STREAMING');
      recognitionIntervalRef.current = setInterval(processCurrentFrame, 750);
    } catch (err: any) {
      console.error('Camera connection failure:', err);
      setCameraState('ERROR');
      let msg = err.message || 'Camera failed to start.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical webcam detected.';
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
    if (isProcessingRef.current || isPausedRef.current || !selectedCamera) return;

    if (selectedCamera.source_type === 'WEBCAM') {
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      setVideoResolution((prev) =>
        prev.width === video.videoWidth && prev.height === video.videoHeight
          ? prev
          : { width: video.videoWidth, height: video.videoHeight }
      );
      isProcessingRef.current = true;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isProcessingRef.current = false;
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          isProcessingRef.current = false;
          return;
        }
        await sendFrameToRecognition(blob, video.videoWidth, video.videoHeight, true, 'cover');
        isProcessingRef.current = false;
      }, 'image/jpeg', 0.85);
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

      setVideoResolution((prev) =>
        prev.width === sourceWidth && prev.height === sourceHeight
          ? prev
          : { width: sourceWidth, height: sourceHeight }
      );
      isProcessingRef.current = true;

      captureCanvas.toBlob(async (blob) => {
        if (!blob) {
          isProcessingRef.current = false;
          return;
        }
        await sendFrameToRecognition(blob, sourceWidth, sourceHeight, false, 'contain');
        isProcessingRef.current = false;
      }, 'image/jpeg', 0.85);
    }
  };

  const sendFrameToRecognition = async (
    blob: Blob,
    width: number,
    height: number,
    isMirrored: boolean,
    fitMode: 'cover' | 'contain' = 'cover'
  ) => {
    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    try {
      const res = await apiClient.post('/recognition/process', formData, {
        params: {
          session_id: selectedSessionId || undefined,
          camera_id: selectedCamera?.id,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = res.data;
      const faces = data.faces || [];
      setActiveFacesDetected((prev) => (prev === faces.length ? prev : faces.length));

      if (data.debug_telemetry) {
        setDebugDiagnostics(data.debug_telemetry);
      }

      drawOverlayBoxes(faces, width, height, isMirrored, fitMode);

      // Check for unknown faces and log event (throttled to 1 event per 4 seconds)
      const hasUnknown = faces.some((f: any) => f.decision === 'UNKNOWN' && !f.best_match);
      if (hasUnknown) {
        const now = Date.now();
        if (now - lastUnknownLoggedAtRef.current > 4000) {
          lastUnknownLoggedAtRef.current = now;
          const newEvent: UnknownFaceEvent = {
            id: `unk-${now}`,
            timestamp: new Date().toISOString(),
            timeStr: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            cameraName: selectedCamera?.name || 'Classroom Camera',
          };
          setUnknownEvents((prev) => [newEvent, ...prev.slice(0, 4)]);
        }
      }

      const hasKnown = faces.some((f: any) => f.status === 'VERIFIED' || f.decision === 'KNOWN');
      if (hasKnown) {
        fetchPresenceData();
        fetchRosterData();
      }
    } catch (err) {
      // quiet skip
    }
  };

  const handleCameraChange = (cameraId: string) => {
    stopLiveAttendance();
    setSelectedCameraId(cameraId);
    setCameraError(null);
    setTestResult(null);
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleTestCamera = async () => {
    if (!selectedCamera) return;
    setTestingCamera(true);
    setTestResult(null);
    try {
      const res = await testRegisteredCamera(selectedCamera.id);
      setTestResult(res);
      loadResources();
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'OFFLINE',
        message: err.response?.data?.detail || err.message || 'Could not connect to camera stream.',
      });
    } finally {
      setTestingCamera(false);
    }
  };

  // End Attendance Confirmation Flow
  const handleConfirmEndSession = async () => {
    if (!selectedSessionId) return;
    setIsEndingSession(true);

    try {
      // 1. Stop camera and recognition loops
      stopLiveAttendance();

      // 2. Commit attendance records & close session in database
      await closeSession(selectedSessionId, true);

      // 3. Compute final attendance summary
      const finalPresent = presenceList.filter((p) => p.attendance_status === 'PRESENT').length;
      const finalLate = presenceList.filter((p) => p.attendance_status === 'LATE').length;
      const totalRoster = enrolledStudents.length || selectedSession?.total_records || presenceList.length;
      const finalAbsent = Math.max(0, totalRoster - (finalPresent + finalLate));

      setSessionCompletedSummary({
        present: finalPresent,
        absent: finalAbsent,
        late: finalLate,
        unknown: unknownEvents.length,
      });

      setShowEndSessionModal(false);
      loadResources();
    } catch (err) {
      console.error('Failed to end attendance session:', err);
      alert('Could not cleanly close the session. Please try again.');
    } finally {
      setIsEndingSession(false);
    }
  };

  // Manual Attendance Marking
  const handleMarkStudent = async (studentId: string, status: 'PRESENT' | 'LATE' | 'ABSENT') => {
    if (!selectedSessionId) return;
    setMarkingStudentId(studentId);
    try {
      await markManualAttendance(selectedSessionId, studentId, status);
      await Promise.all([fetchPresenceData(), fetchRosterData()]);
    } catch (err) {
      console.error('Error marking manual attendance:', err);
    } finally {
      setMarkingStudentId(null);
    }
  };

  // Unknown Face Assignment
  const handleAssignUnknown = async (status: 'PRESENT' | 'LATE') => {
    if (!selectedSessionId || !reviewStudentId) return;
    try {
      await markManualAttendance(selectedSessionId, reviewStudentId, status, 'Identified from Unknown Face');
      await Promise.all([fetchPresenceData(), fetchRosterData()]);
      if (selectedUnknownEvent) {
        setUnknownEvents((prev) => prev.filter((e) => e.id !== selectedUnknownEvent.id));
      }
      setShowReviewModal(false);
      setSelectedUnknownEvent(null);
      setReviewStudentId('');
    } catch (err) {
      console.error('Failed to assign unknown face:', err);
    }
  };

  const handleDismissUnknown = () => {
    if (selectedUnknownEvent) {
      setUnknownEvents((prev) => prev.filter((e) => e.id !== selectedUnknownEvent.id));
    }
    setShowReviewModal(false);
    setSelectedUnknownEvent(null);
  };

  // =========================================================================
  // PHOTO MODE HELPERS (Secondary options via [More Options])
  // =========================================================================
  const startCaptureCamera = async (targetFacingMode: 'environment' | 'user' = facingMode) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCaptureCameraError('Camera access requires HTTPS or localhost context.');
      return;
    }
    setCaptureCameraStarting(true);
    setCaptureCameraError(null);
    setCaptureErrorMessage(null);

    try {
      if (captureStreamRef.current) {
        captureStreamRef.current.getTracks().forEach((t) => t.stop());
        captureStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetFacingMode }, width: { ideal: 1920, min: 640 } },
        audio: false,
      });

      captureStreamRef.current = stream;
      if (captureVideoRef.current) {
        captureVideoRef.current.srcObject = stream;
        try {
          await captureVideoRef.current.play();
        } catch (e) {
          console.warn('Capture video initial play notice:', e);
        }
      }

      setFacingMode(targetFacingMode);
      setCaptureCameraActive(true);
      setCapturedBlob(null);
      setCapturedPreviewUrl(null);
      setCaptureRecognitionResult(null);
    } catch (err: any) {
      setCaptureCameraError(err.message || 'Failed to start camera for snapshot.');
      setCaptureCameraActive(false);
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
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      setCaptureErrorMessage('Camera is not ready yet.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setCapturedPreviewUrl(url);
      setCaptureRecognitionResult(null);
      stopCaptureCamera();
    }, 'image/jpeg', 0.95);
  };

  const handleRecognizeCapturePhoto = async () => {
    if (!selectedSessionId || !capturedBlob) return;
    setProcessingCapturedPhoto(true);
    setCaptureErrorMessage(null);

    try {
      const resp = await recognizeImageAttendance(selectedSessionId, capturedBlob, 0.40);
      setCaptureRecognitionResult(resp);
      await Promise.all([fetchPresenceData(), fetchRosterData()]);
    } catch (err: any) {
      setCaptureErrorMessage(err.response?.data?.detail || err.message || 'Photo recognition failed.');
    } finally {
      setProcessingCapturedPhoto(false);
    }
  };

  const handleUploadSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);

    const preview = URL.createObjectURL(file);
    setUploadFile(file);
    setUploadPreviewUrl(preview);
    setUploadRecognitionResult(null);
    setUploadErrorMessage(null);
  };

  const handleRecognizeUploadPhoto = async () => {
    if (!selectedSessionId || !uploadFile) return;
    setProcessingUploadPhoto(true);
    setUploadErrorMessage(null);

    try {
      const resp = await recognizeImageAttendance(selectedSessionId, uploadFile, 0.40);
      setUploadRecognitionResult(resp);
      await Promise.all([fetchPresenceData(), fetchRosterData()]);
    } catch (err: any) {
      setUploadErrorMessage(err.response?.data?.detail || err.message || 'Upload recognition failed.');
    } finally {
      setProcessingUploadPhoto(false);
    }
  };

  const drawPhotoBoundingBoxes = (
    results: any[],
    imageElement: HTMLImageElement,
    canvasElement: HTMLCanvasElement
  ) => {
    if (!imageElement || !canvasElement || !Array.isArray(results)) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    const naturalWidth = imageElement.naturalWidth || imageElement.width || 1;
    const naturalHeight = imageElement.naturalHeight || imageElement.height || 1;
    const displayedWidth = imageElement.clientWidth || imageElement.width || naturalWidth;
    const displayedHeight = imageElement.clientHeight || imageElement.height || naturalHeight;

    canvasElement.width = displayedWidth;
    canvasElement.height = displayedHeight;
    ctx.clearRect(0, 0, displayedWidth, displayedHeight);

    const scaleX = displayedWidth / naturalWidth;
    const scaleY = displayedHeight / naturalHeight;

    results.forEach((item) => {
      if (!item.bbox) return;
      const x1 = (item.bbox.x1 ?? item.bbox.x ?? 0) * scaleX;
      const y1 = (item.bbox.y1 ?? item.bbox.y ?? 0) * scaleY;
      const x2 = (item.bbox.x2 ?? (item.bbox.x + (item.bbox.width || 0))) * scaleX;
      const y2 = (item.bbox.y2 ?? (item.bbox.y + (item.bbox.height || 0))) * scaleY;
      const w = Math.max(0, x2 - x1);
      const h = Math.max(0, y2 - y1);

      const isRecognized = item.status === 'recognized' || item.status === 'VERIFIED';
      const isAlreadyMarked = item.status === 'already_marked' || item.already_present;

      let strokeColor = '#94a3b8';
      let bgColor = 'rgba(51, 65, 85, 0.95)';
      let label = `${item.name || 'Unknown'} (${item.confidence_pct || 0}%)`;

      if (isRecognized && !isAlreadyMarked) {
        strokeColor = '#16a34a';
        bgColor = 'rgba(22, 163, 74, 0.95)';
        label = `✓ ${item.name} (${item.confidence_pct}%)`;
      } else if (isAlreadyMarked) {
        strokeColor = '#2563eb';
        bgColor = 'rgba(37, 99, 235, 0.95)';
        label = `✓ ${item.name} [Present]`;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x1, y1, w, h, 6);
      ctx.stroke();

      ctx.font = 'bold 10px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const pillW = textWidth + 14;
      const pillH = 20;
      const pillY = Math.max(2, y1 - pillH - 3);

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(x1, pillY, pillW, pillH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x1 + 7, pillY + 14);
    });
  };

  // Calculations for live metrics
  const isSessionRunning = cameraState === 'STREAMING';
  const totalRoster = sessionRoster?.total_enrolled ?? (enrolledStudents.length || selectedSession?.total_records || presenceList.length || 0);
  const presentCount = sessionRoster?.present_count ?? presenceList.filter((p) => p.attendance_status === 'PRESENT' || p.attendance_status === 'MANUAL_PRESENT').length;
  const lateCount = sessionRoster?.late_count ?? presenceList.filter((p) => p.attendance_status === 'LATE' || p.attendance_status === 'MANUAL_LATE').length;
  const inFrameCount = sessionRoster?.in_frame_count ?? presenceList.filter((p) => p.presence_state === 'PRESENT_AND_VISIBLE').length;
  const awayCount = sessionRoster?.away_count ?? presenceList.filter((p) => p.presence_state === 'TEMPORARILY_NOT_VISIBLE' || p.presence_state === 'NOT_CURRENTLY_VISIBLE').length;
  const markedTotal = presentCount + lateCount;
  const absentCount = sessionRoster?.absent_count ?? Math.max(0, totalRoster - markedTotal);
  const verifyingCount = presenceList.filter((p) => p.presence_state === 'VERIFYING').length;
  const ratePct = totalRoster > 0 ? Math.round((markedTotal / totalRoster) * 100) : 0;

  // Filter roster for right-hand column display
  const displayRosterItems = useMemo(() => {
    // If backend sessionRoster is available, use its complete roster
    if (sessionRoster && sessionRoster.roster.length > 0) {
      let list = sessionRoster.roster;
      if (rosterTab === 'IN_FRAME') {
        list = list.filter((r) => r.presence_state === 'PRESENT_AND_VISIBLE');
      } else if (rosterTab === 'AWAY') {
        list = list.filter((r) => r.presence_state !== 'PRESENT_AND_VISIBLE' && r.presence_state !== 'VERIFYING');
      }
      if (rosterSearch.trim()) {
        const q = rosterSearch.toLowerCase();
        list = list.filter(
          (r) =>
            r.student_name.toLowerCase().includes(q) ||
            r.student_code.toLowerCase().includes(q) ||
            r.roll_number.toLowerCase().includes(q)
        );
      }
      return list;
    }

    // Fallback: merge enrolledStudents with presenceList
    const fallbackList: ClassRosterStudentItem[] = enrolledStudents.map((st) => {
      const pres = presenceList.find((p) => p.student_id === st.id);
      return {
        student_id: st.id,
        student_name: `${st.first_name} ${st.last_name}`.trim(),
        student_code: st.student_code || '',
        roll_number: st.roll_number || '',
        attendance_status: pres?.attendance_status || 'NOT_RECORDED',
        presence_state: pres?.presence_state || 'NOT_SEEN',
        first_seen: pres?.first_seen,
        last_seen: pres?.last_seen,
        seconds_since_last_seen: pres?.seconds_since_last_seen,
        confidence: pres?.confidence || 0,
        source: 'AUTO_ROSTER',
      };
    });

    let list = fallbackList;
    if (rosterTab === 'IN_FRAME') {
      list = list.filter((r) => r.presence_state === 'PRESENT_AND_VISIBLE');
    } else if (rosterTab === 'AWAY') {
      list = list.filter((r) => r.presence_state !== 'PRESENT_AND_VISIBLE' && r.presence_state !== 'VERIFYING');
    }
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.student_code.toLowerCase().includes(q) ||
          r.roll_number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sessionRoster, enrolledStudents, presenceList, rosterTab, rosterSearch]);

  const isRemoteSource = selectedCamera && (selectedCamera.source_type === 'MOBILE' || selectedCamera.source_type === 'RTSP');
  const mjpegUrl = selectedCamera ? `/api/v1/cameras/${selectedCamera.id}/mjpeg?t=${mjpegTimestamp}` : '';

  // Filter students for manual modal
  const filteredStudents = useMemo(() => {
    if (!manualSearchQuery.trim()) return enrolledStudents;
    const q = manualSearchQuery.toLowerCase();
    return enrolledStudents.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
        (s.student_code && s.student_code.toLowerCase().includes(q))
    );
  }, [enrolledStudents, manualSearchQuery]);

  // Filter students for roster modal
  const filteredRosterStudents = useMemo(() => {
    if (!rosterSearchQuery.trim()) return enrolledStudents;
    const q = rosterSearchQuery.toLowerCase();
    return enrolledStudents.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
        (s.student_code && s.student_code.toLowerCase().includes(q))
    );
  }, [enrolledStudents, rosterSearchQuery]);

  return (
    <div className="space-y-4 w-full select-none">
      {/* Secondary Mode Back Button */}
      {attendanceMode !== 'LIVE_CAMERA' && (
        <div className="flex items-center justify-between pb-1">
          <button
            onClick={() => {
              stopCaptureCamera();
              setAttendanceMode('LIVE_CAMERA');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Live Camera</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SESSION CONTEXT & CONTROLS HEADER */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 sm:px-4 sm:py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Session Context & Status */}
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                Live Attendance
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-sm font-bold text-slate-900 truncate">
                {selectedSession ? `${selectedSession.class_name} · ${selectedSession.subject}` : 'TE-B · Soft Computing'}
              </span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{selectedSession?.room ? `Room ${selectedSession.room}` : 'CR 26'}</span>
              <span>•</span>
              <span>
                {selectedSession
                  ? `${formatTime(selectedSession.start_time)} – ${formatTime(selectedSession.end_time)}`
                  : '10:00 AM – 11:00 AM'}
              </span>
              <span>•</span>
              <span className="font-medium text-slate-600">
                Camera: {selectedCamera?.name || 'HP-CAM'}
              </span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center">
            {isSessionRunning ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Attendance Running</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Camera Standby</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 relative shrink-0">
          {!isSessionRunning ? (
            <div className="flex items-center gap-2">
              {/* Class picker if multiple */}
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                disabled={loadingSessions || sessions.length === 0}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] truncate"
              >
                {loadingSessions ? (
                  <option value="">Loading classes...</option>
                ) : sessions.length === 0 ? (
                  <option value="">No Classes Scheduled</option>
                ) : (
                  sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.class_name} • {s.subject}
                    </option>
                  ))
                )}
              </select>

              {/* Camera picker */}
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
                disabled={loadingCameras || cameras.length === 0}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[150px] truncate"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                onClick={startLiveAttendance}
                disabled={cameraState === 'STARTING' || cameras.length === 0 || !selectedSessionId}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {cameraState === 'STARTING' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Attendance</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* Pause / Resume Button */}
              <button
                onClick={handleTogglePause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
                title={isPaused ? 'Resume frame recognition' : 'Pause frame recognition'}
              >
                {isPaused ? (
                  <Play className="w-3.5 h-3.5 text-blue-600 fill-current" />
                ) : (
                  <Pause className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              {/* Single primary End Attendance Button */}
              <button
                onClick={() => setShowEndSessionModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>End Attendance</span>
              </button>
            </>
          )}

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreOptionsDropdown(!showMoreOptionsDropdown)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs transition cursor-pointer"
              title="More Options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
              <span>More</span>
            </button>

            {showMoreOptionsDropdown && (
              <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                <button
                  onClick={() => {
                    setShowMoreOptionsDropdown(false);
                    stopLiveAttendance();
                    setAttendanceMode('CAPTURE_PHOTO');
                    startCaptureCamera('environment');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                  <span>Photo Capture</span>
                </button>
                <button
                  onClick={() => {
                    setShowMoreOptionsDropdown(false);
                    stopLiveAttendance();
                    setAttendanceMode('UPLOAD_PHOTO');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Photo Upload</span>
                </button>
                <button
                  onClick={() => {
                    setShowMoreOptionsDropdown(false);
                    handleTestCamera();
                  }}
                  disabled={testingCamera}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 disabled:opacity-50"
                >
                  {testingCamera ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{testingCamera ? 'Testing Camera...' : 'Test Camera Connection'}</span>
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    setShowMoreOptionsDropdown(false);
                    setShowDebugDiagnostics((prev) => !prev);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {showDebugDiagnostics
                      ? 'Hide Pipeline Diagnostics'
                      : 'Pipeline Diagnostics'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostic Camera Test Result Banner */}
      {testResult && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              <strong>{testResult.status}: </strong>
              {testResult.message}
            </span>
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: LIVE CAMERA VIEW (2-COLUMN 65% / 35% SPLIT) */}
      {/* ========================================================================= */}
      {attendanceMode === 'LIVE_CAMERA' && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Left Column (65%): Camera View */}
          <div className="w-full lg:w-[65%] space-y-3 min-w-0">
            <div className="bg-slate-950 rounded-xl overflow-hidden relative border border-slate-800 shadow-sm flex items-center justify-center aspect-video min-h-[360px] sm:min-h-[460px]">
              {/* Local Webcam Video */}
              {selectedCamera?.source_type === 'WEBCAM' && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={async () => {
                    if (videoRef.current) {
                      setVideoResolution({
                        width: videoRef.current.videoWidth,
                        height: videoRef.current.videoHeight,
                      });
                      try {
                        await videoRef.current.play();
                      } catch (e) {
                        // ignore
                      }
                    }
                  }}
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    cameraState === 'STREAMING' ? 'block' : 'hidden'
                  }`}
                />
              )}

              {/* Remote RTSP / MJPEG Downlink */}
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
                      alt="Remote Stream"
                      crossOrigin="anonymous"
                      onLoad={() => {
                        if (mjpegImgRef.current && mjpegImgRef.current.naturalWidth > 0) {
                          setVideoResolution({
                            width: mjpegImgRef.current.naturalWidth,
                            height: mjpegImgRef.current.naturalHeight,
                          });
                        }
                      }}
                      className={`w-full h-full object-contain ${
                        cameraState === 'STREAMING' ? 'block' : 'hidden'
                      }`}
                    />
                  )}
                </>
              )}

              {/* Hidden frame extraction canvas */}
              <canvas ref={captureCanvasRef} className="hidden" />

              {/* Subtle Bounding Boxes Canvas Overlay */}
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  cameraState === 'STREAMING' ? 'block' : 'hidden'
                }`}
              />

              {/* Idle State: Camera Standby */}
              {cameraState === 'IDLE' && (
                <div className="text-center p-8 space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Camera Standby</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Select class and click Start Attendance to begin.
                    </p>
                  </div>
                  <button
                    onClick={startLiveAttendance}
                    disabled={cameras.length === 0 || !selectedSessionId}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Attendance</span>
                  </button>
                </div>
              )}

              {/* Connecting State */}
              {cameraState === 'STARTING' && (
                <div className="text-center p-8 space-y-2 text-white">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-400" />
                  <p className="text-xs font-medium">Connecting to camera stream...</p>
                </div>
              )}

              {/* Error State */}
              {cameraState === 'ERROR' && (
                <div className="text-center p-8 space-y-3 max-w-md">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">Camera Stream Offline</h4>
                    <p className="text-xs text-slate-400 mt-1">{cameraError || 'Unable to connect to camera.'}</p>
                  </div>
                  <button
                    onClick={startLiveAttendance}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconnect</span>
                  </button>
                </div>
              )}

              {/* Video Overlays */}
              {cameraState === 'STREAMING' && (
                <>
                  {/* Top Left: Camera name + Live status */}
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-md text-white text-[11px] font-medium flex items-center gap-2 border border-white/10 select-none">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold">LIVE</span>
                    <span className="text-white/40">|</span>
                    <span className="truncate max-w-[150px]">{selectedCamera?.name || 'HP-CAM'}</span>
                    <span className="text-white/60 font-mono text-[10px]">
                      {videoResolution.width > 0 ? `${videoResolution.width} × ${videoResolution.height}` : '1280 × 720'}
                    </span>
                  </div>

                  {/* Top Right: Faces detected count */}
                  <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-md text-white text-[11px] font-medium flex items-center gap-1.5 border border-white/10 select-none">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>{activeFacesDetected} {activeFacesDetected === 1 ? 'Face' : 'Faces'} Detected</span>
                  </div>

                  {/* Diagnostic Telemetry Overlay (Only visible when toggled via More -> Pipeline Diagnostics) */}
                  {showDebugDiagnostics && (
                    <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-md text-white font-mono text-[11px] border border-amber-500/40 shadow-lg flex items-center gap-3">
                      <span className="text-amber-400 font-bold">DIAGNOSTICS:</span>
                      <span>RAW: <strong className="text-slate-200">{debugDiagnostics?.raw_count ?? activeFacesDetected}</strong></span>
                      <span className="text-white/30">|</span>
                      <span>NMS: <strong className="text-sky-300">{debugDiagnostics?.nms_count ?? activeFacesDetected}</strong></span>
                      <span className="text-white/30">|</span>
                      <span>TRACKS: <strong className="text-emerald-300">{debugDiagnostics?.tracks_count ?? activeFacesDetected}</strong></span>
                      <span className="text-white/30">|</span>
                      <span>REC: <strong className="text-purple-300">{debugDiagnostics?.recognized_count ?? 0}</strong></span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Compact Camera Status Sub-strip */}
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-slate-600 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-800">{selectedCamera?.name || 'HP-CAM'}</span>
                <span className="text-slate-400">•</span>
                <span>{selectedCamera?.location || 'Classroom CR 26'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startLiveAttendance}
                  className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition cursor-pointer"
                  title="Reconnect camera stream"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (35%): Live Class Roster */}
          <div className="w-full lg:w-[35%] space-y-3 min-w-0">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col h-[520px] sm:h-[580px]">
              {/* Panel Header */}
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>LIVE CLASS ROSTER</span>
                      {isSessionRunning && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                    </h2>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {selectedSession ? `${selectedSession.class_name} · ${selectedSession.subject}` : 'TE-B · Soft Computing'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900">{presentCount} / {totalRoster} Present</div>
                    <div className="text-[10px] text-slate-500 font-mono">Attendance Rate: {ratePct}%</div>
                  </div>
                </div>

                {/* Progress */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2.5">
                  <div
                    className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ratePct)}%` }}
                  />
                </div>

                {/* Roster Filter Tabs */}
                <div className="flex items-center gap-1 mt-2.5 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setRosterTab('ALL')}
                    className={`flex-1 py-1 rounded-md transition text-center cursor-pointer ${
                      rosterTab === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    All ({totalRoster})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterTab('IN_FRAME')}
                    className={`flex-1 py-1 rounded-md transition text-center cursor-pointer ${
                      rosterTab === 'IN_FRAME'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    In Frame ({inFrameCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRosterTab('AWAY')}
                    className={`flex-1 py-1 rounded-md transition text-center cursor-pointer ${
                      rosterTab === 'AWAY'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Away ({awayCount})
                  </button>
                </div>

                {/* Search Filter Box */}
                <div className="relative mt-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search student..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-md pl-7 pr-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* UNKNOWN FACE SECTION (Warning Banner) */}
              {unknownEvents.length > 0 && (
                <div className="mt-2.5 p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-amber-900 truncate">Unknown Face Detected</div>
                      <div className="text-[10px] text-amber-700 truncate">
                        {unknownEvents[0]?.timeStr || 'Just now'} • Review candidate
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedUnknownEvent(unknownEvents[0]);
                      setShowReviewModal(true);
                    }}
                    className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold transition shrink-0 cursor-pointer"
                  >
                    Review
                  </button>
                </div>
              )}

              {/* LIVE ROSTER LIST (Scrollable) */}
              <div className="flex-1 overflow-y-auto space-y-1 mt-2.5 pr-1 divide-y divide-slate-100">
                {displayRosterItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <UserCheck className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No Students in This View</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                      Students will appear based on camera detection and class enrollment.
                    </p>
                  </div>
                ) : (
                  displayRosterItems.map((st) => {
                    const isPresent = st.attendance_status === 'PRESENT' || st.attendance_status === 'MANUAL_PRESENT';
                    const isLate = st.attendance_status === 'LATE' || st.attendance_status === 'MANUAL_LATE';
                    const isInFrame = st.presence_state === 'PRESENT_AND_VISIBLE';

                    return (
                      <div
                        key={st.student_id}
                        className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs hover:bg-slate-50/80 rounded-md p-1 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Avatar / Initials */}
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-[10px] shrink-0">
                            {getInitials(st.student_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{st.student_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                              <span>
                                {isPresent
                                  ? st.last_seen
                                    ? `Present · ${formatTime(st.last_seen)}`
                                    : 'Present'
                                  : 'Not detected'}
                              </span>
                              <span>•</span>
                              <span className={isInFrame ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                                {isInFrame ? 'In Frame' : 'Away'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Attendance Status Badge */}
                          <StatusBadge status={st.attendance_status} category="attendance" size="sm" />

                          {/* Inline Quick Action Button */}
                          {selectedSessionId && (
                            <button
                              type="button"
                              onClick={() => handleMarkStudent(st.student_id, isPresent || isLate ? 'ABSENT' : 'PRESENT')}
                              disabled={markingStudentId === st.student_id}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                                isPresent || isLate
                                  ? 'border border-rose-200 text-rose-600 hover:bg-rose-50'
                                  : 'border border-blue-200 text-blue-600 hover:bg-blue-50'
                              } disabled:opacity-50`}
                              title={isPresent || isLate ? 'Mark Absent' : 'Mark Present'}
                            >
                              {markingStudentId === st.student_id ? '...' : isPresent || isLate ? 'Absent' : 'Present'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: CAPTURE PHOTO (MOBILE / DESKTOP SNAPSHOT) */}
      {/* ========================================================================= */}
      {attendanceMode === 'CAPTURE_PHOTO' && (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Classroom Photo Snapshot</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newMode = facingMode === 'environment' ? 'user' : 'environment';
                    setFacingMode(newMode);
                    if (captureCameraActive) startCaptureCamera(newMode);
                  }}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-blue-600" />
                  <span>{facingMode === 'environment' ? 'Rear' : 'Front'}</span>
                </button>
              </div>
            </div>

            <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
              <video
                ref={captureVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  facingMode === 'user' ? 'transform -scale-x-100' : ''
                } ${captureCameraActive && !capturedPreviewUrl ? 'block' : 'hidden'}`}
              />
              <canvas ref={captureFrameCanvasRef} className="hidden" />

              {capturedPreviewUrl && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    ref={captureImageRef}
                    src={capturedPreviewUrl}
                    alt="Captured Classroom Photo"
                    onLoad={() => {
                      if (captureImageRef.current && captureOverlayCanvasRef.current && captureRecognitionResult?.results) {
                        drawPhotoBoundingBoxes(
                          captureRecognitionResult.results,
                          captureImageRef.current,
                          captureOverlayCanvasRef.current
                        );
                      }
                    }}
                    className="max-h-full max-w-full object-contain block"
                  />
                  <canvas
                    ref={captureOverlayCanvasRef}
                    className={`absolute inset-0 w-full h-full pointer-events-none ${
                      showCaptureOverlay ? 'block' : 'hidden'
                    }`}
                  />
                </div>
              )}

              {!captureCameraActive && !capturedPreviewUrl && (
                <div className="text-center p-6 text-slate-400 space-y-2">
                  <Camera className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-semibold text-slate-200">Camera Standby</p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Start camera to frame your classroom and take a photo to recognize all students.
                  </p>
                </div>
              )}

              {captureCameraStarting && (
                <div className="text-center p-6 text-white space-y-2">
                  <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-400" />
                  <p className="text-xs font-medium">Activating camera...</p>
                </div>
              )}
            </div>

            {(captureErrorMessage || captureCameraError) && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{captureErrorMessage || captureCameraError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {!captureCameraActive && !capturedPreviewUrl && (
                  <button
                    onClick={() => startCaptureCamera(facingMode)}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                  >
                    Start Camera
                  </button>
                )}
                {captureCameraActive && !capturedPreviewUrl && (
                  <button
                    onClick={handleCaptureFrame}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                  >
                    Capture Frame
                  </button>
                )}
                {capturedPreviewUrl && (
                  <>
                    <button
                      onClick={() => {
                        setCapturedBlob(null);
                        setCapturedPreviewUrl(null);
                        setCaptureRecognitionResult(null);
                        startCaptureCamera(facingMode);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCaptureOverlay((prev) => !prev)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      {showCaptureOverlay ? 'Hide Box' : 'Show Box'}
                    </button>
                  </>
                )}
              </div>

              {capturedPreviewUrl && (
                <button
                  onClick={handleRecognizeCapturePhoto}
                  disabled={processingCapturedPhoto}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {processingCapturedPhoto ? 'Recognizing...' : 'Recognize & Mark Attendance'}
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col h-[440px]">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Current Attendance ({presentCount} / {totalRoster})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1 divide-y divide-slate-100">
                {presenceList.map((st) => (
                  <div key={st.student_id} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 truncate">{st.student_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Present
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: UPLOAD PHOTO VIEW */}
      {/* ========================================================================= */}
      {attendanceMode === 'UPLOAD_PHOTO' && (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Upload Classroom Photo</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a group classroom photo to recognize all students simultaneously.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="cursor-pointer px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition inline-flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Image</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadSelect} className="hidden" />
              </label>
              {uploadFile && <span className="text-xs font-medium text-slate-700 truncate">{uploadFile.name}</span>}
            </div>

            {uploadPreviewUrl && (
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-slate-800">
                <img
                  ref={uploadImageRef}
                  src={uploadPreviewUrl}
                  alt="Upload Preview"
                  onLoad={() => {
                    if (uploadImageRef.current && uploadOverlayCanvasRef.current && uploadRecognitionResult?.results) {
                      drawPhotoBoundingBoxes(
                        uploadRecognitionResult.results,
                        uploadImageRef.current,
                        uploadOverlayCanvasRef.current
                      );
                    }
                  }}
                  className="max-h-full max-w-full object-contain block"
                />
                <canvas
                  ref={uploadOverlayCanvasRef}
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    showUploadOverlay ? 'block' : 'hidden'
                  }`}
                />
              </div>
            )}

            {uploadErrorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{uploadErrorMessage}</span>
              </div>
            )}

            {uploadPreviewUrl && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadOverlay((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  {showUploadOverlay ? 'Hide Box' : 'Show Box'}
                </button>
                <button
                  onClick={handleRecognizeUploadPhoto}
                  disabled={processingUploadPhoto}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {processingUploadPhoto ? 'Recognizing...' : 'Recognize & Mark Attendance'}
                </button>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col h-[440px]">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Current Attendance ({presentCount} / {totalRoster})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1 divide-y divide-slate-100">
                {presenceList.map((st) => (
                  <div key={st.student_id} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 truncate">{st.student_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Present
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM SUMMARY STRIP & ACTION BAR */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        {/* Left Side: Quick Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowManualModal(true)}
            disabled={!selectedSessionId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Mark Manually</span>
          </button>
          <button
            onClick={() => setShowRosterModal(true)}
            disabled={!selectedSessionId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
          >
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span>View Full Roster</span>
          </button>
        </div>

        {/* Right Side: Real-Time Summary Row */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Present: <strong className="text-slate-900">{presentCount}</strong></span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Late: <strong className="text-slate-900">{lateCount}</strong></span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Absent: <strong className="text-slate-900">{absentCount}</strong></span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Verifying: <strong className="text-slate-900">{verifyingCount}</strong></span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Unknown: <strong className="text-slate-900">{unknownEvents.length}</strong></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: END ATTENDANCE CONFIRMATION */}
      {/* ========================================================================= */}
      {showEndSessionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  End attendance session for {selectedSession?.class_name || 'this class'}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {presentCount} of {totalRoster} students marked present. All remaining unverified students will be marked absent.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowEndSessionModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEndSession}
                disabled={isEndingSession}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
              >
                {isEndingSession ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                <span>End Session</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SESSION COMPLETED SUMMARY */}
      {/* ========================================================================= */}
      {sessionCompletedSummary && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Attendance session completed successfully
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                The session records have been finalized in the database.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Present</div>
                <div className="text-base font-bold text-emerald-600">{sessionCompletedSummary.present}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Absent</div>
                <div className="text-base font-bold text-rose-600">{sessionCompletedSummary.absent}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Late</div>
                <div className="text-base font-bold text-amber-600">{sessionCompletedSummary.late}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-medium">Unknown</div>
                <div className="text-base font-bold text-slate-700">{sessionCompletedSummary.unknown}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => onNavigate?.('reports')}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
              >
                Download Report
              </button>
              <button
                onClick={() => {
                  setSessionCompletedSummary(null);
                  onNavigate?.('dashboard');
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANUAL ATTENDANCE */}
      {/* ========================================================================= */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-xl w-full shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Manual Attendance — {selectedSession?.class_name || 'Class'}
                </h3>
                <p className="text-xs text-slate-500">
                  Search and adjust attendance for any enrolled student.
                </p>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student by name or roll number..."
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-80 pr-1 divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No enrolled students found.
                </div>
              ) : (
                filteredStudents.map((st) => {
                  const presence = presenceList.find((p) => p.student_id === st.id);
                  const currentStatus = presence?.attendance_status || 'ABSENT';
                  const isMarking = markingStudentId === st.id;

                  return (
                    <div key={st.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">{st.first_name} {st.last_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {st.roll_number || st.student_code}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleMarkStudent(st.id, 'PRESENT')}
                          disabled={isMarking}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                            currentStatus === 'PRESENT'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleMarkStudent(st.id, 'LATE')}
                          disabled={isMarking}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                            currentStatus === 'LATE'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          Late
                        </button>
                        <button
                          onClick={() => handleMarkStudent(st.id, 'ABSENT')}
                          disabled={isMarking}
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                            currentStatus === 'ABSENT'
                              ? 'bg-slate-700 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: REVIEW UNKNOWN FACE */}
      {/* ========================================================================= */}
      {showReviewModal && selectedUnknownEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Review Unknown Face</h3>
                  <p className="text-[11px] text-slate-500">Detected at {selectedUnknownEvent.timeStr}</p>
                </div>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              This face did not match any enrolled student profile with high confidence. You can assign this sighting to an enrolled student or dismiss it.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Select Student to Assign:</label>
              <select
                value={reviewStudentId}
                onChange={(e) => setReviewStudentId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Choose Enrolled Student --</option>
                {enrolledStudents
                  .filter((s) => !presenceList.some((p) => p.student_id === s.id && p.attendance_status === 'PRESENT'))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.roll_number || s.student_code})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={handleDismissUnknown}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
              >
                Dismiss / Ignore
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleAssignUnknown('LATE')}
                  disabled={!reviewStudentId}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  Mark Late
                </button>
                <button
                  onClick={() => handleAssignUnknown('PRESENT')}
                  disabled={!reviewStudentId}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  Mark Present
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: FULL CLASS ROSTER */}
      {/* ========================================================================= */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 max-w-2xl w-full shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Class Roster — {selectedSession?.class_name || 'Class'}
                </h3>
                <p className="text-xs text-slate-500">
                  {totalRoster} enrolled • {presentCount} marked present
                </p>
              </div>
              <button
                onClick={() => setShowRosterModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search roster..."
                value={rosterSearchQuery}
                onChange={(e) => setRosterSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold text-[11px]">
                  <tr>
                    <th className="p-2.5">Student</th>
                    <th className="p-2.5">Roll Number</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Recognized At</th>
                    <th className="p-2.5">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRosterStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        No students found.
                      </td>
                    </tr>
                  ) : (
                    filteredRosterStudents.map((st) => {
                      const presence = presenceList.find((p) => p.student_id === st.id);
                      const status = presence?.attendance_status || 'ABSENT';
                      return (
                        <tr key={st.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-semibold text-slate-900">
                            {st.first_name} {st.last_name}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500">{st.roll_number || st.student_code}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                status === 'PRESENT'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : status === 'LATE'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {presence?.first_seen ? formatTime(presence.first_seen) : '—'}
                          </td>
                          <td className="p-2.5 font-mono">
                            {presence?.confidence ? `${Math.round(presence.confidence * 100)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowRosterModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
