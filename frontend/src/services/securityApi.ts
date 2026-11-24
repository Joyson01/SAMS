import { apiClient } from './api';
import { AuditLogListResponse } from '../types/security';

export interface AuditLogFilterParams {
  action?: string;
  entity_type?: string;
  user_id?: string;
  student_activity?: boolean;
  sign_in_activity?: boolean;
  page?: number;
  page_size?: number;
}

export const fetchAuditLogs = async (filters?: AuditLogFilterParams): Promise<AuditLogListResponse> => {
  const response = await apiClient.get<AuditLogListResponse>('/audit-logs', {
    params: filters,
  });
  return response.data;
};


export const fetchAuditMessage = async (eventId: string, signal: AbortSignal): Promise<string> => {
  const response = await apiClient.get<{ body: string }>(`/audit-logs/${eventId}/message`, { signal });
  return response.data.body;
};
