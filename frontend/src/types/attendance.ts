export interface AttendanceSession {
  id: string;
  session_code: string;
  timetable_entry_id?: string | null;
  subject_id?: string | null;
  class_id?: string | null;
  class_name: string;
  subject: string;
  subject_code?: string | null;
  room: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  late_threshold_minutes: number;
  attendance_mode: 'AI_FACE_RECOGNITION' | 'MANUAL';
  status: 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  camera_id?: string | null;
  camera_ids: string[];
  total_records: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  excused_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionCreatePayload {
  session_code?: string;
  timetable_entry_id?: string;
  subject_id?: string;
  class_id?: string;
  class_name: string;
  subject: string;
  room: string;
  scheduled_date?: string;
  start_time: string;
  end_time: string;
  late_threshold_minutes?: number;
  attendance_mode?: string;
  camera_id?: string;
  camera_ids?: string[];
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT' | 'MANUAL_EXCUSED' | 'REVIEW_REQUIRED';
  source: 'AI' | 'MANUAL' | 'AUTO_ROSTER';
  confidence: number;
  first_seen: string;
  last_seen: string;
  track_id?: number | null;
  liveness_score: number;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceOverridePayload {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT' | 'MANUAL_EXCUSED' | 'REVIEW_REQUIRED';
  remarks: string;
}
