import { getAuthToken, clearAuthToken, redirectToLogin } from './api';

export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const baseHeaders: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };
  const headers: Record<string, string> = {
    ...baseHeaders,
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearAuthToken();
    redirectToLogin();
    throw new Error('Authentication required');
  }
  return res;
}
