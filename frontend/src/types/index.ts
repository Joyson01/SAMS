export interface DatabaseHealth {
  status: 'connected' | 'degraded' | 'disconnected';
  db_type: string;
  latency_ms: number;
  error?: string | null;
}

export interface ServiceHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service_name: string;
  version: string;
  environment: string;
  timestamp: string;
  database: DatabaseHealth;
  system_info: {
    python_version?: string;
    os?: string;
    platform?: string;
    debug?: boolean;
  };
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: string | number;
  href?: string;
}

