/**
 * Vutler API Core Client
 * Typed fetch wrapper with JWT auth, 401 redirect, and error handling.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const AUTH_TOKEN_KEY = 'vutler_auth_token';

// ─── Auth utilities ───────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
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
  } else {
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
