"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getOauthConnectorConsentMeta,
  getSocialPlatformMeta,
  normalizeIntegrationKey,
} from "@/lib/integrations/catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Integration {
  provider: string;
  name: string;
  icon: string;
  description: string;
  status: "connected" | "disconnected" | "coming_soon";
  connected?: boolean;
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
  microsoft365: { icon: "🟦", name: "Microsoft 365", description: "Outlook mail, calendar, and contacts today. Teams, OneDrive, and SharePoint stay disabled until their own runtime is shipped." },
  chatgpt: { icon: "🤖", name: "ChatGPT", description: "Use your ChatGPT subscription to power agents with GPT-4o, o3, and Codex" },
  social_media: { icon: "📱", name: "Social Media", description: "Post to LinkedIn, X, Instagram, TikTok, and 5+ more platforms" },
};

const OAUTH_PROVIDERS = new Set(["google", "github", "microsoft365"]);

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [socialPlatforms, setSocialPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pendingOauthProvider, setPendingOauthProvider] = useState<string | null>(null);
  const [oauthRedirecting, setOauthRedirecting] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    Promise.all([
      authFetch("/api/v1/integrations").then((r) => r.json()),
      authFetch("/api/v1/social-media/accounts").then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([data, socialData]) => {
        const connected: Record<string, Integration> = {};
        (data.integrations || []).forEach((i: Integration) => {
          connected[i.provider] = i;
        });
        const all = Object.entries(INTEGRATIONS_META).map(([key, meta]) => ({
          provider: key,
          name: meta.name,
          icon: meta.icon,
          description: meta.description,
          status: connected[key]?.connected ? "connected" as const : "disconnected" as const,
          connected_at: connected[key]?.connected_at,
        }));
        setIntegrations(all);
        setSocialPlatforms(Array.from(new Set(
          (Array.isArray(socialData?.data) ? socialData.data : [])
            .map((account: { platform?: string }) => normalizeIntegrationKey(account?.platform))
            .filter(Boolean)
        )));
        setLoading(false);
      })
      .catch(() => {
        const all = Object.entries(INTEGRATIONS_META).map(([key, meta]) => ({
          provider: key,
          name: meta.name,
          icon: meta.icon,
          description: meta.description,
          status: "disconnected" as const,
        }));
        setIntegrations(all);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const provider = searchParams.get("provider");
    const queryError = searchParams.get("error");

    if (connected) {
      setError("");
      setIntegrations((prev) => prev.map((integration) => (
        integration.provider === connected
          ? { ...integration, status: "connected" as const, connected_at: new Date().toISOString() }
          : integration
      )));
      return;
    }

    if (queryError) {
      const scopedProvider = provider ? `${INTEGRATIONS_META[provider]?.name || provider}: ` : "";
      const messageMap: Record<string, string> = {
        oauth_cancelled: "OAuth flow was cancelled.",
        oauth_invalid: "OAuth callback validation failed.",
        oauth_token_failed: "Token exchange failed.",
        oauth_server_error: "OAuth server error.",
      };
      setError(`${scopedProvider}${messageMap[queryError] || "Integration connection failed."}`);
    }
  }, [searchParams]);

  const filtered = integrations.filter(
    (i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase())
  );

  const startOauthConnect = async (provider: string) => {
    try {
      setOauthRedirecting(true);
      setError("");
      const r = await authFetch(`/api/v1/integrations/${provider}/connect`);
      const data = await r.json();
      if (!r.ok || !data?.authUrl) {
        throw new Error(data?.error || "OAuth init failed");
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setOauthRedirecting(false);
      setPendingOauthProvider(null);
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleConnect = async (provider: string) => {
    try {
      setError("");
      if (OAUTH_PROVIDERS.has(provider)) {
        setPendingOauthProvider(provider);
        return;
      }

      const r = await authFetch(`/api/v1/integrations/${provider}/connect`, { method: "POST" });
      if (!r.ok) throw new Error("Connect failed");
      setIntegrations((prev) => prev.map((i) => i.provider === provider ? { ...i, status: "connected" as const, connected_at: new Date().toISOString() } : i));
    } catch {
      setError("Failed to connect");
    }
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
  const pendingOauthConsent = pendingOauthProvider ? getOauthConnectorConsentMeta(pendingOauthProvider) : null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">🔌 Integrations</h1>
          <p className="text-[#9ca3af] mt-1">Workspace connectors · {connectedCount} connected</p>
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

      <Dialog
        open={!!pendingOauthProvider && !!pendingOauthConsent}
        onOpenChange={(open) => {
          if (!open) {
            setPendingOauthProvider(null);
            setOauthRedirecting(false);
          }
        }}
      >
        <DialogContent className="border border-[rgba(255,255,255,0.1)] bg-[#14151f] text-white sm:max-w-xl">
          {pendingOauthProvider && pendingOauthConsent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <span className="text-2xl">{pendingOauthConsent.icon}</span>
                  Connect {pendingOauthConsent.name}
                </DialogTitle>
                <DialogDescription className="text-[#9ca3af]">
                  Review the access Vutler will request before we redirect you to {pendingOauthConsent.name}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0f1117] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">Connector model</p>
                    <span className="rounded-full bg-[#3b82f6]/10 px-2.5 py-1 text-xs font-medium text-[#60a5fa]">
                      {pendingOauthConsent.accessModelLabel}
                    </span>
                  </div>
                  <p className="text-sm text-[#9ca3af]">{pendingOauthConsent.accessModelDescription}</p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-white">Requested capabilities</p>
                  <div className="flex flex-wrap gap-2">
                    {pendingOauthConsent.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs text-[#d1d5db]"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-white">Expected scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {pendingOauthConsent.scopes.map((scope) => (
                      <code
                        key={scope}
                        className="rounded-full border border-[rgba(59,130,246,0.2)] bg-[#3b82f6]/10 px-2.5 py-1 text-xs text-[#93c5fd]"
                      >
                        {scope}
                      </code>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-[#6b7280]">
                  You will still approve the final consent screen on the provider side before the workspace is connected.
                </p>
              </div>

              <DialogFooter className="mt-2 flex gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingOauthProvider(null);
                    setOauthRedirecting(false);
                  }}
                  className="rounded-lg border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm text-[#9ca3af] transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void startOauthConnect(pendingOauthProvider)}
                  disabled={oauthRedirecting}
                  className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-60"
                >
                  {oauthRedirecting ? "Redirecting..." : `Continue to ${pendingOauthConsent.name}`}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                "bg-[#14151f] border-[rgba(255,255,255,0.07)] hover:border-[#3b82f6]/40"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-3xl">{integration.icon}</span>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    integration.status === "connected"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"
                  }`}
                >
                  {integration.status === "connected" ? "✅ Connected" : "⚪ Disconnected"}
                </span>
              </div>
              <h3 className="text-white font-semibold mb-1">{integration.name}</h3>
              <p className="text-[#9ca3af] text-sm mb-4 line-clamp-2">{integration.description}</p>
              {integration.provider === "social_media" && socialPlatforms.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {socialPlatforms.map((platform) => {
                    const meta = getSocialPlatformMeta(platform);
                    return (
                      <span
                        key={platform}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.05)] text-[#9ca3af]"
                      >
                        <span>{meta.icon}</span>
                        {meta.name}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                {integration.status === "connected" && (
                  <>
                    <Link
                      href={integration.provider === "social_media" ? "/settings/integrations/social-media" : `/settings/integrations/${integration.provider}`}
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
                {integration.status === "disconnected" && integration.provider === "social_media" && (
                  <Link
                    href="/settings/integrations/social-media"
                    className="px-4 py-1.5 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
                  >
                    Configure
                  </Link>
                )}
                {integration.status === "disconnected" && integration.provider !== "social_media" && (
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
