import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Filter,
  MoreVertical,
  AlertTriangle,
  Check,
  Edit2,
  Trash2,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Copy,
  Download,
  ArrowRight,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Student,
  StudentCreatePayload,
} from '../../types/student';
import {
  fetchStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  fetchStudentAttendanceHistory,
  enrollStudentFace,
  StudentAttendanceHistoryResponse,
} from '../../services/studentApi';
import { apiClient } from '../../services/api';
import { formatApiErrorMessage } from '../../utils/apiError';
import { StatusBadge, Progress, Avatar, Button, Badge } from '../../components/ui';

interface StudentListPageProps {
  onNavigate?: (tab: string, studentId?: string) => void;
}

// 7-step guided face enrollment specification
interface EnrollmentAngle {
  id: string;
  name: string;
  poseType: string;
  instruction: string;
  hint: string;
}

const ENROLLMENT_ANGLES: EnrollmentAngle[] = [
  {
    id: 'front',
    name: 'Front (Neutral)',
    poseType: 'FRONT',
    instruction: 'Look directly at the camera with a neutral expression',
    hint: 'Keep your head straight and eyes open.',
  },
  {
    id: 'smile',
    name: 'Front (Smile)',
    poseType: 'FRONT',
    instruction: 'Now smile naturally facing forward',
    hint: 'A gentle smile helps recognize natural expression variations.',
  },
  {
    id: 'left',
    name: 'Turn Left (15°)',
    poseType: 'LEFT_15',
    instruction: 'Slowly turn your head slightly to the left',
    hint: 'Turn about 15 degrees while keeping camera in sight.',
  },
  {
    id: 'right',
    name: 'Turn Right (15°)',
    poseType: 'RIGHT_15',
    instruction: 'Slowly turn your head slightly to the right',
    hint: 'Turn about 15 degrees to your right.',
  },
  {
    id: 'up',
    name: 'Tilt Up (10°)',
    poseType: 'TILT_UP',
    instruction: 'Slightly tilt your head upward',
    hint: 'Lift your chin slightly.',
  },
  {
    id: 'down',
    name: 'Tilt Down (10°)',
    poseType: 'TILT_DOWN',
    instruction: 'Slightly tilt your head downward',
    hint: 'Lower your chin slightly.',
  },
  {
    id: 'final',
    name: 'Final Confirmation',
    poseType: 'FRONT',
    instruction: 'Look straight ahead for final confirmation',
    hint: 'Hold steady for biometric verification.',
  },
];

interface CapturedAngleSample {
  angleIndex: number;
  dataUrl: string;
  qualityScore: number;
  capturedAt: string;
}

