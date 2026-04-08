'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  apiFetch,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  syncAuthSessionCookie,
  syncWorkspaceFeaturesCookie,
} from '@/lib/api/client';
import type { UserProfile, AuthResponse, LoginPayload } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch<{ user?: UserProfile } | UserProfile>('/api/v1/auth/me');
      const profile = 'id' in response ? response : (response.user ?? null);
      if (!profile) {
        throw new Error('Missing user profile');
      }
      setUser(profile);
    } catch {
      // Token invalid or expired
      clearAuthToken();
      setUser(null);
    }
  }, []);

  // On mount: check token and hydrate user
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetchMe()
      .then(() => Promise.allSettled([
        syncAuthSessionCookie(token),
        syncWorkspaceFeaturesCookie(token),
      ]))
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const payload: LoginPayload = { email, password };
    const response = await apiFetch<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(response.token);
    await syncAuthSessionCookie(response.token);
    await syncWorkspaceFeaturesCookie(response.token);
    // Hydrate user from response or fetch /me
    if (response.user) {
      setUser({
        id: response.user.id,
        email: response.user.email,
        display_name: response.user.name,
        avatar_url: null,
        role: response.user.role,
      });
    } else {
      await fetchMe();
    }
  }, [fetchMe]);

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> => {
    const payload: RegisterPayload = { email, password, displayName };
    await apiFetch<{ success: boolean } | AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Registration does not log in automatically — caller redirects to /login
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch<{ success: boolean }>('/api/v1/auth/logout', {
        method: 'POST',
      });
    } catch {
      // best effort
    } finally {
      clearAuthToken();
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = getAuthToken();
    if (!token) return;
    await Promise.allSettled([
      syncAuthSessionCookie(token),
      syncWorkspaceFeaturesCookie(token),
    ]);
    await fetchMe();
  }, [fetchMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
