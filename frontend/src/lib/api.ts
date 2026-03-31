/**
 * @deprecated Import from '@/lib/api/index' instead.
 * This file is a backward-compatibility shim.
 */

export {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  syncAuthSessionCookie,
  syncWorkspaceFeaturesCookie,
  clearWorkspaceFeaturesCookie,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  syncAdminSessionCookie,
  isAuthenticated,
  redirectToLogin,
  AUTH_TOKEN_KEY,
  ADMIN_TOKEN_KEY,
} from './api/client';

export type {
  Agent,
  DashboardStats,
  DashboardData,
  HealthStatus,
  CreateAgentPayload,
  ApiError,
  LoginPayload,
  AuthResponse,
} from './api/types';

import { apiFetch, setAuthToken, clearAuthToken } from './api/client';
import type { LoginPayload, AuthResponse } from './api/types';

// ─── Legacy VutlerApiClient singleton ────────────────────────────────────────

class VutlerApiClient {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await apiFetch<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(response.token);
    return response;
  }

  async logout(): Promise<{ success: boolean }> {
    clearAuthToken();
    return apiFetch<{ success: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    });
  }
}

export const api = new VutlerApiClient();
export { VutlerApiClient };
