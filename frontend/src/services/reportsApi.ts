import { apiClient } from './api';
import { InstitutionAnalyticsResponse } from '../types/reports';

export interface AnalyticsFilterParams {
  start_date?: string;
  end_date?: string;
  department?: string;
  class_name?: string;
}

export const fetchInstitutionAnalytics = async (
  filters?: AnalyticsFilterParams
): Promise<InstitutionAnalyticsResponse> => {
  const response = await apiClient.get<InstitutionAnalyticsResponse>('/reports/analytics', {
    params: filters,
  });
  return response.data;
};

export const downloadAttendanceCsv = async (filters?: AnalyticsFilterParams): Promise<void> => {
  const response = await apiClient.get('/reports/export/csv', {
    params: filters,
    responseType: 'blob',
  });

  // Create temporary anchor link for browser download
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `attendance_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

