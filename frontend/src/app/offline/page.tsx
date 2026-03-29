'use client';

import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#08090f] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center mb-6">
          <WifiOff className="w-8 h-8 text-[#6b7280]" />
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">You&apos;re offline</h1>
        <p className="text-[#6b7280] text-sm mb-6">
          Check your internet connection and try again. Your pending actions will sync automatically when you&apos;re back online.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-[#3b82f6] text-white text-sm font-medium rounded-lg hover:bg-[#2563eb] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
