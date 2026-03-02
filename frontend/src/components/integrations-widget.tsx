"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";

const ICONS: Record<string, string> = { slack: "💬", google: "🔵", github: "🐙", notion: "📝", microsoft365: "🟦", n8n: "⚡" };

export default function IntegrationsWidget() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/v1/integrations")
      .then((r) => r.json())
      .then((d) => {
        setConnected((d.integrations || []).map((i: { provider: string }) => i.provider));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Link href="/settings/integrations" className="block rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-4 hover:border-[#3b82f6]/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">🔌 Integrations</h3>
        <span className="text-xs text-[#6b7280]">{loading ? "..." : `${connected.length} connected`}</span>
      </div>
      <div className="flex gap-2">
        {loading ? (
          <div className="h-8 w-24 rounded bg-[rgba(255,255,255,0.05)] animate-pulse" />
        ) : connected.length > 0 ? (
          connected.map((p) => (
            <span key={p} className="text-xl" title={p}>{ICONS[p] || "🔌"}</span>
          ))
        ) : (
          <span className="text-xs text-[#6b7280]">No integrations connected</span>
        )}
      </div>
    </Link>
  );
}
