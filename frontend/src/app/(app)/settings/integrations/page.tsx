"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Integration {
  provider: string;
  name: string;
  icon: string;
  description: string;
  status: "connected" | "disconnected" | "coming_soon";
  connected_at?: string;
}

const INTEGRATIONS_META: Record<string, { icon: string; name: string; description: string }> = {
  slack: { icon: "💬", name: "Slack", description: "Send messages, manage channels, and automate workflows" },
  google: { icon: "🔵", name: "Google Workspace", description: "Gmail, Calendar, Drive, and Docs integration" },
  github: { icon: "🐙", name: "GitHub", description: "Repos, issues, PRs, and CI/CD automation" },
  notion: { icon: "📝", name: "Notion", description: "Pages, databases, and knowledge base sync" },
  jira: { icon: "🔷", name: "Jira", description: "Project tracking, sprints, issues, and team boards" },
  linear: { icon: "🟣", name: "Linear", description: "Issue tracking, cycles, and product roadmaps" },
  n8n: { icon: "⚡", name: "n8n", description: "Workflow automation and custom integrations" },
  microsoft365: { icon: "🟦", name: "Microsoft 365", description: "Outlook, Teams, OneDrive, and SharePoint" },
};

const COMING_SOON = ["microsoft365"];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    authFetch("/api/v1/integrations")
      .then((r) => r.json())
      .then((data) => {
        const connected: Record<string, Integration> = {};
        (data.integrations || []).forEach((i: Integration) => {
          connected[i.provider] = i;
        });
        const all = Object.entries(INTEGRATIONS_META).map(([key, meta]) => ({
          provider: key,
          name: meta.name,
          icon: meta.icon,
          description: meta.description,
          status: COMING_SOON.includes(key) ? "coming_soon" as const : connected[key] ? "connected" as const : "disconnected" as const,
          connected_at: connected[key]?.connected_at,
        }));
        setIntegrations(all);
        setLoading(false);
      })
      .catch(() => {
        const all = Object.entries(INTEGRATIONS_META).map(([key, meta]) => ({
          provider: key,
          name: meta.name,
          icon: meta.icon,
          description: meta.description,
          status: COMING_SOON.includes(key) ? "coming_soon" as const : "disconnected" as const,
        }));
        setIntegrations(all);
        setLoading(false);
      });
  }, []);

  const filtered = integrations.filter(
    (i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleConnect = (provider: string) => {
    window.location.href = `/api/v1/integrations/${provider}/connect`;
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm(`Disconnect ${INTEGRATIONS_META[provider]?.name}?`)) return;
    try {
      await authFetch(`/api/v1/integrations/${provider}`, { method: "DELETE" });
      setIntegrations((prev) => prev.map((i) => i.provider === provider ? { ...i, status: "disconnected" as const, connected_at: undefined } : i));
    } catch {
      setError("Failed to disconnect");
    }
  };

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">🔌 Integrations</h1>
          <p className="text-[#9ca3af] mt-1">Connect third-party services to your workspace · {connectedCount} connected</p>
        </div>
        <Link
          href="/settings/integrations/activity"
          className="mt-4 sm:mt-0 px-4 py-2 text-sm rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:border-[#3b82f6]/40 transition-colors"
        >
          📊 Activity Log
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2.5 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-sm"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((integration) => (
            <div
              key={integration.provider}
              className={`relative rounded-xl border p-6 transition-all ${
                integration.status === "coming_soon"
                  ? "bg-[#14151f]/50 border-[rgba(255,255,255,0.05)] opacity-60"
                  : "bg-[#14151f] border-[rgba(255,255,255,0.07)] hover:border-[#3b82f6]/40"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{integration.icon}</span>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    integration.status === "connected"
                      ? "bg-green-500/10 text-green-400"
                      : integration.status === "coming_soon"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"
                  }`}
                >
                  {integration.status === "connected" ? "✅ Connected" : integration.status === "coming_soon" ? "🔜 Coming Soon" : "⚪ Disconnected"}
                </span>
              </div>
              <h3 className="text-white font-semibold mb-1">{integration.name}</h3>
              <p className="text-[#9ca3af] text-sm mb-4 line-clamp-2">{integration.description}</p>
              <div className="flex gap-2">
                {integration.status === "connected" && (
                  <>
                    <Link
                      href={`/settings/integrations/${integration.provider}`}
                      className="px-3 py-1.5 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors"
                    >
                      Settings
                    </Link>
                    <button
                      onClick={() => handleDisconnect(integration.provider)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </>
                )}
                {integration.status === "disconnected" && (
                  <button
                    onClick={() => handleConnect(integration.provider)}
                    className="px-4 py-1.5 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors cursor-pointer"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
