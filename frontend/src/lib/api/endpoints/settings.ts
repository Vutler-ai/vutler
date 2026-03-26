import { apiFetch } from '../client';
import type {
  UserProfile,
  SettingsResponse,
  UpdateSettingsPayload,
  Provider,
  ChangePasswordPayload,
  SuccessResponse,
  ApiKeyListResponse,
  ApiKeyCreateResponse,
  ApiKeyRole,
} from '../types';

export async function getMe(): Promise<UserProfile> {
  const data = await apiFetch<{ user?: UserProfile } | UserProfile>(
    '/api/v1/auth/me'
  );
  return 'user' in data && data.user ? data.user : (data as UserProfile);
}

export async function updateMe(
  payload: Partial<Pick<UserProfile, 'display_name' | 'avatar_url'>>
): Promise<UserProfile> {
  const data = await apiFetch<{ user?: UserProfile } | UserProfile>(
    '/api/v1/auth/me',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  return 'user' in data && data.user ? data.user : (data as UserProfile);
}

export async function getSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/v1/settings');
}

export async function updateSettings(
  payload: UpdateSettingsPayload
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updatePassword(
  payload: ChangePasswordPayload
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/auth/me/password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getProviders(): Promise<Provider[]> {
  const data = await apiFetch<{ providers?: Provider[] } | Provider[]>(
    '/api/v1/providers'
  );
  return Array.isArray(data) ? data : (data.providers ?? []);
}

export async function getApiKeys(): Promise<ApiKeyListResponse> {
  return apiFetch<ApiKeyListResponse>('/api/v1/settings/api-keys');
}

export async function createApiKey(
  name: string,
  role: ApiKeyRole
): Promise<ApiKeyCreateResponse> {
  return apiFetch<ApiKeyCreateResponse>('/api/v1/settings/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, role }),
  });
}

export async function revokeApiKey(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/settings/api-keys/${id}`, {
    method: 'DELETE',
  });
}
