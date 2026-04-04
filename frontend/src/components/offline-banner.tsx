"use client";

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-600 text-white text-center pt-[calc(env(safe-area-inset-top,0px)+0.375rem)] pb-1.5 px-4 text-sm font-medium flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      <span>You&apos;re offline — changes will sync when reconnected</span>
    </div>
  );
}
