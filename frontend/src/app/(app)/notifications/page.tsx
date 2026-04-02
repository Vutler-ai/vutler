'use client';

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';
import { getAuthToken } from '@/lib/api/client';
import { ChatWebSocket } from '@/lib/websocket';
import {
  getWorkspaceEventDescription,
  getWorkspaceEventTitle,
  isWorkspaceAttentionEvent,
  shouldSurfaceWorkspaceEvent,
} from '@/lib/workspace-events';
import type { WorkspaceRealtimeEvent } from '@/lib/workspace-events';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  live?: boolean;
}

const typeIcons: Record<string, string> = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' };
const typeColors: Record<string, string> = { info: 'border-[#3b82f6]', warning: 'border-[#f59e0b]', error: 'border-[#ef4444]', success: 'border-[#10b981]' };

function mapWorkspaceEventToNotification(event: WorkspaceRealtimeEvent): Notification | null {
  if (!event?.type) return null;

  const runStatus = String(event.run?.status || '');
  const taskResolution = String(event.task?.last_resolution || '');
  const closureReady = event.task?.closure_ready === true;
  const attention = isWorkspaceAttentionEvent(event);

  if (!shouldSurfaceWorkspaceEvent(event)) {
    return null;
  }

  let type: Notification['type'] = 'info';
  if (runStatus === 'failed' || runStatus === 'blocked') type = 'error';
  else if (runStatus === 'awaiting_approval' || attention) type = 'warning';
  else if (taskResolution || closureReady || runStatus === 'completed') type = 'success';

  return {
    id: String(event.id || `${event.type}-${event.timestamp || Date.now()}`),
    type,
    title: getWorkspaceEventTitle(event),
    message: getWorkspaceEventDescription(event),
    read: false,
    createdAt: event.timestamp || new Date().toISOString(),
    live: true,
  };
}

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
    const target = notifications.find((notification) => notification.id === id);
    if (!target?.live) {
      await authFetch(`/api/v1/notifications/${id}/read`, { method: 'PUT' });
    }
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    await Promise.all(
      notifications
        .filter(n => !n.read && !n.live)
        .map(n => authFetch(`/api/v1/notifications/${n.id}/read`, { method: 'PUT' }))
    );
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const ws = new ChatWebSocket(token);
    const offConnected = ws.on('_connected', () => {
      ws.joinWorkspace();
    });
    const offWorkspaceEvent = ws.on('workspace:event', (event: WorkspaceRealtimeEvent) => {
      const notification = mapWorkspaceEventToNotification(event);
      if (!notification) return;
      setNotifications((current) => [notification, ...current.filter((entry) => entry.id !== notification.id)].slice(0, 50));
    });

    ws.connect();
    return () => {
      offConnected();
      offWorkspaceEvent();
      ws.leaveWorkspace();
      ws.destroy();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-4 sm:p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Notifications</h1>
            <p className="text-[#94a3b8] mt-1 text-sm sm:text-base">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="shrink-0 px-3 sm:px-4 py-2 text-sm bg-[#1e293b] hover:bg-[#334155] border border-[rgba(255,255,255,0.1)] rounded-lg transition-colors cursor-pointer">
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
              <div key={n.id} className={`p-3 sm:p-4 rounded-xl border-l-4 ${typeColors[n.type] || typeColors.info} ${n.read ? 'bg-[#0f172a] opacity-60' : 'bg-[#1e293b]'} transition-all`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl mt-0.5 shrink-0">{typeIcons[n.type] || '📌'}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base">{n.title}</h3>
                      <p className="text-sm text-[#94a3b8] mt-0.5">{n.message}</p>
                      <p className="text-xs text-[#64748b] mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] whitespace-nowrap shrink-0 cursor-pointer">
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
