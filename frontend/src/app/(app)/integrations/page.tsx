"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONNECTOR_META,
  getOauthConnectorConsentMeta,
  SOCIAL_PLATFORM_PROVIDERS,
  WORKSPACE_CONNECTOR_ORDER,
  getSocialPlatformMeta,
  normalizeIntegrationKey,
} from "@/lib/integrations/catalog";

interface ConnectedIntegration {
  provider: string;
  connected: boolean;
  status: string;
  connected_at?: string;
  connected_by?: string;
}

interface Provider {
  provider: string;
  name: string;
  description: string;
  category: string;
  mode: "oauth" | "device_auth" | "manage" | "coming_soon";
  icon: string;
}

const PROVIDERS: Provider[] = [
  {
    provider: "chatgpt",
    name: "ChatGPT",
    description: "Use your ChatGPT subscription to power agents with GPT-5.4, o3, and Codex.",
    category: "ai",
    mode: "device_auth",
    icon: "🤖",
  },
  {
    provider: "google",
    name: "Google Workspace",
    description: "One connector for Gmail, Calendar, Drive, and Google contacts.",
    category: "productivity",
    mode: "oauth",
    icon: "🔵",
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Manage repos, issues, and pull requests from your workspace.",
    category: "development",
    mode: "oauth",
    icon: "🐙",
  },
  {
    provider: "microsoft365",
    name: "Microsoft 365",
    description: "Outlook mail, calendar, and contacts today. Teams, OneDrive, and SharePoint stay disabled until their dedicated runtime ships.",
    category: "productivity",
    mode: "oauth",
    icon: "🟦",
  },
  {
    provider: "social_media",
    name: "Social Media",
    description: "Manage LinkedIn, X, Instagram, TikTok, and other publishing accounts from one connector.",
    category: "social-media",
    mode: "manage",
    icon: "📱",
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Channels, notifications, and messaging automations.",
    category: "communication",
    mode: "coming_soon",
    icon: "💬",
  },
  {
    provider: "telegram",
    name: "Telegram",
    description: "Telegram Bot API messaging and command flows.",
    category: "communication",
    mode: "coming_soon",
    icon: "✈️",
  },
  {
    provider: "discord",
    name: "Discord",
    description: "Community, channel, and bot interactions.",
    category: "communication",
    mode: "coming_soon",
    icon: "🎮",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Pages, databases, and team knowledge.",
    category: "knowledge",
    mode: "coming_soon",
    icon: "📝",
  },
  {
    provider: "linear",
    name: "Linear",
    description: "Issue tracking, cycles, and roadmap workflows.",
    category: "project-management",
    mode: "coming_soon",
    icon: "🟣",
  },
  {
    provider: "jira",
    name: "Jira",
    description: "Projects, tickets, and sprint operations.",
    category: "project-management",
    mode: "coming_soon",
    icon: "🔷",
  },
  {
    provider: "n8n",
    name: "n8n",
    description: "Workflow automation and custom orchestrations.",
    category: "automation",
    mode: "coming_soon",
    icon: "⚡",
  },
];

const OAUTH_PROVIDER_MAP: Record<string, string> = {
  google: "google",
  github: "github",
  microsoft365: "microsoft365",
};

const categoryColors: Record<string, string> = {
  productivity: "bg-blue-500/10 text-blue-400",
  development: "bg-purple-500/10 text-purple-400",
  communication: "bg-green-500/10 text-green-400",
  knowledge: "bg-amber-500/10 text-amber-400",
  "project-management": "bg-rose-500/10 text-rose-400",
  ai: "bg-emerald-500/10 text-emerald-400",
  "social-media": "bg-pink-500/10 text-pink-400",
  automation: "bg-cyan-500/10 text-cyan-400",
};

