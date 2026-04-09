/**
 * Vutler API Core Client
 * Typed fetch wrapper with JWT auth, 401 redirect, and error handling.
 */

import {
  ADMIN_TOKEN_KEY,
  AUTH_TOKEN_KEY,
} from '@/lib/auth/session';

export { ADMIN_TOKEN_KEY, AUTH_TOKEN_KEY };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const SESSION_SYNC_PATH = '/internal/session';
const SESSION_FEATURES_SYNC_PATH = '/internal/session/features';
const ADMIN_SESSION_SYNC_PATH = '/internal/admin-session';
const JWT_EXPIRY_SKEW_MS = 5_000;

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

function isStoredJwtUsable(token: string | null): token is string {
  if (!token) return false;

  const [, payload] = token.split('.');
  if (!payload) return false;

  const decoded = decodeBase64Url(payload);
  if (!decoded) return false;

  try {
    const parsed = JSON.parse(decoded) as { exp?: number };
    if (typeof parsed.exp !== 'number') return false;
    return parsed.exp * 1000 > Date.now() + JWT_EXPIRY_SKEW_MS;
  } catch {
    return false;
  }
}

function getStoredJwtToken(storageKey: string): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(storageKey);
  if (isStoredJwtUsable(token)) {
    return token;
  }

  if (token) {
    localStorage.removeItem(storageKey);
  }

  return null;
}

// ─── Auth utilities ───────────────────────────────────────────────────────────

async function syncSessionCookie(path: string, method: 'POST' | 'DELETE', payload?: Record<string, unknown>): Promise<void> {
  if (typeof window === 'undefined') return;

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to sync session cookie: ${response.status}`);
  }
}

function clearServerSessionCookies(): void {
  if (typeof window === 'undefined') return;

  void fetch(SESSION_SYNC_PATH, { method: 'DELETE', credentials: 'include' }).catch(() => {});
  void fetch(SESSION_FEATURES_SYNC_PATH, { method: 'DELETE', credentials: 'include' }).catch(() => {});
  void fetch(ADMIN_SESSION_SYNC_PATH, { method: 'DELETE', credentials: 'include' }).catch(() => {});
}

export function getAuthToken(): string | null {
  return getStoredJwtToken(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  clearServerSessionCookies();
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  window.location.href = '/login';
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

/**
 * Typed JSON fetch with Bearer auth.
 * On 401: clears token and redirects to /login.
 * Returns parsed JSON of type T.
 */
export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;

  const baseHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const headers: Record<string, string> = {
    ...baseHeaders,
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (!endpoint.startsWith('/api/v1/auth/login') && !endpoint.startsWith('/api/v1/auth/register')) {
    console.warn(`[apiFetch] No auth token found (key: "${AUTH_TOKEN_KEY}") for request: ${endpoint}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Network error'
    );
  }

  if (response.status === 401) {
    clearAuthToken();
    redirectToLogin();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: 'Request failed',
      statusCode: response.status,
    }));
    throw new Error(
      errorBody.message || errorBody.error || `HTTP ${response.status}`
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Raw fetch with Bearer auth — returns the Response object (useful for blobs,
 * streams, and cases where the caller needs status codes).
 */
// ─── Admin API helpers ───────────────────────────────────────────────────────

export function getAdminToken(): string | null {
  return getStoredJwtToken(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  void fetch(ADMIN_SESSION_SYNC_PATH, { method: 'DELETE', credentials: 'include' }).catch(() => {});
}

export async function syncAuthSessionCookie(token: string): Promise<void> {
  await syncSessionCookie(SESSION_SYNC_PATH, 'POST', { token });
}

export async function syncWorkspaceFeaturesCookie(token?: string): Promise<void> {
  await syncSessionCookie(SESSION_FEATURES_SYNC_PATH, 'POST', token ? { token } : undefined);
}

export async function clearWorkspaceFeaturesCookie(): Promise<void> {
  await syncSessionCookie(SESSION_FEATURES_SYNC_PATH, 'DELETE');
}

export async function syncAdminSessionCookie(token: string): Promise<void> {
  await syncSessionCookie(ADMIN_SESSION_SYNC_PATH, 'POST', { token });
}

/**
 * Typed JSON fetch for admin endpoints (uses X-Admin-Token header).
 */
interface AdminFetchOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | string | null;
}

export async function adminFetch<T>(
  endpoint: string,
  options?: AdminFetchOptions
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const adminToken = getAdminToken();
  const authToken = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (adminToken) {
    headers['X-Admin-Token'] = adminToken;
  } else if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const { body: rawBody, ...restOptions } = options || {};
  const buildFetchOptions = (requestHeaders: Record<string, string>): RequestInit => {
    const fetchOptions: RequestInit = { ...restOptions, headers: requestHeaders };
    if (rawBody && typeof rawBody !== 'string') {
      fetchOptions.body = JSON.stringify(rawBody);
    } else if (rawBody) {
      fetchOptions.body = rawBody;
    }
    return fetchOptions;
  };

  const performFetch = async (requestHeaders: Record<string, string>): Promise<Response> => {
    try {
      return await fetch(url, buildFetchOptions(requestHeaders));
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Network error');
    }
  };

  let response = await performFetch(headers);

  if (response.status === 401 && adminToken && authToken) {
    clearAdminToken();
    const fallbackHeaders = {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${authToken}`,
    };
    response = await performFetch(fallbackHeaders);
  }

  if (response.status === 401) {
    if (adminToken) {
      clearAdminToken();
    }
    throw new Error('Admin authentication required');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

// ─── Raw fetch ───────────────────────────────────────────────────────────────

export async function authFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const token = getAuthToken();
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;
  const baseHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };
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