export const StudentListPage: React.FC<StudentListPageProps> = ({ onNavigate }) => {
  // Data State
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const limit = 10;

  // Attendance rate map for table rows: studentId -> StudentAttendanceHistoryResponse
  const [attendanceMap, setAttendanceMap] = useState<Record<string, StudentAttendanceHistoryResponse>>({});

  // Search & Filter State
  const [search, setSearch] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSection, setFilterSection] = useState<string>('');
  const [filterEnrollment, setFilterEnrollment] = useState<string>('');
  const [filterAttendance, setFilterAttendance] = useState<string>('');

  // Bulk Selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Row Action Dropdown (Active student ID for [...] popover)
  const [activeMenuStudentId, setActiveMenuStudentId] = useState<string | null>(null);

  // Profile Slide-Over Panel State
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<Student | null>(null);
  const [profileAttendance, setProfileAttendance] = useState<StudentAttendanceHistoryResponse | null>(null);
  const [loadingProfileAttendance, setLoadingProfileAttendance] = useState<boolean>(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // 7-Step Guided Face Enrollment Dialog State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [enrollStep, setEnrollStep] = useState<'camera' | 'summary' | 'success'>('camera');
  const [currentAngleIndex, setCurrentAngleIndex] = useState<number>(0);
  const [capturedSamples, setCapturedSamples] = useState<Record<number, CapturedAngleSample>>({});
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState<boolean>(false);

  // Real-time Detection State for Enrollment Reticle
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [faceQuality, setFaceQuality] = useState<'Good' | 'Too Dark' | 'Too Bright' | 'Checking'>('Checking');
  const [facePosition, setFacePosition] = useState<'Centered' | 'Move Closer' | 'Move Back' | 'Align Face'>('Align Face');
  const [isCapturingSample, setIsCapturingSample] = useState<boolean>(false);
  const [enrollErrorMessage, setEnrollErrorMessage] = useState<string | null>(null);

  // DOM Refs for Face Enrollment
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);

  // QR Mobile Enrollment Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [mobileEnrollLink, setMobileEnrollLink] = useState<string>('');
  const [isCopiedQr, setIsCopiedQr] = useState<boolean>(false);

  // Form State for Register / Edit
  const [formData, setFormData] = useState<StudentCreatePayload>({
    student_code: '',
    roll_number: '',
    first_name: '',
    last_name: '',
    email: '',
    department: 'Computer Science',
    class_name: 'CSE-4A',
    section: 'A',
    status: 'ACTIVE',
  });

  // Load students list
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStudents({
        search: search.trim() || undefined,
        class_name: filterClass || undefined,
        section: filterSection || undefined,
        enrollment_status: filterEnrollment || undefined,
        page,
        limit,
      });
      setStudents(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || Math.ceil((res.total || 0) / limit) || 1);

      // Fetch attendance history for each student asynchronously
      const idsToFetch = (res.items || []).map((s) => s.id);
      idsToFetch.forEach(async (id) => {
        try {
          const hist = await fetchStudentAttendanceHistory(id);
          setAttendanceMap((prev) => ({ ...prev, [id]: hist }));
        } catch {
          // ignore error for table row summary
        }
      });
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filterClass, filterSection, filterEnrollment, page, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Click outside to close row action menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (activeMenuStudentId && !(e.target as Element)?.closest('.student-action-menu-container')) {
        setActiveMenuStudentId(null);
      }
      if (isFilterOpen && !(e.target as Element)?.closest('.student-filter-container')) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeMenuStudentId, isFilterOpen]);

  // Available classes for dropdown filter
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class_name) set.add(s.class_name);
    });
    return Array.from(set).sort();
  }, [students]);

  // Client-side filter for attendance health
  const displayedStudents = useMemo(() => {
    if (!filterAttendance) return students;
    return students.filter((s) => {
      const hist = attendanceMap[s.id];
      if (!hist || hist.total_sessions === 0) return filterAttendance === 'untracked';
      const pct = hist.attendance_rate_pct;
      if (filterAttendance === 'healthy') return pct >= 85;
      if (filterAttendance === 'attention') return pct >= 75 && pct < 85;
      if (filterAttendance === 'critical') return pct < 75;
      return true;
    });
  }, [students, attendanceMap, filterAttendance]);

  // Active filter count badge
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterClass) c++;
    if (filterSection) c++;
    if (filterEnrollment) c++;
    if (filterAttendance) c++;
    return c;
  }, [filterClass, filterSection, filterEnrollment, filterAttendance]);

  const handleClearFilters = () => {
    setFilterClass('');
    setFilterSection('');
    setFilterEnrollment('');
    setFilterAttendance('');
    setPage(1);
    setIsFilterOpen(false);
  };

  // Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedStudentIds.length === displayedStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(displayedStudents.map((s) => s.id));
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExportSelectedCsv = () => {
    const selected = students.filter((s) => selectedStudentIds.includes(s.id));
    if (selected.length === 0) return;

    const headers = ['Roll Number', 'Student Code', 'First Name', 'Last Name', 'Email', 'Class', 'Section', 'Enrollment Status', 'Attendance Rate'];
    const rows = selected.map((s) => {
      const hist = attendanceMap[s.id];
      const rate = hist && hist.total_sessions > 0 ? `${hist.attendance_rate_pct}%` : 'N/A';
      return [
        `"${s.roll_number || ''}"`,
        `"${s.student_code || ''}"`,
        `"${s.first_name}"`,
        `"${s.last_name}"`,
        `"${s.email}"`,
        `"${s.class_name || ''}"`,
        `"${s.section || ''}"`,
        `"${s.enrollment_status}"`,
        `"${rate}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `students_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedStudentIds.length} selected students? This action cannot be undone.`)) {
      return;
    }
    setLoading(true);
    try {
      await Promise.all(selectedStudentIds.map((id) => deleteStudent(id)));
      setSelectedStudentIds([]);
      loadData();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to delete some students.'));
    } finally {
      setLoading(false);
    }
  };

  // Profile Slide-Over Drawer
  const openProfileDrawer = async (student: Student) => {
    setSelectedProfileStudent(student);
    setActiveMenuStudentId(null);
    setLoadingProfileAttendance(true);
    try {
      const hist = await fetchStudentAttendanceHistory(student.id);
      setProfileAttendance(hist);
    } catch (err) {
      console.warn('Failed to load student profile attendance:', err);
      setProfileAttendance(null);
    } finally {
      setLoadingProfileAttendance(false);
    }
  };

  const closeProfileDrawer = () => {
    setSelectedProfileStudent(null);
    setProfileAttendance(null);
  };

  // Webcam Management for Guided 7-Step Face Enrollment
  const startWebcam = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam is unavailable. HTTPS or localhost context required.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // ignore
        }
      }

      // Detection scan loop for quality / centering indicators
      detectIntervalRef.current = setInterval(runEnrollmentDetectionScan, 400);
    } catch (err: any) {
      console.error('Webcam start failed:', err);
      setCameraError(err.message || 'Unable to access camera.');
      setCameraActive(false);
    }
  };

  const stopWebcam = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Open Guided Face Enrollment Modal
  const openFaceEnrollmentModal = (student: Student) => {
    setEnrollStudent(student);
    setEnrollStep('camera');
    setCurrentAngleIndex(0);
    setCapturedSamples({});
    setCameraError(null);
    setEnrollErrorMessage(null);
    setFaceDetected(false);
    setFaceQuality('Checking');
    setFacePosition('Align Face');
    setJustCaptured(false);
    setIsEnrollModalOpen(true);
    setActiveMenuStudentId(null);
    startWebcam();
  };

  const closeFaceEnrollmentModal = () => {
    stopWebcam();
    setIsEnrollModalOpen(false);
    setEnrollStudent(null);
    setCapturedSamples({});
  };

  // Frame scanner assessing quality & centering
  const runEnrollmentDetectionScan = async () => {
    if (isDetectingRef.current || !videoRef.current || !captureCanvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    isDetectingRef.current = true;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

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

      const form = new FormData();
      form.append('file', blob, 'frame.jpg');

      try {
        const res = await apiClient.post('/recognition/detect', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const faces = res.data?.faces || [];
        if (faces.length === 1) {
          const f = faces[0];
          setFaceDetected(true);
          const brightness = f.brightness ?? 100;
          if (brightness < 45) {
            setFaceQuality('Too Dark');
          } else if (brightness > 220) {
            setFaceQuality('Too Bright');
          } else {
            setFaceQuality('Good');
          }

          if (f.pose?.is_frontal !== false) {
            setFacePosition('Centered');
          } else {
            setFacePosition('Align Face');
          }
        } else if (faces.length > 1) {
          setFaceDetected(true);
          setFaceQuality('Too Dark');
          setFacePosition('Align Face');
        } else {
          setFaceDetected(false);
          setFaceQuality('Checking');
          setFacePosition('Align Face');
        }
      } catch {
        // quiet skip
      } finally {
        isDetectingRef.current = false;
      }
    }, 'image/jpeg', 0.80);
  };

  // Capture face for the active angle
  const handleCaptureCurrentAngle = async () => {
    if (!enrollStudent || !videoRef.current || !captureCanvasRef.current || isCapturingSample) return;

    setIsCapturingSample(true);
    setEnrollErrorMessage(null);

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCapturingSample(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsCapturingSample(false);
        return;
      }

      const activeAngle = ENROLLMENT_ANGLES[currentAngleIndex];
      const form = new FormData();
      form.append('file', blob, `enroll_${activeAngle.id}.jpg`);
      form.append('pose_type', activeAngle.poseType);

      try {
        const res = await enrollStudentFace(enrollStudent.id, form);
        if (res.success) {
          // Visual capture confirmation: trigger green flash
          setJustCaptured(true);
          setTimeout(() => setJustCaptured(false), 900);

          // Save thumbnail in captured map
          setCapturedSamples((prev) => ({
            ...prev,
            [currentAngleIndex]: {
              angleIndex: currentAngleIndex,
              dataUrl,
              qualityScore: 95,
              capturedAt: new Date().toISOString(),
            },
          }));

          // Auto-advance after 1.2s delay
          setTimeout(() => {
            if (currentAngleIndex < ENROLLMENT_ANGLES.length - 1) {
              setCurrentAngleIndex((prev) => prev + 1);
            } else {
              // Completed all 7 angles! Show summary card
              setEnrollStep('summary');
            }
          }, 1200);
        } else {
          setEnrollErrorMessage(res.message || 'Face unclear or position invalid. Please adjust and try again.');
        }
      } catch (err: any) {
        setEnrollErrorMessage(formatApiErrorMessage(err, 'Failed to capture face sample.'));
      } finally {
        setIsCapturingSample(false);
      }
    }, 'image/jpeg', 0.95);
  };

  // Retake a specific angle
  const handleRetakeAngle = (index: number) => {
    setCurrentAngleIndex(index);
    setEnrollStep('camera');
    setEnrollErrorMessage(null);
  };

  // Skip the current angle
  const handleSkipAngle = () => {
    if (currentAngleIndex < ENROLLMENT_ANGLES.length - 1) {
      setCurrentAngleIndex((prev) => prev + 1);
    } else {
      setEnrollStep('summary');
    }
  };

  // Finalize Enrollment
  const handleCompleteEnrollment = () => {
    stopWebcam();
    setEnrollStep('success');
    loadData();
    if (selectedProfileStudent && enrollStudent && selectedProfileStudent.id === enrollStudent.id) {
      setSelectedProfileStudent((prev) => (prev ? { ...prev, enrollment_status: 'ENROLLED' } : null));
    }
  };

  // Form Handlers
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const openCreateModal = () => {
    setFormData({
      student_code: `STU-${String(total + 1).padStart(3, '0')}`,
      roll_number: `R-${String(total + 1).padStart(3, '0')}`,
      first_name: '',
      last_name: '',
      email: '',
      department: 'Computer Science',
      class_name: 'CSE-4A',
      section: 'A',
      status: 'ACTIVE',
    });
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setActiveStudent(student);
    setFormData({
      student_code: student.student_code,
      roll_number: student.roll_number,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      department: student.department || 'Computer Science',
      class_name: student.class_name,
      section: student.section,
      status: student.status,
    });
    setModalError(null);
    setIsEditModalOpen(true);
    setActiveMenuStudentId(null);
  };

  const openDeleteModal = (student: Student) => {
    setActiveStudent(student);
    setIsDeleteModalOpen(true);
    setActiveMenuStudentId(null);
  };

  const openQrEnrollModal = async (student: Student) => {
    setActiveStudent(student);
    setActiveMenuStudentId(null);
    setIsCopiedQr(false);
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol;
    const url = `${protocol}//${host}${port}/mobile-enrollment?student_id=${student.id}`;

    setMobileEnrollLink(url);
    try {
      const qr = await QRCode.toDataURL(url, { width: 240, margin: 2 });
      setQrCodeUrl(qr);
      setIsQrModalOpen(true);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleCopyQrLink = () => {
    if (!mobileEnrollLink) return;
    navigator.clipboard.writeText(mobileEnrollLink);
    setIsCopiedQr(true);
    setTimeout(() => setIsCopiedQr(false), 2000);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setModalError(null);
    try {
      const created = await createStudent(formData);
      setIsAddModalOpen(false);
      loadData();
      openFaceEnrollmentModal(created);
    } catch (err: any) {
      setModalError(formatApiErrorMessage(err, 'Failed to register student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;
    setFormSubmitting(true);
    setModalError(null);
    try {
      await updateStudent(activeStudent.id, formData);
      setIsEditModalOpen(false);
      loadData();
      if (selectedProfileStudent?.id === activeStudent.id) {
        setSelectedProfileStudent((prev) =>
          prev
            ? {
                ...prev,
                ...formData,
                status: (formData.status as Student['status']) || prev.status,
              }
            : null
        );
      }
    } catch (err: any) {
      setModalError(formatApiErrorMessage(err, 'Failed to update student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!activeStudent) return;
    setFormSubmitting(true);
    try {
      await deleteStudent(activeStudent.id);
      setIsDeleteModalOpen(false);
      if (selectedProfileStudent?.id === activeStudent.id) {
        setSelectedProfileStudent(null);
      }
      loadData();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to delete student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    } catch {
      return '—';
    }
  };

  const isAllSelected = displayedStudents.length > 0 && selectedStudentIds.length === displayedStudents.length;

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Students</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional directory, multi-angle face enrollment, and individual attendance history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            icon={<Plus className="w-4 h-4" />}
          >
            Register Student
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SEARCH & FILTER TOOLBAR */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search students by name, roll number, or email..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* Filter Popover Button */}
        <div className="relative student-filter-container">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition shadow-xs ${
              activeFilterCount > 0
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Filter Dropdown Popover */}
          {isFilterOpen && (
            <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-30 space-y-3 text-xs animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-900">Filter Students</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleClearFilters}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Class Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Class</label>
                <select
                  value={filterClass}
                  onChange={(e) => {
                    setFilterClass(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="">All Classes</option>
                  {availableClasses.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Section Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Section</label>
                <select
                  value={filterSection}
                  onChange={(e) => {
                    setFilterSection(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>

              {/* Face Enrollment Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Face Enrollment</label>
                <select
                  value={filterEnrollment}
                  onChange={(e) => {
                    setFilterEnrollment(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="ENROLLED">Enrolled</option>
                  <option value="PARTIAL">Pending</option>
                  <option value="NOT_ENROLLED">Not Enrolled</option>
                </select>
              </div>

              {/* Attendance Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Attendance</label>
                <select
                  value={filterAttendance}
                  onChange={(e) => {
                    setFilterAttendance(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="">All Attendance</option>
                  <option value="healthy">Healthy (≥85%)</option>
                  <option value="attention">Requires Attention (75-84%)</option>
                  <option value="critical">Critical (&lt;75%)</option>
                </select>
              </div>

              <button
                onClick={() => setIsFilterOpen(false)}
                className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Apply & Close
              </button>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition shadow-xs disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* BULK ACTIONS TOOLBAR (When students are selected) */}
      {/* ========================================================================= */}
      {selectedStudentIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-900 shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <span className="font-bold">{selectedStudentIds.length}</span>
            <span>students selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelectedCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 font-semibold transition shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
            <button
              onClick={() => setSelectedStudentIds([])}
              className="p-1 text-blue-500 hover:text-blue-700 ml-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. STUDENT TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
            Loading students...
          </div>
        ) : displayedStudents.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-800">No students found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {search || activeFilterCount > 0
                ? 'Try adjusting your search or filter options.'
                : 'Register your first student to begin automated attendance tracking.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                <tr>
                  <th className="p-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Roll / ID</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Face Status</th>
                  <th className="px-4 py-3">Attendance Rate</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayedStudents.map((student) => {
                  const hist = attendanceMap[student.id];
                  const isEnrolled = student.enrollment_status === 'ENROLLED';
                  const isSelected = selectedStudentIds.includes(student.id);

                  return (
                    <tr
                      key={student.id}
                      onClick={() => openProfileDrawer(student)}
                      className={`hover:bg-slate-50/70 transition cursor-pointer ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="p-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectStudent(student.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectStudent(student.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* 1. STUDENT AVATAR & NAME */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            name={`${student.first_name} ${student.last_name}`}
                            size="md"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {student.first_name} {student.last_name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">{student.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. ROLL / ID */}
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-medium font-mono text-xs">{student.roll_number || student.student_code}</div>
                        {student.roll_number && student.student_code && student.roll_number !== student.student_code && (
                          <div className="text-[10px] text-slate-400 font-mono">{student.student_code}</div>
                        )}
                      </td>

                      {/* 3. CLASS */}
                      <td className="px-4 py-2.5 text-slate-600 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{student.class_name}</span>
                          {student.section && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold">
                              Sec {student.section}
                            </span>
                          )}
                        </span>
                      </td>

                      {/* 4. FACE STATUS */}
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          status={student.enrollment_status || 'NOT_ENROLLED'}
                          category="enrollment"
                          size="sm"
                        />
                      </td>

                      {/* 5. ATTENDANCE RATE WITH PROGRESS BAR */}
                      <td className="px-4 py-2.5">
                        {hist ? (
                          hist.total_sessions === 0 ? (
                            <span className="text-slate-400 font-mono">—</span>
                          ) : (
                            <div className="space-y-1 max-w-[130px]">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className={`font-bold font-mono ${
                                  hist.attendance_rate_pct >= 85
                                    ? 'text-emerald-600'
                                    : hist.attendance_rate_pct >= 75
                                    ? 'text-amber-600'
                                    : 'text-rose-600'
                                }`}>
                                  {hist.attendance_rate_pct}%
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {hist.present_sessions}/{hist.total_sessions}
                                </span>
                              </div>
                              <Progress
                                value={hist.attendance_rate_pct}
                                size="sm"
                                variant="auto"
                              />
                            </div>
                          )
                        ) : (
                          <span className="text-slate-300 text-[10px]">...</span>
                        )}
                      </td>

                      {/* 6. ACTIONS: [Capture / Re-enroll] [View] [...] */}
                      <td
                        className="px-4 py-2.5 text-right whitespace-nowrap student-action-menu-container"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {isEnrolled ? (
                            <button
                              type="button"
                              onClick={() => openFaceEnrollmentModal(student)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition shadow-2xs"
                              title="Re-enroll biometrics"
                            >
                              <RotateCcw className="w-3 h-3 text-slate-500" />
                              <span>Re-enroll</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openFaceEnrollmentModal(student)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition shadow-2xs"
                              title="Enroll face biometrics"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Enroll Face</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openProfileDrawer(student)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                          >
                            View
                          </button>

                          {/* [...] Menu Button */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveMenuStudentId(
                                  activeMenuStudentId === student.id ? null : student.id
                                )
                              }
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              title="More actions"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {/* Dropdown Popover */}
                            {activeMenuStudentId === student.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-left text-xs animate-in fade-in-50">
                                <button
                                  type="button"
                                  onClick={() => openFaceEnrollmentModal(student)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                                >
                                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Guided Enrollment</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openQrEnrollModal(student)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                                >
                                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Phone QR Enroll</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuStudentId(null);
                                    if (onNavigate) {
                                      onNavigate('attendance', student.id);
                                    } else {
                                      openProfileDrawer(student);
                                    }
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Attendance History</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(student)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Edit Student</span>
                                </button>
                                <div className="border-t border-slate-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => openDeleteModal(student)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2 text-rose-600 font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Delete Student</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. TABLE FOOTER (PAGINATION) */}
        {/* ========================================================================= */}
        {students.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {students.length} of {total} students
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-medium">
                Page {page} of {totalPages || 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. STUDENT PROFILE SLIDE-OVER DRAWER */}
      {/* ========================================================================= */}
      {selectedProfileStudent && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            onClick={closeProfileDrawer}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-xl flex flex-col">
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Student Profile</h2>
                  <p className="text-xs text-slate-500">Academic & biometric record</p>
                </div>
                <button
                  onClick={closeProfileDrawer}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
                {/* Profile Identity Card */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={`${selectedProfileStudent.first_name} ${selectedProfileStudent.last_name}`}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {selectedProfileStudent.first_name} {selectedProfileStudent.last_name}
                      </h3>
                      <div className="text-slate-500 font-mono text-[11px]">
                        {selectedProfileStudent.roll_number || selectedProfileStudent.student_code}
                      </div>
                      <div className="text-slate-500 text-[11px] truncate">
                        {selectedProfileStudent.email}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                    <div>
                      <span className="text-slate-400">Class: </span>
                      <span className="font-semibold text-slate-800">{selectedProfileStudent.class_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Section: </span>
                      <span className="font-semibold text-slate-800">{selectedProfileStudent.section || 'A'}</span>
                    </div>
                  </div>
                </div>

                {/* Face Enrollment Status with Re-enroll action */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">Face Biometrics</div>
                      <div className="text-[11px] text-slate-500">Automated Camera Verification</div>
                    </div>
                    <StatusBadge
                      status={selectedProfileStudent.enrollment_status || 'NOT_ENROLLED'}
                      category="enrollment"
                      size="sm"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {selectedProfileStudent.enrollment_status === 'ENROLLED'
                        ? 'Biometrics active across all sessions'
                        : 'Face sample required for automated attendance'}
                    </span>
                    <button
                      onClick={() => openFaceEnrollmentModal(selectedProfileStudent)}
                      className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs transition"
                    >
                      {selectedProfileStudent.enrollment_status === 'ENROLLED' ? 'Re-enroll' : 'Enroll Now'}
                    </button>
                  </div>
                </div>

                {/* Attendance Summary */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-xs">Overall Attendance</span>
                    <span className="font-black text-sm text-slate-900">
                      {profileAttendance ? `${profileAttendance.attendance_rate_pct}%` : '—'}
                    </span>
                  </div>

                  {profileAttendance && (
                    <>
                      <Progress value={profileAttendance.attendance_rate_pct} size="md" variant="auto" />

                      <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                          <div className="text-[10px] uppercase font-semibold">Present</div>
                          <div className="font-bold text-xs mt-0.5">{profileAttendance.present_sessions}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                          <div className="text-[10px] uppercase font-semibold">Late</div>
                          <div className="font-bold text-xs mt-0.5">{profileAttendance.late_sessions}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-100">
                          <div className="text-[10px] uppercase font-semibold">Absent</div>
                          <div className="font-bold text-xs mt-0.5">{profileAttendance.absent_sessions}</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Recent Attendance History Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>Recent Attendance</span>
                    </h4>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('attendance', selectedProfileStudent.id)}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium hover:underline inline-flex items-center"
                      >
                        Full Records &rarr;
                      </button>
                    )}
                  </div>

                  {loadingProfileAttendance ? (
                    <div className="py-6 text-center text-slate-400 text-xs">Loading records...</div>
                  ) : !profileAttendance || profileAttendance.records.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                      No attendance sessions recorded yet.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-semibold">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Subject / Class</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {profileAttendance.records.slice(0, 8).map((rec) => {
                            return (
                              <tr key={rec.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                                  {formatDateShort(rec.first_seen || rec.created_at)}
                                </td>
                                <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-[130px]">
                                  {rec.remarks && rec.remarks.startsWith('Class') ? rec.remarks : 'Lecture'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <StatusBadge status={rec.status} category="attendance" size="sm" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Bottom Actions */}
              <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
                <button
                  type="button"
                  onClick={() => openFaceEnrollmentModal(selectedProfileStudent)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>
                    {selectedProfileStudent.enrollment_status === 'ENROLLED' ? 'Re-enroll Face' : 'Enroll Face'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openEditModal(selectedProfileStudent)}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit Student</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. GUIDED 7-STEP MULTI-ANGLE FACE ENROLLMENT MODAL */}
      {/* ========================================================================= */}
      {isEnrollModalOpen && enrollStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Guided Face Enrollment
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {enrollStudent.first_name} {enrollStudent.last_name} ({enrollStudent.roll_number || enrollStudent.student_code}) • Class {enrollStudent.class_name}
                </p>
              </div>
              <button
                onClick={closeFaceEnrollmentModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Banner */}
            {enrollErrorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{enrollErrorMessage}</span>
              </div>
            )}

            {/* STEP 1: CAMERA CAPTURE (7-Step Guided Workflow) */}
            {enrollStep === 'camera' && (
              <div className="space-y-3.5 flex-1 flex flex-col">
                {/* Step Progress Dots & Indicator */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-600">
                      Step {currentAngleIndex + 1} of {ENROLLMENT_ANGLES.length}
                    </span>
                    <span className="text-slate-600 font-semibold">
                      {ENROLLMENT_ANGLES[currentAngleIndex].name}
                    </span>
                  </div>

                  {/* 7 Step Dots */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {ENROLLMENT_ANGLES.map((angle, idx) => {
                      const isCaptured = !!capturedSamples[idx];
                      const isCurrent = idx === currentAngleIndex;

                      return (
                        <button
                          key={angle.id}
                          type="button"
                          onClick={() => setCurrentAngleIndex(idx)}
                          className={`h-1.5 rounded-full transition-all ${
                            isCaptured
                              ? 'bg-emerald-500'
                              : isCurrent
                              ? 'bg-blue-600 ring-2 ring-blue-300 ring-offset-1'
                              : 'bg-slate-200'
                          }`}
                          title={`${angle.name} ${isCaptured ? '(Captured)' : ''}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Friendly Instructional Guidance Banner */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-0.5 shadow-2xs">
                  <div className="text-xs sm:text-sm font-bold text-slate-900">
                    {ENROLLMENT_ANGLES[currentAngleIndex].instruction}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {ENROLLMENT_ANGLES[currentAngleIndex].hint}
                  </div>
                </div>

                {/* Video Feed with Oval Guide Reticle */}
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  <canvas ref={captureCanvasRef} className="hidden" />

                  {/* Oval Face Guide Reticle */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`w-40 h-52 sm:w-48 sm:h-64 rounded-[50%] border-2 transition-all duration-300 ${
                        justCaptured
                          ? 'border-emerald-400 bg-emerald-500/20 scale-105 shadow-emerald-500/50 shadow-2xl'
                          : faceDetected && facePosition === 'Centered' && faceQuality === 'Good'
                          ? 'border-emerald-400 shadow-emerald-500/30 shadow-lg'
                          : 'border-white/50 border-dashed'
                      }`}
                    />
                  </div>

                  {/* Capture Flash Overlay */}
                  {justCaptured && (
                    <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-2xs flex items-center justify-center transition-opacity animate-in fade-in-50">
                      <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl animate-bounce">
                        <Check className="w-8 h-8" />
                      </div>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-4 text-center text-rose-400 text-xs space-y-2">
                      <AlertTriangle className="w-6 h-6 text-rose-500" />
                      <p>{cameraError}</p>
                      <button
                        onClick={startWebcam}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs hover:bg-slate-700"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>

                {/* Clean Quality & Centering Indicators Bar (Not squished pills) */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {/* Indicator 1: Face Detected */}
                  <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-slate-600 font-medium">
                      Face: <strong className="text-slate-900">{faceDetected ? 'Detected' : 'Searching'}</strong>
                    </span>
                  </div>

                  {/* Indicator 2: Position */}
                  <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        facePosition === 'Centered' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-slate-600 font-medium">
                      Position: <strong className="text-slate-900">{facePosition}</strong>
                    </span>
                  </div>

                  {/* Indicator 3: Lighting */}
                  <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceQuality === 'Good'
                          ? 'bg-emerald-500'
                          : faceQuality === 'Too Dark'
                          ? 'bg-rose-500'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-slate-600 font-medium">
                      Lighting: <strong className="text-slate-900">{faceQuality}</strong>
                    </span>
                  </div>
                </div>

                {/* Captured Angle Thumbnail Strip */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Captured Angles (click to re-take):</span>
                    <span>{Object.keys(capturedSamples).length} of 7 completed</span>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {ENROLLMENT_ANGLES.map((angle, idx) => {
                      const sample = capturedSamples[idx];
                      const isCurrent = idx === currentAngleIndex;

                      return (
                        <button
                          key={angle.id}
                          type="button"
                          onClick={() => handleRetakeAngle(idx)}
                          className={`group relative rounded-lg border overflow-hidden p-1 flex flex-col items-center justify-center text-center transition aspect-square ${
                            isCurrent
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                              : sample
                              ? 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          {sample ? (
                            <>
                              <img
                                src={sample.dataUrl}
                                alt={angle.name}
                                className="w-full h-full object-cover rounded"
                              />
                              <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                <Check className="w-2.5 h-2.5" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-1 text-[10px] text-slate-400 leading-tight">
                              <span className="font-semibold">{idx + 1}</span>
                              <span className="text-[9px] truncate w-full">{angle.name.split(' ')[0]}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Action Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      closeFaceEnrollmentModal();
                      openQrEnrollModal(enrollStudent);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Enroll via Phone QR</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSkipAngle}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
                    >
                      Skip Angle
                    </button>

                    <button
                      type="button"
                      onClick={handleCaptureCurrentAngle}
                      disabled={isCapturingSample || !cameraActive}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                    >
                      {isCapturingSample ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Sample...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          <span>Capture {ENROLLMENT_ANGLES[currentAngleIndex].name}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: SUMMARY CARD REVIEW */}
            {enrollStep === 'summary' && (
              <div className="space-y-4 py-2">
                <div className="text-center space-y-1">
                  <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900">Multi-Angle Enrollment Complete</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    All 7 facial angles were captured and embedded into the student profile.
                  </p>
                </div>

                {/* 7 Captured Thumbnails Grid */}
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  {ENROLLMENT_ANGLES.map((angle, idx) => {
                    const sample = capturedSamples[idx];

                    return (
                      <div key={angle.id} className="space-y-1 text-center">
                        <div className="aspect-square bg-slate-200 rounded-lg overflow-hidden border border-slate-300 relative shadow-2xs">
                          {sample ? (
                            <img src={sample.dataUrl} alt={angle.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px]">
                              Skipped
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-700 truncate">{angle.name.split(' ')[0]}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEnrollStep('camera');
                      setCurrentAngleIndex(0);
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
                  >
                    Re-capture Angles
                  </button>

                  <button
                    type="button"
                    onClick={handleCompleteEnrollment}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <span>Complete Enrollment</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: SUCCESS STATE */}
            {enrollStep === 'success' && (
              <div className="py-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
                  <Check className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Student Enrolled Successfully</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {enrollStudent.first_name} is now registered with active facial biometrics for automated classroom attendance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFaceEnrollmentModal}
                  className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL: REGISTER STUDENT */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Register Student</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">First Name *</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleFormChange}
                    placeholder="e.g. Rahul"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Last Name *</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleFormChange}
                    placeholder="e.g. Sharma"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Roll Number *</label>
                  <input
                    type="text"
                    name="roll_number"
                    required
                    value={formData.roll_number}
                    onChange={handleFormChange}
                    placeholder="22CSE041"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Student ID *</label>
                  <input
                    type="text"
                    name="student_code"
                    required
                    value={formData.student_code}
                    onChange={handleFormChange}
                    placeholder="STU-041"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="rahul.sharma@campus.edu"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="font-semibold text-slate-700">Class Name</label>
                  <input
                    type="text"
                    name="class_name"
                    value={formData.class_name}
                    onChange={handleFormChange}
                    placeholder="CSE-4A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Section</label>
                  <input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleFormChange}
                    placeholder="A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50"
                >
                  Register & Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL: EDIT STUDENT */}
      {/* ========================================================================= */}
      {isEditModalOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Edit Student</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Class</label>
                  <input
                    type="text"
                    name="class_name"
                    value={formData.class_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Section</label>
                  <input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. MODAL: DELETE CONFIRMATION */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-xl text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Delete Student</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete {activeStudent.first_name} {activeStudent.last_name} ({activeStudent.roll_number || activeStudent.student_code})? This will also remove biometric vectors.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                disabled={formSubmitting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. MODAL: QR MOBILE ENROLLMENT */}
      {/* ========================================================================= */}
      {isQrModalOpen && activeStudent && qrCodeUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Mobile Face Enrollment</h3>
              <button
                onClick={() => {
                  setIsQrModalOpen(false);
                  loadData();
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 inline-block shadow-2xs">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto rounded-lg" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span className="text-xs font-bold text-slate-900">
                  {activeStudent.first_name} {activeStudent.last_name}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({activeStudent.roll_number || activeStudent.student_code})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Scan this QR code with the student&apos;s phone to complete multi-angle face enrollment directly on their device.
              </p>
            </div>

            {/* Expiration Badge */}
            <div className="flex items-center justify-center">
              <Badge variant="blue" size="sm">
                ⏱ Link active for 15 minutes
              </Badge>
            </div>

            {/* Link Copy Bar */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
              <input
                type="text"
                readOnly
                value={mobileEnrollLink}
                className="bg-transparent text-[11px] text-slate-600 font-mono flex-1 outline-none truncate px-1"
              />
              <button
                onClick={handleCopyQrLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition"
              >
                {isCopiedQr ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => {
                setIsQrModalOpen(false);
                loadData();
              }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
            >
              Done & Refresh Directory
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
