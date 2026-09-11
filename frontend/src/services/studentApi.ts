import { apiClient } from './api';
import {
  Student,
  StudentCreatePayload,
  StudentListResponse,
  StudentStats,
  StudentUpdatePayload,
} from '../types/student';

export interface StudentFilterParams {
  search?: string;
  department?: string;
  class_name?: string;
  section?: string;
  status?: string;
  enrollment_status?: string;
  page?: number;
  limit?: number;
}

export const fetchStudents = async (params: StudentFilterParams = {}): Promise<StudentListResponse> => {
  const response = await apiClient.get<StudentListResponse>('/students', { params });
  return response.data;
};

export const fetchStudentStats = async (): Promise<StudentStats> => {
  const response = await apiClient.get<StudentStats>('/students/stats');
  return response.data;
};

export const fetchStudentById = async (studentId: string): Promise<Student> => {
  const response = await apiClient.get<Student>(`/students/${studentId}`);
  return response.data;
};

export const createStudent = async (payload: StudentCreatePayload): Promise<Student> => {
  const response = await apiClient.post<Student>('/students', payload);
  return response.data;
};

export const updateStudent = async (
  studentId: string,
  payload: StudentUpdatePayload
): Promise<Student> => {
  const response = await apiClient.put<Student>(`/students/${studentId}`, payload);
  return response.data;
};

export const deleteStudent = async (studentId: string): Promise<{ status: string; message: string }> => {
  const response = await apiClient.delete<{ status: string; message: string }>(`/students/${studentId}`);
  return response.data;
};

export interface StudentAttendanceHistoryRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  status: string;
  source?: string;
  confidence: number;
  first_seen: string;
  last_seen: string;
  track_id?: number | null;
  liveness_score: number;
  remarks?: string | null;
  created_at: string;
}

export interface StudentAttendanceHistoryResponse {
  student_id: string;
  total_sessions: number;
  present_sessions: number;
  late_sessions: number;
  absent_sessions: number;
  excused_sessions: number;
  attendance_rate_pct: number;
  records: StudentAttendanceHistoryRecord[];
}

export const fetchStudentAttendanceHistory = async (
  studentId: string
): Promise<StudentAttendanceHistoryResponse> => {
  const response = await apiClient.get<StudentAttendanceHistoryResponse>(
    `/attendance/students/${studentId}`
  );
  return response.data;
};

export const enrollStudentFace = async (
  studentId: string,
  formData: FormData
): Promise<{ success: boolean; message: string; sample_count?: number }> => {
  const response = await apiClient.post<{ success: boolean; message: string; sample_count?: number }>(
    `/students/${studentId}/enroll`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return response.data;
};