const providerIconBg: Record<string, string> = {
  chatgpt: "bg-[#10a37f]",
  google: "bg-blue-500",
  github: "bg-gray-700",
  microsoft365: "bg-[#2563eb]",
  social_media: "bg-pink-500",
  slack: "bg-[#4A154B]",
  telegram: "bg-[#2AABEE]",
  discord: "bg-[#5865F2]",
  notion: "bg-white",
  linear: "bg-[#5E6AD2]",
  jira: "bg-[#0052CC]",
  n8n: "bg-[#ef6c00]",
};

export default function IntegrationsPage() {
  const [connectedMap, setConnectedMap] = useState<Record<string, ConnectedIntegration>>({});
  const [connectedSocialPlatforms, setConnectedSocialPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceAuth, setDeviceAuth] = useState<{
    user_code: string;
    verification_url: string;
  } | null>(null);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [provisionPreview, setProvisionPreview] = useState<
    { id: string; name: string; role: string; current: string; proposed: string; changed: boolean }[]
  >([]);
  const [provisioning, setProvisioning] = useState(false);
  const [pendingOauthProvider, setPendingOauthProvider] = useState<Provider | null>(null);

  const fetchConnected = useCallback(async () => {
    try {
      setLoading(true);
      const [integrationResponse, socialResponse] = await Promise.all([
        authFetch("/api/v1/integrations").then((response) => response.json()).catch(() => ({ integrations: [] })),
        authFetch("/api/v1/social-media/accounts").then((response) => response.json()).catch(() => ({ data: [] })),
      ]);

      const nextMap: Record<string, ConnectedIntegration> = {};
      for (const item of integrationResponse.integrations || []) {
        const provider = normalizeIntegrationKey(item.provider);
        if (item.connected) {
          nextMap[provider] = {
            provider,
            connected: true,
            status: item.status || "connected",
            connected_at: item.connected_at,
            connected_by: item.connected_by,
          };
        }
      }

      const socialPlatforms: string[] = Array.from(
        new Set<string>(
          (Array.isArray(socialResponse.data) ? socialResponse.data : [])
            .map((account: { platform?: string }) => normalizeIntegrationKey(account.platform))
            .filter((platform: string): platform is string =>
              SOCIAL_PLATFORM_PROVIDERS.includes(platform as (typeof SOCIAL_PLATFORM_PROVIDERS)[number])
            )
        )
      );

      if (socialPlatforms.length > 0) {
        nextMap.social_media = nextMap.social_media || {
          provider: "social_media",
          connected: true,
          status: "connected",
        };
      }

      setConnectedMap(nextMap);
      setConnectedSocialPlatforms(socialPlatforms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const provider = params.get("provider");
    const oauthError = params.get("error");

    if (connected) {
      const normalized = normalizeIntegrationKey(connected);
      const name = CONNECTOR_META[normalized]?.name || getSocialPlatformMeta(normalized).name || connected;
      setSuccessMsg(`${name} connected successfully.`);
      window.history.replaceState({}, "", "/integrations");
    }

    if (oauthError) {
      const messageMap: Record<string, string> = {
        oauth_cancelled: "OAuth was cancelled.",
        oauth_invalid: "Invalid OAuth state. Please try again.",
        oauth_token_failed: "Token exchange failed. Please try again.",
        oauth_server_error: "OAuth server error. Please try again.",
      };
      setError(`${messageMap[oauthError] || "OAuth error"}${provider ? ` (${provider})` : ""}`);
      window.history.replaceState({}, "", "/integrations");
    }

    void fetchConnected();
  }, [fetchConnected]);

  const isConnected = (provider: Provider) => Boolean(connectedMap[provider.provider]);

  const getConnectedInfo = (provider: Provider) => connectedMap[provider.provider];

  const startOauthConnect = async (provider: Provider) => {
    try {
      setConnecting(provider.provider);
      setError(null);
      setSuccessMsg(null);

      const oauthProvider = OAUTH_PROVIDER_MAP[provider.provider];
      if (!oauthProvider) {
        throw new Error(`No OAuth flow configured for ${provider.name}`);
      }

      const response = await authFetch(`/api/v1/integrations/${oauthProvider}/connect`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to initiate ${provider.name} OAuth`);
      }
      const data = await response.json();
      if (!data.authUrl) {
        throw new Error("No auth URL returned from server");
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${provider.name}`);
      setConnecting(null);
    }
  };

  const handleConnect = async (provider: Provider) => {
    try {
      setError(null);
      setSuccessMsg(null);

      if (provider.mode === "manage") {
        window.location.href = "/settings/integrations/social-media";
        return;
      }

      if (provider.mode === "device_auth") {
        setConnecting(provider.provider);
        const response = await authFetch("/api/v1/integrations/chatgpt/connect", { method: "POST" });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to start ChatGPT device auth");
        }
        const data = await response.json();
        if (data.mode === "device_auth" && data.user_code) {
          setDeviceAuth({
            user_code: data.user_code,
            verification_url: data.verification_url || "https://auth.openai.com/codex/device",
          });
          void pollDeviceAuth();
        }
        return;
      }

      if (provider.mode === "oauth") {
        setPendingOauthProvider(provider);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${provider.name}`);
      setConnecting(null);
    }
  };

  const pollDeviceAuth = async () => {
    const maxAttempts = 180;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const response = await authFetch("/api/v1/integrations/chatgpt/poll", { method: "POST" });
        const data = await response.json();

        if (data.status === "connected") {
          setDeviceAuth(null);
          setConnecting(null);
          setSuccessMsg("ChatGPT connected successfully.");
          await fetchConnected();

          try {
            const previewResponse = await authFetch("/api/v1/integrations/chatgpt/provision-preview");
            if (previewResponse.ok) {
              const previewData = await previewResponse.json();
              if (previewData.agents?.length > 0) {
                setProvisionPreview(previewData.agents);
                setShowProvisionModal(true);
              }
            }
          } catch {
            // Ignore preview failures.
          }
          return;
        }

        if (!data.success && response.status === 410) {
          setDeviceAuth(null);
          setConnecting(null);
          setError("Device auth session expired. Please try again.");
          return;
        }
      } catch {
        // Keep polling through intermittent network failures.
      }
    }

    setDeviceAuth(null);
    setConnecting(null);
    setError("Device auth timed out. Please try again.");
  };

  const handleDisconnect = async (provider: Provider) => {
    if (!confirm(`Disconnect ${provider.name}?`)) return;

    try {
      setDisconnecting(provider.provider);
      setError(null);
      setSuccessMsg(null);

      if (provider.provider === "social_media") {
        await Promise.all(
          connectedSocialPlatforms.map(async (platform) => {
            const response = await authFetch(`/api/v1/social-media/accounts/platform/${platform}`, {
              method: "DELETE",
            });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw new Error(body.error || `Failed to disconnect ${getSocialPlatformMeta(platform).name}`);
            }
          })
        );
      } else {
        const oauthProvider = OAUTH_PROVIDER_MAP[provider.provider] || provider.provider;
        const response = await authFetch(`/api/v1/integrations/${oauthProvider}/disconnect`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Failed to disconnect ${provider.name}`);
        }
      }

      setSuccessMsg(`${provider.name} disconnected.`);
      await fetchConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${provider.name}`);
    } finally {
      setDisconnecting(null);
    }
  };

  const filteredProviders = PROVIDERS.filter((provider) => {
    const search = searchQuery.toLowerCase();
    return (
      provider.name.toLowerCase().includes(search) ||
      provider.description.toLowerCase().includes(search) ||
      provider.category.toLowerCase().includes(search)
    );
  }).sort((a, b) => {
    const aIndex = WORKSPACE_CONNECTOR_ORDER.indexOf(a.provider as (typeof WORKSPACE_CONNECTOR_ORDER)[number]);
    const bIndex = WORKSPACE_CONNECTOR_ORDER.indexOf(b.provider as (typeof WORKSPACE_CONNECTOR_ORDER)[number]);
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return safeA - safeB || a.name.localeCompare(b.name);
  });

  const connectedProviders = filteredProviders.filter((provider) => isConnected(provider));
  const availableProviders = filteredProviders.filter((provider) => !isConnected(provider));
  const pendingOauthConsent = pendingOauthProvider
    ? getOauthConnectorConsentMeta(pendingOauthProvider.provider)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Integrations</h1>
        <p className="text-[#9ca3af]">
          Connect workspace-level connectors. Multi-surface suites like Google Workspace and Social Media are grouped once, then managed inside their dedicated flows.
        </p>
      </div>

      {deviceAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl p-8 max-w-md w-full mx-4 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#065f46] flex items-center justify-center text-3xl">
              🤖
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Connect ChatGPT</h2>
              <p className="text-[#9ca3af] text-sm">
                Open the link below and enter this code to connect your ChatGPT account.
              </p>
            </div>
            <div className="bg-[#1f2028] border border-[rgba(255,255,255,0.1)] rounded-xl p-4">
              <p className="text-xs text-[#6b7280] mb-2">Your code</p>
              <p className="text-3xl font-mono font-bold text-white tracking-widest">{deviceAuth.user_code}</p>
            </div>
            <a
              href={deviceAuth.verification_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#10a37f] hover:bg-[#0d8a6b] text-white rounded-lg font-medium transition-colors"
            >
              Open {deviceAuth.verification_url.replace("https://", "")}
            </a>
            <div className="flex items-center gap-3 justify-center text-[#9ca3af] text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Waiting for confirmation...
            </div>
            <button
              onClick={() => {
                setDeviceAuth(null);
                setConnecting(null);
              }}
              className="text-[#6b7280] hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={!!pendingOauthProvider && !!pendingOauthConsent}
        onOpenChange={(open) => {
          if (!open) {
            setPendingOauthProvider(null);
            setConnecting(null);
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
                  You will still review and approve the final consent screen on the provider side before the workspace is connected.
                </p>
              </div>

              <DialogFooter className="mt-2 flex gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingOauthProvider(null);
                    setConnecting(null);
                  }}
                  className="rounded-lg border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm text-[#9ca3af] transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void startOauthConnect(pendingOauthProvider)}
                  disabled={connecting === pendingOauthProvider.provider}
                  className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:opacity-60"
                >
                  {connecting === pendingOauthProvider.provider ? "Redirecting..." : `Continue to ${pendingOauthProvider.name}`}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showProvisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-1">Switch agents to Codex?</h2>
              <p className="text-[#9ca3af] text-sm">
                Your ChatGPT subscription is connected. We can switch your agents to use Codex models optimized by role.
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {provisionPreview.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between px-3 py-2 bg-[#1f2028] rounded-lg text-sm">
                  <div>
                    <span className="text-white font-medium">{agent.name}</span>
                    <span className="text-[#6b7280] ml-2">({agent.role})</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#6b7280]">{agent.current}</span>
                    <span className="text-[#6b7280]">→</span>
                    <span className="text-emerald-400 font-medium">{agent.proposed}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowProvisionModal(false)}
                className="flex-1 px-4 py-2.5 border border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white rounded-lg text-sm transition-colors"
              >
                Keep current
              </button>
              <button
                onClick={async () => {
                  setProvisioning(true);
                  try {
                    const response = await authFetch("/api/v1/integrations/chatgpt/provision-agents", {
                      method: "POST",
                    });
                    const data = await response.json();
                    if (data.success) {
                      setSuccessMsg(`${data.provisioned} agent(s) switched to Codex.`);
                    }
                  } catch {
                    setError("Failed to switch agents to Codex.");
                  }
                  setProvisioning(false);
                  setShowProvisionModal(false);
                }}
                disabled={provisioning}
                className="flex-1 px-4 py-2.5 bg-[#10a37f] hover:bg-[#0d8a6b] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {provisioning ? "Switching..." : "Switch all to Codex"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {!loading && connectedProviders.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Connected ({connectedProviders.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedProviders.map((provider) => {
              const info = getConnectedInfo(provider);
              const socialBadges = provider.provider === "social_media" ? connectedSocialPlatforms : [];
              return (
                <div
                  key={provider.provider}
                  className="bg-[#0f1117] border border-green-500/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${providerIconBg[provider.provider] || "bg-gray-700"} ${
                        provider.provider === "notion" ? "!text-black" : ""
                      }`}
                    >
                      <span className="text-xl">{provider.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm">{provider.name}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Connected
                        {info?.connected_at && (
                          <span className="text-[#6b7280] ml-1">
                            · {new Date(info.connected_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#6b7280] leading-relaxed">{provider.description}</p>

                  {socialBadges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {socialBadges.map((platform) => {
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

                  {provider.provider === "social_media" ? (
                    <Link
                      href="/settings/integrations/social-media"
                      className="w-full text-center text-xs px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] text-[#9ca3af] hover:text-white hover:border-[#3b82f6]/40 transition-colors"
                    >
                      Manage accounts
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleDisconnect(provider)}
                      disabled={disconnecting === provider.provider}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {disconnecting === provider.provider ? "Disconnecting..." : "Disconnect"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-4 pr-4 py-2.5 bg-[#0f1117] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm placeholder-[#6b7280] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Available Connectors
          {availableProviders.length > 0 && (
            <span className="ml-2 text-sm font-normal text-[#6b7280]">({availableProviders.length})</span>
          )}
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="bg-[#0f1117] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 h-[160px] animate-pulse"
              />
            ))}
          </div>
        ) : availableProviders.length === 0 && searchQuery ? (
          <div className="text-center py-16 text-[#6b7280]">
            <p className="text-sm">No integrations match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableProviders.map((provider) => (
              <ProviderCard
                key={provider.provider}
                provider={provider}
                categoryColor={categoryColors[provider.category] || "bg-gray-500/10 text-gray-400"}
                iconBg={providerIconBg[provider.provider] || "bg-gray-700"}
                connecting={connecting === provider.provider}
                socialPlatforms={provider.provider === "social_media" ? connectedSocialPlatforms : []}
                onConnect={handleConnect}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface ProviderCardProps {
  provider: Provider;
  categoryColor: string;
  iconBg: string;
  connecting: boolean;
  socialPlatforms: string[];
  onConnect: (provider: Provider) => void;
}

function ProviderCard({ provider, categoryColor, iconBg, connecting, socialPlatforms, onConnect }: ProviderCardProps) {
  const categoryLabel = provider.category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <div className="bg-[#0f1117] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 flex flex-col gap-3 hover:border-[rgba(255,255,255,0.12)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${iconBg} ${
              provider.provider === "notion" ? "!text-black" : ""
            }`}
          >
            <span className="text-xl">{provider.icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium text-sm">{provider.name}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${categoryColor}`}>
              {categoryLabel}
            </span>
          </div>
        </div>

        {provider.mode === "coming_soon" && (
          <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-[#6b7280] border border-[rgba(255,255,255,0.08)]">
            Soon
          </span>
        )}
      </div>

      <p className="text-xs text-[#9ca3af] leading-relaxed">{provider.description}</p>

      {provider.provider === "social_media" && socialPlatforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
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

      {provider.mode === "coming_soon" ? (
        <div className="w-full text-xs px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.04)] text-[#6b7280] text-center cursor-not-allowed select-none">
          Coming Soon
        </div>
      ) : provider.mode === "manage" ? (
        <button
          onClick={() => onConnect(provider)}
          className="w-full text-xs px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
        >
          Manage accounts
        </button>
      ) : (
        <button
          onClick={() => onConnect(provider)}
          disabled={connecting}
          className="w-full text-xs px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white font-medium transition-colors"
        >
          {connecting ? "Redirecting..." : "Connect"}
        </button>
      )}
    </div>
  );
}
