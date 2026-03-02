'use client';

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeIcons: Record<string, string> = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' };
const typeColors: Record<string, string> = { info: 'border-[#3b82f6]', warning: 'border-[#f59e0b]', error: 'border-[#ef4444]', success: 'border-[#10b981]' };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/v1/notifications').then(r => r.json()).then(data => {
      setNotifications(data.notifications || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const markRead = async (id: string) => {
    await authFetch(`/api/v1/notifications/${id}/read`, { method: 'PUT' });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    await Promise.all(notifications.filter(n => !n.read).map(n => authFetch(`/api/v1/notifications/${n.id}/read`, { method: 'PUT' })));
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-[#94a3b8] mt-1">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="px-4 py-2 text-sm bg-[#1e293b] hover:bg-[#334155] border border-[rgba(255,255,255,0.1)] rounded-lg transition-colors cursor-pointer">
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 text-[#64748b]">
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-lg">No notifications yet</p>
            <p className="text-sm mt-1">You&apos;ll be notified about agent errors, deployment changes, and more.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => (
              <div key={n.id} className={`p-4 rounded-xl border-l-4 ${typeColors[n.type] || typeColors.info} ${n.read ? 'bg-[#0f172a] opacity-60' : 'bg-[#1e293b]'} transition-all`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{typeIcons[n.type] || '📌'}</span>
                    <div>
                      <h3 className="font-semibold">{n.title}</h3>
                      <p className="text-sm text-[#94a3b8] mt-0.5">{n.message}</p>
                      <p className="text-xs text-[#64748b] mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] whitespace-nowrap cursor-pointer">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
