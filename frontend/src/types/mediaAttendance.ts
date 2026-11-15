export interface MediaAttendanceItem {
  student_id?: string | null;
  student_name: string;
  student_code?: string | null;
  roll_number?: string | null;
  confidence: number;
  confidence_pct: number;
  attendance_status: string;
  decision: 'KNOWN' | 'UNKNOWN' | 'UNCERTAIN';
  status?: string;
  first_seen?: string | null;
  last_seen?: string | null;
  observation_count: number;
  remarks?: string | null;
}

export interface UnresolvedFaceItem {
  face_id: string;
  decision: 'UNKNOWN' | 'UNCERTAIN';
  status?: string;
  confidence: number;
  confidence_pct: number;
  timestamp_sec?: number | null;
  frame_number?: number | null;
  bbox: number[];
  quality_score: number;
  rejection_reason?: string | null;
}

export interface DetectedMediaFaceItem {
  face_id: string;
  bounding_box: { x?: number; y?: number; width?: number; height?: number };
  bbox: number[];
  detection_confidence: number;
  quality_score: number;
  identity: string;
  student_id?: string | null;
  student_code?: string | null;
  roll_number?: string | null;
  recognition_confidence: number;
  confidence_pct: number;
  status: 'VERIFIED' | 'VERIFYING' | 'UNKNOWN' | 'LOW_QUALITY';
  rejection_reason?: string | null;
}

export interface MediaAnalysisResponse {
  success?: boolean;
  job_id?: string | null;
  session_id: string;
  session_subject: string;
  session_class: string;
  media_type: 'IMAGE' | 'VIDEO';
  filename: string;
  duration_sec?: number | null;
  resolution?: string | null;
  faces_detected: number;
  recognized_count: number;
  unknown_count: number;
  uncertain_count: number;
  low_quality_count?: number;
  attendance_marked_count: number;
  duplicates_prevented?: number;
  recognized_students: MediaAttendanceItem[];
  unresolved_faces: UnresolvedFaceItem[];
  faces?: DetectedMediaFaceItem[];
  results?: any[];
  processing_time_ms: number;
  status: string;
}

export interface MediaJobResponse {
  id: string;
  session_id: string;
  session_subject?: string | null;
  session_class?: string | null;
  media_type: 'IMAGE' | 'VIDEO';
  filename: string;
  file_size_bytes?: number | null;
  duration_sec?: number | null;
  resolution?: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress_pct: number;
  frames_total: number;
  frames_processed: number;
  faces_detected_total: number;
  recognized_count: number;
  unknown_count: number;
  uncertain_count: number;
  attendance_marked_count: number;
  summary_json?: {
    recognized?: MediaAttendanceItem[];
    unresolved?: UnresolvedFaceItem[];
    faces?: DetectedMediaFaceItem[];
    results?: any[];
    duplicates_prevented?: number;
    low_quality_count?: number;
  };
  error_message?: string | null;
  created_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface SessionBiometricValidationResponse {
  session_id: string;
  subject: string;
  class_name: string;
  status: string;
  total_enrolled_students: number;
  students_with_face_data: number;
  students_missing_face_data: number;
  can_process: boolean;
  warning_message?: string | null;
}
