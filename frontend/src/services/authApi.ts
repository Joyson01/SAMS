import { apiClient, clearAuthTokens, setAuthTokens } from './api';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in_seconds: number;
  user: AuthUser;
}

export const login = async (username_or_email: string, password: string): Promise<AuthUser> => {
  const response = await apiClient.post<AuthTokenResponse>('/auth/login', {
    username_or_email,
    password,
  });
  setAuthTokens(response.data.access_token, response.data.refresh_token);
  return response.data.user;
};

export const getCurrentUser = async (): Promise<AuthUser> => {
  const response = await apiClient.get<AuthUser>('/auth/me');
  return response.data;
};

export const logout = async (): Promise<void> => {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    clearAuthTokens();
  }
};
