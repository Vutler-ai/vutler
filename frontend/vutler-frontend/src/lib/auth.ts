/**
 * Authentication utilities for Vutler frontend
 */

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
  name?: string;
  authToken: string;
}

export interface AuthResponse {
  success: boolean;
  userId?: string;
  authToken?: string;
  username?: string;
  email?: string;
  name?: string;
  message?: string;
}

/**
 * Get stored auth token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken');
}

/**
 * Get stored user ID
 */
export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('userId');
}

/**
 * Get current authenticated user data
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const authToken = getAuthToken();
  const userId = getUserId();
  const username = localStorage.getItem('username');
  const email = localStorage.getItem('email');
  const name = localStorage.getItem('name');

  if (!authToken || !userId) return null;

  return {
    userId,
    username: username || '',
    email: email || '',
    name: name || '',
    authToken,
  };
}

/**
 * Store authentication data
 */
export function setAuthData(data: AuthResponse): void {
  if (typeof window === 'undefined') return;

  if (data.authToken) localStorage.setItem('authToken', data.authToken);
  if (data.userId) localStorage.setItem('userId', data.userId);
  if (data.username) localStorage.setItem('username', data.username);
  if (data.email) localStorage.setItem('email', data.email);
  if (data.name) localStorage.setItem('name', data.name);
}

/**
 * Clear authentication data (logout)
 */
export function clearAuthData(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('authToken');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('email');
  localStorage.removeItem('name');
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Verify current session with server
 */
export async function verifySession(): Promise<boolean> {
  const authToken = getAuthToken();
  const userId = getUserId();

  if (!authToken || !userId) return false;

  try {
    const response = await fetch('/api/v1/auth/me', {
      headers: {
        'X-Auth-Token': authToken,
        'X-User-Id': userId,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Session verification failed:', error);
    return false;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  const authToken = getAuthToken();
  const userId = getUserId();

  // Call logout endpoint if we have credentials
  if (authToken && userId) {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'X-Auth-Token': authToken,
          'X-User-Id': userId,
        },
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
  }

  // Clear local data regardless of API call result
  clearAuthData();

  // Redirect to login
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

/**
 * Create authenticated fetch headers
 */
export function getAuthHeaders(): HeadersInit {
  const authToken = getAuthToken();
  const userId = getUserId();

  if (!authToken || !userId) return {};

  return {
    'X-Auth-Token': authToken,
    'X-User-Id': userId,
  };
}

/**
 * Authenticated fetch wrapper
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If unauthorized, redirect to login
  if (response.status === 401) {
    clearAuthData();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  return response;
}
