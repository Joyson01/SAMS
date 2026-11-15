import { apiClient } from './api';
import { DashboardSummaryResponse } from '../types/dashboard';

export const fetchDashboardSummary = async (): Promise<DashboardSummaryResponse> => {
  const response = await apiClient.get<DashboardSummaryResponse>('/dashboard/summary');
  return response.data;
};
