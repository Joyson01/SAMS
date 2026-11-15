import { apiClient } from './api';
import {
  MediaAnalysisResponse,
  MediaJobResponse,
  SessionBiometricValidationResponse,
} from '../types/mediaAttendance';

export const validateSessionBiometrics = async (
  sessionId: string
): Promise<SessionBiometricValidationResponse> => {
  const response = await apiClient.get<SessionBiometricValidationResponse>(
    `/media-attendance/session-validation/${sessionId}`
  );
  return response.data;
};

export const analyzeImageAttendance = async (
  sessionId: string,
  file: File,
  threshold: number = 0.40
): Promise<MediaAnalysisResponse> => {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('file', file);
  formData.append('threshold', threshold.toString());

  const response = await apiClient.post<MediaAnalysisResponse>(
    '/media-attendance/image',
    formData
  );
  return response.data;
};

export const processVideoAttendance = async (
  sessionId: string,
  file: File,
  sampleFps: number = 2.0
): Promise<MediaJobResponse> => {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('sample_fps', sampleFps.toString());
  formData.append('sample_rate', sampleFps.toString());
  formData.append('file', file);

  const response = await apiClient.post<MediaJobResponse>(
    '/media-attendance/video',
    formData
  );
  return response.data;
};

export const fetchMediaJobs = async (
  sessionId?: string,
  limit: number = 50
): Promise<MediaJobResponse[]> => {
  const response = await apiClient.get<MediaJobResponse[]>('/media-attendance/jobs', {
    params: {
      session_id: sessionId || undefined,
      limit,
    },
  });
  return response.data;
};

export const fetchMediaJob = async (jobId: string): Promise<MediaJobResponse> => {
  const response = await apiClient.get<MediaJobResponse>(`/media-attendance/jobs/${jobId}`);
  return response.data;
};

export const fetchMediaJobResults = async (jobId: string): Promise<{ job: MediaJobResponse; summary: any }> => {
  const response = await apiClient.get<{ job: MediaJobResponse; summary: any }>(`/media-attendance/jobs/${jobId}/results`);
  return response.data;
};

export const cancelMediaJob = async (jobId: string): Promise<void> => {
  await apiClient.post(`/media-attendance/jobs/${jobId}/cancel`);
};

export const deleteMediaJob = async (jobId: string): Promise<void> => {
  await apiClient.delete(`/media-attendance/jobs/${jobId}`);
};
