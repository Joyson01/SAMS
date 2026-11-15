export interface CameraDevice {
  id: string;
  name: string;
  location: string;
  source_type: 'WEBCAM' | 'MOBILE' | 'RTSP';
  device_id?: string | null;
  stream_url?: string | null;
  status: 'CONNECTED' | 'STREAMING' | 'RECONNECTING' | 'NO_FRAME' | 'OFFLINE' | 'ERROR';
  is_active: boolean;
  target_fps: number;
  resolution: string;
  assigned_class?: string | null;
  detection_zone?: Record<string, any> | null;
  is_connected: boolean;
  fps: number;
  seconds_since_last_frame?: number | null;
  last_heartbeat?: string | null;
  last_frame_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CameraCreatePayload {
  name: string;
  location: string;
  source_type: string;
  device_id?: string | null;
  stream_url?: string | null;
  target_fps?: number;
  resolution?: string;
  assigned_class?: string | null;
  detection_zone?: Record<string, any> | null;
  is_active?: boolean;
}

export interface CameraTestResult {
  success: boolean;
  status: string;
  message: string;
  connection: boolean;
  stream: boolean;
  frames: boolean;
  detector?: boolean;
  resolution?: string | null;
  fps: number;
  latency_ms: number;
}

export interface ONVIFDiscoveredCamera {
  name: string;
  ip: string;
  port: number;
  manufacturer?: string | null;
  model?: string | null;
  rtsp_url_hint: string;
  is_reachable: boolean;
}

export interface ONVIFDiscoveryResponse {
  cameras: ONVIFDiscoveredCamera[];
  scanned_subnet: string;
  total_found: number;
}

export interface MobilePairingResponse {
  token: string;
  camera_id: string;
  camera_name: string;
  location: string;
  source_type: string;
  pairing_url: string;
  expires_at: string;
  status: string;
}
