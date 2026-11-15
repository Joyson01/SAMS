export interface SyncQueueStatusResponse {
  is_online: boolean;
  pending_count: number;
  synced_count: number;
  conflict_count: number;
  failed_count: number;
  last_synced_at?: string | null;
}

