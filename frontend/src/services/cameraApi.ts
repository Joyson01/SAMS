import { apiClient } from './api';
import { CameraCreatePayload, CameraDevice, CameraTestResult } from '../types/camera';

export const fetchCameras = async (location?: string, assigned_class?: string): Promise<CameraDevice[]> => {
  const response = await apiClient.get<CameraDevice[]>('/cameras', {
    params: {
      location: location || undefined,
      assigned_class: assigned_class || undefined,
    },
  });
  return response.data;
};

export const createCamera = async (payload: CameraCreatePayload): Promise<CameraDevice> => {
  const response = await apiClient.post<CameraDevice>('/cameras', payload);
  return response.data;
};

export const updateCamera = async (cameraId: string, payload: Partial<CameraCreatePayload>): Promise<CameraDevice> => {
  const response = await apiClient.put<CameraDevice>(`/cameras/${cameraId}`, payload);
  return response.data;
};

export const deleteCamera = async (cameraId: string): Promise<void> => {
  await apiClient.delete(`/cameras/${cameraId}`);
};

export const testRegisteredCamera = async (cameraId: string): Promise<CameraTestResult> => {
  const response = await apiClient.post<CameraTestResult>(`/cameras/${cameraId}/test`);
  return response.data;
};

export const testCameraConnection = async (streamUrl?: string, deviceId?: string): Promise<CameraTestResult> => {
  const response = await apiClient.post<CameraTestResult>('/cameras/test-connection', {
    stream_url: streamUrl,
    device_id: deviceId,
  });
  return response.data;
};

export const startCameraWorker = async (cameraId: string): Promise<void> => {
  await apiClient.post(`/cameras/${cameraId}/start`);
};

export const stopCameraWorker = async (cameraId: string): Promise<void> => {
  await apiClient.post(`/cameras/${cameraId}/stop`);
};

export const discoverONVIFCameras = async (timeoutSec = 1.5): Promise<any> => {
  const response = await apiClient.get('/cameras/discover-onvif', {
    params: { timeout: timeoutSec },
  });
  return response.data;
};

export const captureCameraFrame = async (
  cameraId: string
): Promise<{ success: boolean; camera_id: string; camera_name: string; frame_url: string; width: number; height: number; timestamp: string }> => {
  const response = await apiClient.post(`/cameras/${cameraId}/capture`);
  return response.data;
};

export const revokeMobilePairing = async (cameraId: string): Promise<void> => {
  await apiClient.post(`/cameras/${cameraId}/revoke-pairing`);
};

