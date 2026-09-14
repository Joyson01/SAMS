import { apiClient } from './api';
import {
  AttendanceOverridePayload,
  AttendanceRecord,
  AttendanceSession,
  SessionCreatePayload,
} from '../types/attendance';

export const fetchSessions = async (filters?: {
  class_name?: string;
  subject?: string;
  subject_id?: string;
  status?: string;
  scheduled_date?: string;
}): Promise<AttendanceSession[]> => {
  const response = await apiClient.get<AttendanceSession[]>('/attendance/sessions', {
    params: filters,
  });
  return response.data;
};

export const fetchSessionById = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await apiClient.get<AttendanceSession>(`/attendance/sessions/${sessionId}`);
  return response.data;
};

export const createSession = async (payload: SessionCreatePayload): Promise<AttendanceSession> => {
  const response = await apiClient.post<AttendanceSession>('/attendance/sessions', payload);
  return response.data;
};

export const startSession = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await apiClient.put<AttendanceSession>(`/attendance/sessions/${sessionId}/start`);
  return response.data;
};

export const closeSession = async (
  sessionId: string,
  autoMarkAbsent = true
): Promise<AttendanceSession> => {
  const response = await apiClient.put<AttendanceSession>(
    `/attendance/sessions/${sessionId}/close`,
    null,
    {
      params: { auto_mark_absent: autoMarkAbsent },
    }
  );
  return response.data;
};

export const fetchSessionRecords = async (
  sessionId: string,
  status?: string
): Promise<AttendanceRecord[]> => {
  const response = await apiClient.get<AttendanceRecord[]>(
    `/attendance/sessions/${sessionId}/records`,
    {
      params: status ? { status } : undefined,
    }
  );
  return response.data;
};

export const overrideRecord = async (
  recordId: string,
  payload: AttendanceOverridePayload
): Promise<AttendanceRecord> => {
  const response = await apiClient.put<AttendanceRecord>(
    `/attendance/records/${recordId}/override`,
    payload
  );
  return response.data;
};

export const markManualAttendance = async (
  sessionId: string,
  studentId: string,
  status: string,
  remarks?: string
): Promise<AttendanceRecord> => {
  const response = await apiClient.post<AttendanceRecord>('/attendance/manual', null, {
    params: {
      session_id: sessionId,
      student_id: studentId,
      status,
      remarks: remarks || 'Manual Attendance',
    },
  });
  return response.data;
};

export interface PhotoRecognitionFaceResult {
  student_id: string | null;
  name: string;
  student_name: string;
  student_code?: string;
  roll_number?: string;
  confidence: number;
  similarity: number;
  confidence_pct: number;
  status: 'recognized' | 'already_marked' | 'unknown' | 'low_quality' | string;
  attendance_marked: boolean;
  already_present: boolean;
  rejection_reason?: string;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

export interface PhotoRecognitionResponse {
  success: boolean;
  faces_detected: number;
  students_recognized: number;
  attendance_marked: number;
  duplicates_skipped: number;
  unknown_faces: number;
  results: PhotoRecognitionFaceResult[];
  annotated_image_url?: string;
  processing_time_ms?: number;
}

export const recognizeImageAttendance = async (
  sessionId: string,
  imageFileOrBlob: File | Blob,
  threshold: number = 0.40
): Promise<PhotoRecognitionResponse> => {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('threshold', threshold.toString());
  if (imageFileOrBlob instanceof File) {
    formData.append('image', imageFileOrBlob, imageFileOrBlob.name);
  } else {
    formData.append('image', imageFileOrBlob, 'captured_photo.jpg');
  }

  const response = await apiClient.post<PhotoRecognitionResponse>(
    '/attendance/recognize-frame',
    formData
  );
  return response.data;
};

export const recognizeFrameAttendance = async (options: {
  sessionId: string;
  cameraId?: string;
  frameUrl?: string;
  imageFileOrBlob?: File | Blob;
  threshold?: number;
}): Promise<PhotoRecognitionResponse> => {
  const formData = new FormData();
  formData.append('session_id', options.sessionId);
  if (options.cameraId) formData.append('camera_id', options.cameraId);
  if (options.frameUrl) formData.append('frame_url', options.frameUrl);
  if (options.threshold !== undefined) formData.append('threshold', options.threshold.toString());

  if (options.imageFileOrBlob) {
    if (options.imageFileOrBlob instanceof File) {
      formData.append('image', options.imageFileOrBlob, options.imageFileOrBlob.name);
    } else {
      formData.append('image', options.imageFileOrBlob, 'captured_frame.jpg');
    }
  }

  const response = await apiClient.post<PhotoRecognitionResponse>(
    '/attendance/recognize-frame',
    formData
  );
  return response.data;
};

export interface StudentAttendanceSummary {
  student_id: string;
  total_sessions: number;
  present_sessions: number;
  late_sessions: number;
  absent_sessions: number;
  excused_sessions: number;
  attendance_rate_pct: number;
  records: AttendanceRecord[];
}

export const fetchStudentAttendance = async (studentId: string): Promise<StudentAttendanceSummary> => {
  const response = await apiClient.get<StudentAttendanceSummary>(`/attendance/students/${studentId}`);
  return response.data;
};

export interface ClassRosterStudentItem {
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  attendance_status: string;
  presence_state: string;
  first_seen?: string | null;
  last_seen?: string | null;
  seconds_since_last_seen?: number | null;
  confidence: number;
  source: string;
  record_id?: string | null;
}

export interface SessionRosterResponse {
  session_id: string;
  class_name: string;
  subject: string;
  total_enrolled: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  in_frame_count: number;
  away_count: number;
  attendance_rate_pct: number;
  roster: ClassRosterStudentItem[];
}

export const fetchSessionRoster = async (sessionId: string): Promise<SessionRosterResponse> => {
  const response = await apiClient.get<SessionRosterResponse>(`/attendance/sessions/${sessionId}/roster`);
  return response.data;
};

