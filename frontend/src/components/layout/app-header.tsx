"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Menu, LogOut } from 'lucide-react';
import { authFetch } from '@/lib/authFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

interface AppHeaderProps {
  user?: {
    name: string;
    email: string;
    initials?: string;
  };
  onMenuClick?: () => void;
  onLogout?: () => void;
}

// ─── Notification bell (inline, self-contained) ───────────────────────────────

const typeStyles: Record<string, { dot: string }> = {
  info:    { dot: 'bg-blue-400' },
  success: { dot: 'bg-emerald-400' },
  warning: { dot: 'bg-amber-400' },
  error:   { dot: 'bg-red-400' },
};

function HeaderNotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/notifications');
      const data = await res.json();
      if (data.success) setNotifications(data.notifications);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await authFetch(`/api/v1/notifications/${id}/read`, { method: 'PUT' });
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await authFetch('/api/v1/notifications/read-all', { method: 'PUT' });
    } catch {
      // silent
    }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1b2e] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f]"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-[#3b82f6] rounded-full animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-h-[420px] bg-[#0d0e1a] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.07)]">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[360px] divide-y divide-[rgba(255,255,255,0.05)]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6b7280]">
                No notifications
              </div>
            ) : (
              notifications.map((n) => {
                const style = typeStyles[n.type] || typeStyles.info;
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors duration-150 ${
                      !n.read ? 'bg-[rgba(59,130,246,0.05)]' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <span
                          className={`block w-2 h-2 rounded-full ${
                            !n.read ? style.dot : 'bg-[#374151]'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-sm truncate ${
                              !n.read ? 'font-medium text-white' : 'text-[#9ca3af]'
                            }`}
                          >
                            {n.title}
                          </p>
                          <span className="text-[10px] text-[#6b7280] flex-shrink-0">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        {n.message && (
                          <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TrialBadge ───────────────────────────────────────────────────────────────

interface TrialStatus {
  is_trial_active: boolean;
  tokens_total: number;
  tokens_used: number;
  tokens_remaining: number;
  expires_at: string | null;
  expired: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return String(n);
}

function TrialBadge() {
  const [trial, setTrial] = useState<TrialStatus | null>(null);

  const fetchTrial = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/onboarding/trial-status');
      const data = await res.json();
      if (data.success && data.data) setTrial(data.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchTrial();
    const interval = setInterval(fetchTrial, 60000);
    return () => clearInterval(interval);
  }, [fetchTrial]);

  if (!trial || !trial.is_trial_active) return null;

  if (trial.expired || trial.tokens_remaining === 0) {
    return (
      <Link
        href="/billing"
        className="rounded-full px-3 py-1 text-xs font-medium text-red-400 bg-red-900/20 border border-red-600/30 hover:bg-red-900/30 transition-colors"
      >
        <span className="hidden sm:inline">Trial expiré — </span>Upgrade
      </Link>
    );
  }

  const isWarning = trial.tokens_remaining < 10000;

  return (
    <span
      className={`rounded-full px-2 sm:px-3 py-1 text-xs font-medium ${
        isWarning
          ? 'text-amber-400 bg-amber-900/20 border border-amber-600/30'
          : 'text-[#94a3b8] bg-[#1e293b] border border-[rgba(255,255,255,0.1)]'
      }`}
    >
      <span className="hidden sm:inline">Trial: </span>{formatTokens(trial.tokens_remaining)}
      <span className="hidden sm:inline"> tokens</span>
    </span>
  );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────

export default function AppHeader({
  user,
  onMenuClick,
  onLogout,
}: AppHeaderProps) {
  const initials = user
    ? user.initials ||
      (user.name || 'U')
        .split(' ')
        .map((n: string) => n[0] || '')
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'
    : 'U';

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-[#08090f]/80 backdrop-blur-xl border-b border-[rgba(255,255,255,0.07)]">
      {/* Mobile hamburger — hidden when bottom nav is active (lg:hidden stays) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white hover:bg-[#1a1b2e] transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Spacer — pushes right-side items to the end */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        <TrialBadge />
        <HeaderNotificationBell />

        {/* User avatar */}
        {user && (
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 select-none"
            aria-label={user.name}
            title={`${user.name} — ${user.email}`}
          >
            {initials}
          </div>
        )}

        {/* Logout — text hidden on mobile */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm bg-[#1f2028] border border-[rgba(255,255,255,0.1)] rounded-lg text-white hover:bg-[#2a2c36] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  );
}
