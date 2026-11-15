export interface Subject {
  id: string;
  code: string;
  name: string;
  short_name?: string;
  vertical?: string;
  department: string;
  theory_hours: number;
  tutorial_hours: number;
  practical_hours: number;
  theory_credits: number;
  tutorial_credits: number;
  practical_credits: number;
  credits: number;
  semester?: number;
  academic_year?: string;
  status: 'ACTIVE' | 'INACTIVE';
  assigned_classes?: string[];
  total_sessions_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectCreatePayload {
  code: string;
  name: string;
  short_name?: string;
  vertical?: string;
  department: string;
  theory_hours?: number;
  tutorial_hours?: number;
  practical_hours?: number;
  theory_credits?: number;
  tutorial_credits?: number;
  practical_credits?: number;
  credits: number;
  semester?: number;
  academic_year?: string;
  status: string;
  assigned_classes?: string[];
}

export interface ClassSection {
  id: string;
  name: string;
  department: string;
  effective_from?: string;
  year?: number;
  semester?: number;
  section: string;
  academic_year?: string;
  status: 'ACTIVE' | 'INACTIVE';
  student_count: number;
  subject_count?: number;
  total_curriculum_credits?: number;
  created_at: string;
  updated_at: string;
}

export interface ClassSectionCreatePayload {
  name: string;
  department: string;
  effective_from?: string;
  year?: number;
  semester?: number;
  section: string;
  academic_year?: string;
  status: string;
  assigned_subject_ids?: string[];
}

export interface TimetableEntry {
  id: string;
  class_id: string;
  class_name?: string;
  subject_id?: string;
  subject_code?: string;
  subject_name?: string;
  is_mapped?: boolean;
  day_of_week: string;
  start_time: string;
  end_time: string;
  entry_type: 'SUBJECT' | 'ACTIVITY' | 'BREAK';
  label: string;
  batch?: string;
  room?: string;
  effective_from?: string;
  status: string;
  has_existing_session?: boolean;
  existing_session_id?: string | null;
}

