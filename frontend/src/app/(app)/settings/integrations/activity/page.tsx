"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";

interface WebhookEvent {
  id: string;
  timestamp: string;
  provider: string;
  event_type: string;
  status: "success" | "error" | "pending";
  details?: string;
}

const PROVIDERS = ["all", "slack", "google", "github", "notion", "jira", "linear", "n8n"];
const PROVIDER_ICONS: Record<string, string> = {
  slack: "💬", google: "🔵", github: "🐙", notion: "📝", jira: "🔷", linear: "🟣", n8n: "⚡",
};

export default function IntegrationActivityPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (filter !== "all") params.set("provider", filter);
    authFetch(`/api/v1/webhooks/events?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setTotalPages(data.total_pages || 1);
        setLoading(false);
      })
      .catch(() => {
        setEvents([]);
        setLoading(false);
      });
  }, [filter, page]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/settings/integrations" className="text-[#3b82f6] text-sm hover:underline">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Integration Activity</h1>
          <p className="text-[#9ca3af] mt-1">Recent webhook events and API calls</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {PROVIDERS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setLoading(true);
              setFilter(p);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer ${
              filter === p ? "bg-[#3b82f6] text-white" : "bg-[#14151f] text-[#9ca3af] hover:text-white border border-[rgba(255,255,255,0.07)]"
            }`}
          >
            {p === "all" ? "All" : `${PROVIDER_ICONS[p] || ""} ${p}`}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.07)]">
                <th className="text-left p-4 text-[#6b7280] font-medium">Timestamp</th>
                <th className="text-left p-4 text-[#6b7280] font-medium">Provider</th>
                <th className="text-left p-4 text-[#6b7280] font-medium">Event Type</th>
                <th className="text-left p-4 text-[#6b7280] font-medium">Status</th>
                <th className="text-left p-4 text-[#6b7280] font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.04)]">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="p-4"><div className="h-4 bg-[rgba(255,255,255,0.05)] rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#6b7280]">No events found</td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="p-4 text-[#9ca3af] whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="p-4 text-white">{PROVIDER_ICONS[e.provider] || "🔌"} {e.provider}</td>
                    <td className="p-4 text-white font-mono text-xs">{e.event_type}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.status === "success" ? "bg-green-500/10 text-green-400" :
                        e.status === "error" ? "bg-red-500/10 text-red-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="p-4 text-[#9ca3af] max-w-xs truncate">{e.details || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-[rgba(255,255,255,0.07)]">
            <button
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg bg-[rgba(255,255,255,0.05)] text-[#9ca3af] hover:text-white disabled:opacity-40 cursor-pointer"
            >
              ← Previous
            </button>
            <span className="text-[#6b7280] text-sm">Page {page} of {totalPages}</span>
            <button
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg bg-[rgba(255,255,255,0.05)] text-[#9ca3af] hover:text-white disabled:opacity-40 cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
