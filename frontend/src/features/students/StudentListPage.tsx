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
  UserPlus,
  Smartphone,
  Filter,
  MoreVertical,
  AlertTriangle,
  Check,
  Edit2,
  Trash2,
  Calendar,
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

interface StudentListPageProps {
  onNavigate?: (tab: string, studentId?: string) => void;
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

  // Simplified Face Enrollment Dialog State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);
  const [enrollStep, setEnrollStep] = useState<'camera' | 'success'>('camera');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceQuality, setFaceQuality] = useState<'GOOD' | 'POOR'>('POOR');
  const [facePosition, setFacePosition] = useState<'CENTERED' | 'OFF_CENTER'>('OFF_CENTER');
  const [faceLiveness, setFaceLiveness] = useState<'VERIFIED' | 'CHECKING'>('CHECKING');
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

  // Calculate unique classes from loaded students
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class_name) set.add(s.class_name);
    });
    return Array.from(set).sort();
  }, [students]);

  // Active filter count badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterClass) count++;
    if (filterSection) count++;
    if (filterEnrollment) count++;
    if (filterAttendance) count++;
    return count;
  }, [filterClass, filterSection, filterEnrollment, filterAttendance]);

  // Load Students from API
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetchStudents({
        search: search.trim() || undefined,
        class_name: filterClass || undefined,
        section: filterSection || undefined,
        enrollment_status: filterEnrollment || undefined,
        page,
        limit,
      });

      setStudents(listRes.items);
      setTotal(listRes.total);
      setTotalPages(listRes.total_pages);

      // Populate attendance map directly from batch-aggregated backend metrics (eliminates N+1 API calls!)
      const historyMap: Record<string, StudentAttendanceHistoryResponse> = {};
      const missingAttendanceStudentIds: string[] = [];

      listRes.items.forEach((st) => {
        if (st.attendance_rate_pct !== undefined && st.attendance_rate_pct !== null) {
          historyMap[st.id] = {
            student_id: st.id,
            total_sessions: st.total_sessions || 0,
            present_sessions: st.present_sessions || 0,
            late_sessions: 0,
            absent_sessions: 0,
            excused_sessions: 0,
            attendance_rate_pct: st.attendance_rate_pct,
            records: [],
          };
        } else {
          missingAttendanceStudentIds.push(st.id);
        }
      });

      // Only fetch individually if the backend did not provide batch aggregated stats
      if (missingAttendanceStudentIds.length > 0) {
        await Promise.all(
          missingAttendanceStudentIds.map(async (id) => {
            try {
              const hist = await fetchStudentAttendanceHistory(id);
              historyMap[id] = hist;
            } catch {
              // quiet fallback
            }
          })
        );
      }
      setAttendanceMap(historyMap);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filterClass, filterSection, filterEnrollment, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle outside click to dismiss dropdown menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.student-action-menu-container') && !target.closest('.student-filter-container')) {
        setActiveMenuStudentId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filter students locally by attendance health if specified
  const displayedStudents = useMemo(() => {
    if (!filterAttendance) return students;
    return students.filter((st) => {
      const hist = attendanceMap[st.id];
      if (!hist || hist.total_sessions === 0) return false;
      const rate = hist.attendance_rate_pct;
      if (filterAttendance === 'healthy') return rate >= 85;
      if (filterAttendance === 'attention') return rate >= 75 && rate < 85;
      if (filterAttendance === 'critical') return rate < 75;
      return true;
    });
  }, [students, filterAttendance, attendanceMap]);

  const handleClearFilters = () => {
    setFilterClass('');
    setFilterSection('');
    setFilterEnrollment('');
    setFilterAttendance('');
    setPage(1);
    setIsFilterOpen(false);
  };

  // Open Profile Drawer
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

  // Open Simplified Face Enrollment Modal
  const openFaceEnrollmentModal = (student: Student) => {
    setEnrollStudent(student);
    setEnrollStep('camera');
    setCameraError(null);
    setEnrollErrorMessage(null);
    setFaceQuality('POOR');
    setFacePosition('OFF_CENTER');
    setFaceLiveness('CHECKING');
    setIsEnrollModalOpen(true);
    setActiveMenuStudentId(null);
    startWebcam();
  };

  const closeFaceEnrollmentModal = () => {
    stopWebcam();
    setIsEnrollModalOpen(false);
    setEnrollStudent(null);
  };

  // Webcam Management for Face Enrollment
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
        } catch (e) {
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

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      try {
        const res = await apiClient.post('/recognition/detect', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const faces = res.data?.faces || [];
        if (faces.length === 1) {
          const f = faces[0];
          setFaceQuality(f.is_valid !== false ? 'GOOD' : 'POOR');
          setFacePosition(f.pose?.is_frontal !== false ? 'CENTERED' : 'OFF_CENTER');
          setFaceLiveness(f.confidence > 0.85 ? 'VERIFIED' : 'CHECKING');
        } else {
          setFaceQuality('POOR');
          setFacePosition('OFF_CENTER');
          setFaceLiveness('CHECKING');
        }
      } catch {
        // quiet skip
      } finally {
        isDetectingRef.current = false;
      }
    }, 'image/jpeg', 0.80);
  };

  // Capture face and submit enrollment to backend
  const handleCaptureFace = async () => {
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

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setIsCapturingSample(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'enroll_sample.jpg');
      formData.append('pose_type', 'FRONTAL');

      try {
        const res = await enrollStudentFace(enrollStudent.id, formData);
        if (res.success) {
          stopWebcam();
          setEnrollStep('success');
          loadData();
          if (selectedProfileStudent?.id === enrollStudent.id) {
            setSelectedProfileStudent((prev) => (prev ? { ...prev, enrollment_status: 'ENROLLED' } : null));
          }
        } else {
          setEnrollErrorMessage(res.message || 'Face not clear. Please face the camera and try again.');
        }
      } catch (err: any) {
        setEnrollErrorMessage(formatApiErrorMessage(err, 'Failed to enroll face.'));
      } finally {
        setIsCapturingSample(false);
      }
    }, 'image/jpeg', 0.95);
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
      department: student.department,
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setModalError(null);
    try {
      const created = await createStudent(formData);
      setIsAddModalOpen(false);
      loadData();
      // Prompt face enrollment directly
      openFaceEnrollmentModal(created);
    } catch (err: any) {
      setModalError(formatApiErrorMessage(err, 'Failed to create student.'));
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

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Students</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage registered students and face enrollment.
          </p>
        </div>

        {/* Single Primary Action */}
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register Student</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. COMPACT SEARCH & FILTER TOOLBAR */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search students by name, roll number or email..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* Filter Popover Button */}
        <div className="relative student-filter-container">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition shadow-xs ${
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

          {/* Small Filter Dropdown Popover */}
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
                : 'Register your first student to begin attendance tracking.'}
            </p>
            {activeFilterCount > 0 ? (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Clear Filters
              </button>
            ) : (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register Student</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">ID / Roll</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Face Status</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedStudents.map((student) => {
                  const isEnrolled = student.enrollment_status === 'ENROLLED';
                  const isPartial = student.enrollment_status === 'PARTIAL';
                  const hist = attendanceMap[student.id];

                  return (
                    <tr
                      key={student.id}
                      onClick={() => openProfileDrawer(student)}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                    >
                      {/* 1. STUDENT: Name & Email */}
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900 text-xs">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{student.email}</div>
                      </td>

                      {/* 2. ID / ROLL */}
                      <td className="px-4 py-2.5 text-slate-700">
                        <div className="font-medium font-mono text-xs">{student.roll_number || student.student_code}</div>
                        {student.roll_number && student.student_code && student.roll_number !== student.student_code && (
                          <div className="text-[10px] text-slate-400 font-mono">{student.student_code}</div>
                        )}
                      </td>

                      {/* 3. CLASS */}
                      <td className="px-4 py-2.5 text-slate-600 font-medium">
                        {student.class_name} {student.section ? `(${student.section})` : ''}
                      </td>

                      {/* 4. FACE STATUS */}
                      <td className="px-4 py-2.5">
                        {isEnrolled ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Enrolled</span>
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium text-xs">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>Pending</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium text-xs">
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                            <span>Not Enrolled</span>
                          </span>
                        )}
                      </td>

                      {/* 5. ATTENDANCE */}
                      <td className="px-4 py-2.5">
                        {hist ? (
                          hist.total_sessions === 0 ? (
                            <span className="text-slate-400 font-mono">—</span>
                          ) : hist.attendance_rate_pct >= 85 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                              {hist.attendance_rate_pct}%
                            </span>
                          ) : hist.attendance_rate_pct >= 75 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                              <span>{hist.attendance_rate_pct}%</span>
                              <span className="text-amber-500 text-[10px]">⚠</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                              <span>{hist.attendance_rate_pct}%</span>
                              <span className="text-rose-500 text-[10px]">⚠</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300 text-[10px]">...</span>
                        )}
                      </td>

                      {/* 6. ACTIONS: [View] [Edit] [...] */}
                      <td
                        className="px-4 py-2.5 text-right whitespace-nowrap student-action-menu-container"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openProfileDrawer(student)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(student)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                          >
                            Edit
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
                                  <span>Capture / Update Face</span>
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
                                  <span>View Attendance</span>
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
          {/* Backdrop */}
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
                    <div className="w-11 h-11 rounded-full bg-blue-100 border border-blue-200 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
                      {selectedProfileStudent.first_name[0]}
                      {selectedProfileStudent.last_name[0]}
                    </div>
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

                {/* Face Enrollment Status */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white shadow-xs">
                  <div>
                    <div className="font-semibold text-slate-800 text-xs">Face Enrollment</div>
                    <div className="text-[11px] text-slate-500">InsightFace Biometrics</div>
                  </div>
                  {selectedProfileStudent.enrollment_status === 'ENROLLED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Enrolled</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span>Not Enrolled</span>
                    </span>
                  )}
                </div>

                {/* Attendance Summary */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-xs">Overall Attendance</span>
                    <span className="font-black text-sm text-slate-900">
                      {profileAttendance ? `${profileAttendance.attendance_rate_pct}%` : '—'}
                    </span>
                  </div>

                  {profileAttendance && (
                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                      <div className="p-2 rounded bg-emerald-50 text-emerald-800">
                        <div className="text-[10px] uppercase font-semibold">Present</div>
                        <div className="font-bold text-xs mt-0.5">{profileAttendance.present_sessions}</div>
                      </div>
                      <div className="p-2 rounded bg-amber-50 text-amber-800">
                        <div className="text-[10px] uppercase font-semibold">Late</div>
                        <div className="font-bold text-xs mt-0.5">{profileAttendance.late_sessions}</div>
                      </div>
                      <div className="p-2 rounded bg-rose-50 text-rose-800">
                        <div className="text-[10px] uppercase font-semibold">Absent</div>
                        <div className="font-bold text-xs mt-0.5">{profileAttendance.absent_sessions}</div>
                      </div>
                    </div>
                  )}
                </div>

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
                            <th className="px-3 py-2">Subject / Code</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {profileAttendance.records.slice(0, 8).map((rec) => {
                            const isPresent = rec.status === 'PRESENT' || rec.status === 'MANUAL_PRESENT';
                            const isLate = rec.status === 'LATE';

                            return (
                              <tr key={rec.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                                  {formatDateShort(rec.first_seen || rec.created_at)}
                                </td>
                                <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-[130px]">
                                  {rec.remarks && rec.remarks.startsWith('Class') ? rec.remarks : 'Attendance Session'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      isPresent
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : isLate
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {isPresent ? 'Present' : isLate ? 'Late' : 'Absent'}
                                  </span>
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
                    {selectedProfileStudent.enrollment_status === 'ENROLLED' ? 'Update Face' : 'Capture Face'}
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
      {/* 6. SIMPLIFIED FACE ENROLLMENT MODAL */}
      {/* ========================================================================= */}
      {isEnrollModalOpen && enrollStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Face Enrollment</h3>
                <p className="text-xs text-slate-500">
                  {enrollStudent.first_name} {enrollStudent.last_name} ({enrollStudent.roll_number || enrollStudent.student_code})
                </p>
              </div>
              <button onClick={closeFaceEnrollmentModal} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error banner */}
            {enrollErrorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{enrollErrorMessage}</span>
              </div>
            )}

            {/* Step: Camera Preview */}
            {enrollStep === 'camera' && (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
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
                      className={`w-36 h-48 rounded-[50%] border-2 border-dashed transition-colors duration-200 ${
                        faceQuality === 'GOOD' && facePosition === 'CENTERED'
                          ? 'border-emerald-400 shadow-emerald-500/20 shadow-lg'
                          : 'border-white/50'
                      }`}
                    />
                  </div>

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

                {/* 3 Simple Quality Status Pills */}
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div
                    className={`p-2 rounded-lg border font-medium transition ${
                      faceQuality === 'GOOD'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    Face Quality: <strong>{faceQuality === 'GOOD' ? 'Good' : 'Checking'}</strong>
                  </div>

                  <div
                    className={`p-2 rounded-lg border font-medium transition ${
                      facePosition === 'CENTERED'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    Position: <strong>{facePosition === 'CENTERED' ? 'Centered' : 'Align Face'}</strong>
                  </div>

                  <div
                    className={`p-2 rounded-lg border font-medium transition ${
                      faceLiveness === 'VERIFIED'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    Liveness: <strong>{faceLiveness === 'VERIFIED' ? 'Verified' : 'Checking'}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeFaceEnrollmentModal();
                      openQrEnrollModal(enrollStudent);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Enroll via Phone QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCaptureFace}
                    disabled={isCapturingSample || !cameraActive}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                  >
                    {isCapturingSample ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Enrolling Face...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>Capture Face</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step: Success State */}
            {enrollStep === 'success' && (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Face enrolled successfully</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {enrollStudent.first_name} is now registered for automated AI face attendance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFaceEnrollmentModal}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
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
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
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
                  {formSubmitting ? 'Registering...' : 'Register & Capture Face'}
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
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
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
      {/* 9. MODAL: DELETE CONFIRMATION (DESTRUCTIVE IN MENU) */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Delete Student</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete {activeStudent.first_name} {activeStudent.last_name} ({activeStudent.roll_number || activeStudent.student_code})? This action cannot be undone.
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
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Mobile Face Enrollment</h3>
              <button onClick={() => { setIsQrModalOpen(false); loadData(); }} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 inline-block shadow-xs">
              <img src={qrCodeUrl} alt="QR Code" className="w-44 h-44 mx-auto rounded" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900">
                {activeStudent.first_name} {activeStudent.last_name}
              </h4>
              <p className="text-[11px] text-slate-500">
                Scan this QR code with a mobile camera to enroll face biometrics using phone hardware.
              </p>
            </div>

            <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded truncate select-all">
              {mobileEnrollLink}
            </div>

            <button
              onClick={() => { setIsQrModalOpen(false); loadData(); }}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
            >
              Done & Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
