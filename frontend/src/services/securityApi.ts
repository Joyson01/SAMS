import { apiClient } from './api';
import { AuditLogListResponse } from '../types/security';

export interface AuditLogFilterParams {
  action?: string;
  entity_type?: string;
  user_id?: string;
  page?: number;
  page_size?: number;
}

export const fetchAuditLogs = async (filters?: AuditLogFilterParams): Promise<AuditLogListResponse> => {
  const response = await apiClient.get<AuditLogListResponse>('/audit-logs', {
    params: filters,
  });
  return response.data;
};

