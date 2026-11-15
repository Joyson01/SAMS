export interface ClassAttendanceSummary {
  class_name: string;
  department: string;
  total_sessions: number;
  total_students_enrolled: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  avg_attendance_pct: number;
}

export interface DefaulterStudentSummary {
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  department: string;
  class_name: string;
  total_sessions: number;
  attended_sessions: number;
  attendance_pct: number;
  is_critical: boolean;
}

export interface DailyAttendanceTrend {
  record_date: string;
  total_sessions: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  attendance_pct: number;
}

export interface InstitutionAnalyticsResponse {
  overall_attendance_rate_pct: number;
  total_sessions_conducted: number;
  total_students_enrolled: number;
  defaulter_students_count: number;
  perfect_attendance_count: number;
  class_breakdowns: ClassAttendanceSummary[];
  daily_trends: DailyAttendanceTrend[];
  defaulters: DefaulterStudentSummary[];
}

