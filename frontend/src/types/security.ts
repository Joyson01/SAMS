export interface AuditLogEntry {
  id: string;
  user_id?: string | null;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  total_count: number;
  page: number;
  page_size: number;
  items: AuditLogEntry[];
}

