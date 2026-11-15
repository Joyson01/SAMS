import { apiClient } from './api';
import {
  Subject,
  SubjectCreatePayload,
  ClassSection,
  ClassSectionCreatePayload,
  TimetableEntry,
} from '../types/subject';

export const fetchSubjects = async (
  department?: string,
  semester?: number,
  status?: string,
  search?: string
): Promise<Subject[]> => {
  const response = await apiClient.get<Subject[]>('/subjects', {
    params: {
      department: department || undefined,
      semester: semester || undefined,
      status: status || undefined,
      search: search || undefined,
    },
  });
  return response.data;
};

export const createSubject = async (payload: SubjectCreatePayload): Promise<Subject> => {
  const response = await apiClient.post<Subject>('/subjects', payload);
  return response.data;
};

export const updateSubject = async (
  id: string,
  payload: Partial<SubjectCreatePayload>
): Promise<Subject> => {
  const response = await apiClient.put<Subject>(`/subjects/${id}`, payload);
  return response.data;
};

export const deleteSubject = async (id: string): Promise<void> => {
  await apiClient.delete(`/subjects/${id}`);
};

export const fetchClasses = async (
  department?: string,
  semester?: number,
  status?: string
): Promise<ClassSection[]> => {
  const response = await apiClient.get<ClassSection[]>('/classes', {
    params: {
      department: department || undefined,
      semester: semester || undefined,
      status: status || undefined,
    },
  });
  return response.data;
};

export const createClass = async (payload: ClassSectionCreatePayload): Promise<ClassSection> => {
  const response = await apiClient.post<ClassSection>('/classes', payload);
  return response.data;
};

export const updateClass = async (
  id: string,
  payload: Partial<ClassSectionCreatePayload>
): Promise<ClassSection> => {
  const response = await apiClient.put<ClassSection>(`/classes/${id}`, payload);
  return response.data;
};

export const deleteClass = async (id: string): Promise<void> => {
  await apiClient.delete(`/classes/${id}`);
};

export const fetchClassTimetable = async (
  classId: string,
  dayOfWeek?: string,
  scheduledDate?: string
): Promise<TimetableEntry[]> => {
  const response = await apiClient.get<TimetableEntry[]>(`/classes/${classId}/timetable`, {
    params: {
      day_of_week: dayOfWeek || undefined,
      scheduled_date: scheduledDate || undefined,
    },
  });
  return response.data;
};

export const fetchAllTimetableEntries = async (
  classId?: string,
  dayOfWeek?: string,
  scheduledDate?: string
): Promise<TimetableEntry[]> => {
  const response = await apiClient.get<TimetableEntry[]>('/classes/timetable/entries', {
    params: {
      class_id: classId || undefined,
      day_of_week: dayOfWeek || undefined,
      scheduled_date: scheduledDate || undefined,
    },
  });
  return response.data;
};

export const updateTimetableEntry = async (
  entryId: string,
  payload: Partial<TimetableEntry>
): Promise<TimetableEntry> => {
  const response = await apiClient.put<TimetableEntry>(`/classes/timetable/entries/${entryId}`, payload);
  return response.data;
};
