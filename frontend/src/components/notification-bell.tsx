"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

const typeStyles: Record<string, { dot: string; icon: string }> = {
  info: { dot: 'bg-blue-400', icon: 'ℹ️' },
  success: { dot: 'bg-emerald-400', icon: '✅' },
  warning: { dot: 'bg-amber-400', icon: '⚠️' },
  error: { dot: 'bg-red-400', icon: '❌' },
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/notifications');
      const data = await res.json();
      if (data.success) setNotifications(data.notifications);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await authFetch(`/api/v1/notifications/${id}/read`, { method: 'PUT' }); } catch {}
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try { await authFetch('/api/v1/notifications/read-all', { method: 'PUT' }); } catch {}
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
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <div className="absolute right-0 mt-2 w-80 max-h-[420px] bg-[#0d0e1a] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
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

          {/* List */}
          <div className="overflow-y-auto max-h-[360px] divide-y divide-[rgba(255,255,255,0.05)]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6b7280]">
                No notifications
              </div>
            ) : (
              notifications.map(n => {
                const style = typeStyles[n.type] || typeStyles.info;
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors duration-150 ${!n.read ? 'bg-[rgba(59,130,246,0.05)]' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <span className={`block w-2 h-2 rounded-full ${!n.read ? style.dot : 'bg-[#374151]'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${!n.read ? 'font-medium text-white' : 'text-[#9ca3af]'}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-[#6b7280] flex-shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        {n.message && (
                          <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">{n.message}</p>
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
