export interface Student {
  id: string;
  student_code: string;
  roll_number: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  class_name: string;
  section: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  enrollment_status: 'NOT_ENROLLED' | 'PARTIAL' | 'ENROLLED';
  avatar_url?: string | null;
  sample_count: number;
  attendance_rate_pct?: number | null;
  total_sessions?: number | null;
  present_sessions?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudentCreatePayload {
  student_code: string;
  roll_number: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  class_name: string;
  section?: string;
  status?: string;
  avatar_url?: string | null;
}

export interface StudentUpdatePayload {
  student_code?: string;
  roll_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
  class_name?: string;
  section?: string;
  status?: string;
  avatar_url?: string | null;
}

export interface StudentListResponse {
  items: Student[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface StudentStats {
  total_students: number;
  enrolled_count: number;
  not_enrolled_count: number;
  active_count: number;
  inactive_count: number;
  departments: string[];
  classes: string[];
}

