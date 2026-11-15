export interface DashboardSummaryMetrics {
  total_students: number;
  enrolled_students: number;
  pending_enrollment: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  excused_today: number;
  attendance_rate_pct: number;
}

export interface DashboardActiveSession {
  id: string;
  session_code: string;
  subject: string;
  class_name: string;
  room: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  elapsed_minutes: number;
  camera_name?: string | null;
  present_count: number;
  absent_count: number;
  total_roster_count: number;
  status: string;
}

export interface DashboardSessionItem {
  id: string;
  session_code: string;
  subject: string;
  class_name: string;
  room: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  total_records: number;
  total_roster_count: number;
  status: string;
}

export interface DashboardTrendItem {
  record_date: string;
  day_label: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  attendance_pct: number;
}

export interface DashboardCameraItem {
  id: string;
  name: string;
  location: string;
  source_type: string;
  status: 'STREAMING' | 'CONNECTED' | 'NO_FRAME' | 'OFFLINE' | string;
  last_frame_seconds_ago?: number | null;
  last_frame_at?: string | null;
}

export interface DashboardActivityItem {
  id: string;
  event_type: 'ATTENDANCE' | 'SESSION' | 'CAMERA' | 'UNKNOWN_FACE' | 'ENROLLMENT' | string;
  title: string;
  subtitle: string;
  timestamp: string;
  time_ago: string;
  meta?: Record<string, any>;
}

export interface DashboardExceptionItem {
  type: 'UNENROLLED_STUDENTS' | 'OFFLINE_CAMERA' | 'LOW_CONFIDENCE' | 'SESSION_REVIEW' | string;
  title: string;
  description: string;
  severity: 'warning' | 'danger' | 'info';
  action_tab?: string | null;
  count: number;
}

export interface DashboardLiveRecognitionItem {
  id: string;
  student_name?: string;
  name?: string;
  confidence_pct?: number | null;
  confidence?: number | null;
  status: 'PRESENT' | 'LATE' | 'UNKNOWN' | 'REVIEW' | string;
  time_ago?: string;
  is_warning?: boolean;
}

export interface DashboardSummaryResponse {
  summary: DashboardSummaryMetrics;
  active_session?: DashboardActiveSession | null;
  upcoming_sessions: DashboardSessionItem[];
  today_sessions: DashboardSessionItem[];
  attendance_trend: DashboardTrendItem[];
  cameras: DashboardCameraItem[];
  recent_activities: DashboardActivityItem[];
  live_recognitions?: DashboardLiveRecognitionItem[];
  exceptions: DashboardExceptionItem[];
  server_time: string;
}
