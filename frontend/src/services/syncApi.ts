import { apiClient } from './api';
import { SyncQueueStatusResponse } from '../types/sync';

export const fetchSyncStatus = async (): Promise<SyncQueueStatusResponse> => {
  const response = await apiClient.get<SyncQueueStatusResponse>('/sync/status');
  return response.data;
};

export const triggerSyncFlush = async (): Promise<{ status: string; flushed_count: number }> => {
  const response = await apiClient.post('/sync/trigger');
  return response.data;
};

