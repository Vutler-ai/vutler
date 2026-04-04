"use client";

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  isSubscribed,
} from '@/lib/push-notifications';

export default function PushPermission() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!isPushSupported()) return;
      if (getPushPermission() !== 'default') return;
      if (await isSubscribed()) return;

      // Don't show if dismissed within last 3 days
      const dismissed = localStorage.getItem('push-permission-dismissed');
      if (dismissed && Date.now() - parseInt(dismissed, 10) < 3 * 24 * 60 * 60 * 1000) return;

      // Delay showing to not overwhelm on first load
      setTimeout(() => setShow(true), 10000);
    };
    check();
  }, []);

  const handleAllow = async () => {
    await subscribeToPush();
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('push-permission-dismissed', String(Date.now()));
  };

  if (!show) return null;

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)+1rem)] left-4 right-4 lg:top-6 lg:left-auto lg:right-6 lg:w-80 z-[55] animate-in slide-in-from-top-4 duration-300">
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-[#3b82f6]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Stay updated</p>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Get notified about new messages, task assignments, and agent alerts.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-[#6b7280] hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 px-3 py-2 text-sm text-[#9ca3af] bg-[#1e1f2e] rounded-lg hover:bg-[#2a2c36] transition-colors"
          >
            Later
          </button>
          <button
            onClick={handleAllow}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#3b82f6] rounded-lg hover:bg-[#2563eb] transition-colors"
          >
            Enable notifications
          </button>
        </div>
      </div>
    </div>
  );
}
