import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ServiceHealthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const ACCESS_TOKEN_KEY = 'sams_access_token';
const REFRESH_TOKEN_KEY = 'sams_refresh_token';

export const setAuthTokens = (accessToken: string, refreshToken: string): void => {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearAuthTokens = (): void => {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const getAccessToken = (): string | null => sessionStorage.getItem(ACCESS_TOKEN_KEY);

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type'] && config.data && typeof config.data === 'object') {
    config.headers['Content-Type'] = 'application/json';
  }

  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _authRetry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._authRetry ||
        original.url?.includes('/auth/login') || original.url?.includes('/auth/refresh') ||
        original.url?.includes('/auth/logout')) {
      return Promise.reject(error);
    }

    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearAuthTokens();
      return Promise.reject(error);
    }

    original._authRetry = true;
    if (!refreshInFlight) {
      refreshInFlight = axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 30000 })
        .then((response) => {
          const { access_token, refresh_token } = response.data;
          setAuthTokens(access_token, refresh_token);
          return access_token as string;
        })
        .catch(() => {
          clearAuthTokens();
          return null;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }

    const newAccessToken = await refreshInFlight;
    if (!newAccessToken) return Promise.reject(error);
    original.headers.Authorization = `Bearer ${newAccessToken}`;
    return apiClient(original);
  },
);

export const fetchHealthStatus = async (): Promise<ServiceHealthResponse> => {
  const response = await apiClient.get<ServiceHealthResponse>('/health');
  return response.data;
};
