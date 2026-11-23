import { apiClient } from './api';
import { InstitutionAnalyticsResponse } from '../types/reports';

export interface AnalyticsFilterParams {
  start_date?: string;
  end_date?: string;
  department?: string;
  class_name?: string;
  subject?: string;
}

export const fetchInstitutionAnalytics = async (
  filters?: AnalyticsFilterParams
): Promise<InstitutionAnalyticsResponse> => {
  const response = await apiClient.get<InstitutionAnalyticsResponse>('/reports/analytics', {
    params: filters,
  });
  return response.data;
};

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export const downloadAttendanceReport = async (
  format: ReportFormat,
  filters?: AnalyticsFilterParams,
): Promise<void> => {
  const response = await apiClient.get<Blob>(`/reports/export/${format}`, {
    params: filters,
    responseType: 'blob',
  });

  // Create temporary anchor link for browser download
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance_report_${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

