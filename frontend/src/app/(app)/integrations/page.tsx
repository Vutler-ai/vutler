"use client";

import React, { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectedIntegration {
  provider: string;
  connected: boolean;
  status: string;
  connected_at?: string;
  connected_by?: string;
  source?: string;
}

interface Provider {
  provider: string;
  name: string;
  description: string;
  category: string;
  oauthReady: boolean;
  comingSoon?: boolean;
  icon: React.ReactNode;
}

// ─── Provider catalog ─────────────────────────────────────────────────────────

function GoogleCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V8h14v11zm-7-9H9v4h3v-4z" />
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5H7.71zm9.72 0h-6.86l6.56 11.5h6.86L17.43 3.5zM12 13.5L8.57 19.5h6.86L12 13.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M5.04 15.12a2.4 2.4 0 01-2.4 2.4A2.4 2.4 0 010 15.12a2.4 2.4 0 012.4-2.4h2.64v2.4zm1.32 0a2.4 2.4 0 012.4-2.4 2.4 2.4 0 012.4 2.4v6a2.4 2.4 0 01-2.4 2.4 2.4 2.4 0 01-2.4-2.4v-6zM8.76 5.04a2.4 2.4 0 01-2.4-2.4A2.4 2.4 0 018.76 0a2.4 2.4 0 012.4 2.4v2.64H8.76zm0 1.32a2.4 2.4 0 012.4 2.4 2.4 2.4 0 01-2.4 2.4H2.76a2.4 2.4 0 01-2.4-2.4 2.4 2.4 0 012.4-2.4h6zm9.96 2.4a2.4 2.4 0 012.4-2.4A2.4 2.4 0 0124 8.76a2.4 2.4 0 01-2.4 2.4h-2.88V8.76zm-1.2 0a2.4 2.4 0 01-2.4 2.4 2.4 2.4 0 01-2.4-2.4V2.76a2.4 2.4 0 012.4-2.4 2.4 2.4 0 012.4 2.4v6zm-2.4 9.72a2.4 2.4 0 012.4 2.4A2.4 2.4 0 0115.12 24a2.4 2.4 0 01-2.4-2.4v-2.88h2.4zm0-1.2a2.4 2.4 0 01-2.4-2.4 2.4 2.4 0 012.4-2.4h6a2.4 2.4 0 012.4 2.4 2.4 2.4 0 01-2.4 2.4h-6z" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.081.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z" />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M3.5 12.5L12 4 20.5 12.5 12 21 3.5 12.5zm0 0L12 4M3.5 12.5l5-5m-5 5l5 5M20.5 12.5l-5-5m5 5l-5 5" />
    </svg>
  );
}

function JiraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.068A5.22 5.22 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.757a5.217 5.217 0 005.232 5.214h2.13V13.04a5.22 5.22 0 005.213 5.215V6.762a1.005 1.005 0 00-1.038-1.005zM23.017 0H11.459a5.217 5.217 0 005.232 5.215h2.13v2.068A5.22 5.22 0 0024.021 12.5V1.005A1.005 1.005 0 0023.017 0z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.091.536 4.054 1.476 5.765L.053 24l6.42-1.405A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.003-1.374l-.359-.213-3.72.815.838-3.626-.234-.373A9.77 9.77 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 14.4l-2.937-.916c-.638-.197-.65-.638.136-.944l11.47-4.424c.532-.194.998.13.965.105z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function ChatGPTIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.5.5a6.037 6.037 0 00-5.736 4.12 5.975 5.975 0 00-3.996 2.9 6.04 6.04 0 00.748 7.09 5.98 5.98 0 00.51 4.911 6.05 6.05 0 006.515 2.9A5.999 5.999 0 0013.5 23.5a6.04 6.04 0 005.733-4.12 5.98 5.98 0 003.996-2.9 6.043 6.043 0 00-.947-6.66z" />
    </svg>
  );
}

// ─── Provider config ──────────────────────────────────────────────────────────

const PROVIDERS: Provider[] = [
  {
    provider: "chatgpt",
    name: "ChatGPT",
    description: "Use your ChatGPT subscription to power agents with GPT-4o, o3, and Codex models — no API key needed.",
    category: "ai",
    oauthReady: true,
    icon: <ChatGPTIcon />,
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "Sync events, create meetings, and manage your calendar directly from Vutler.",
    category: "productivity",
    oauthReady: true,
    icon: <GoogleCalendarIcon />,
  },
  {
    provider: "google-drive",
    name: "Google Drive",
    description: "Access, upload, and organize files in Google Drive without leaving your workspace.",
    category: "productivity",
    oauthReady: true,
    icon: <GoogleDriveIcon />,
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Manage repos, issues, and pull requests. Let agents interact with your code.",
    category: "development",
    oauthReady: true,
    icon: <GitHubIcon />,
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send and receive Slack messages, manage channels, and post automated updates.",
    category: "communication",
    oauthReady: false,
    comingSoon: true,
    icon: <SlackIcon />,
  },
  {
    provider: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp Business API to send and receive customer messages.",
    category: "communication",
    oauthReady: false,
    comingSoon: true,
    icon: <WhatsAppIcon />,
  },
  {
    provider: "telegram",
    name: "Telegram",
    description: "Interact via Telegram Bot API — send messages, handle commands, and more.",
    category: "communication",
    oauthReady: false,
    comingSoon: true,
    icon: <TelegramIcon />,
  },
  {
    provider: "discord",
    name: "Discord",
    description: "Post messages, manage channels, and run Discord bots from your workspace.",
    category: "communication",
    oauthReady: false,
    comingSoon: true,
    icon: <DiscordIcon />,
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Read and write Notion pages and databases, search your knowledge base.",
    category: "knowledge",
    oauthReady: false,
    comingSoon: true,
    icon: <NotionIcon />,
  },
  {
    provider: "linear",
    name: "Linear",
    description: "Create and track issues, manage cycles, and sync your product roadmap.",
    category: "project-management",
    oauthReady: false,
    comingSoon: true,
    icon: <LinearIcon />,
  },
  {
    provider: "jira",
    name: "Jira",
    description: "Manage Jira projects, create issues, and track sprint progress.",
    category: "project-management",
    oauthReady: false,
    comingSoon: true,
    icon: <JiraIcon />,
  },
];

// Map canonical provider names to their OAuth endpoint
// google-calendar and google-drive both use the single Google OAuth flow
const OAUTH_PROVIDER_MAP: Record<string, string> = {
  "google-calendar": "google",
  "google-drive": "google",
  github: "github",
  chatgpt: "chatgpt",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [connectedMap, setConnectedMap] = useState<Record<string, ConnectedIntegration>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Device Auth state (for ChatGPT)
  const [deviceAuth, setDeviceAuth] = useState<{
    user_code: string;
    verification_url: string;
    polling: boolean;
  } | null>(null);

  const fetchConnected = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch("/api/v1/integrations");
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      const map: Record<string, ConnectedIntegration> = {};
      for (const item of data.integrations || []) {
        if (item.connected) {
          map[item.provider] = item;
        }
      }
      setConnectedMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle ?connected=provider and ?error=... in URL after OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const oauthError = params.get("error");
    const provider = params.get("provider");

    if (connected) {
      const name = PROVIDERS.find(
        (p) => OAUTH_PROVIDER_MAP[p.provider] === connected || p.provider === connected
      )?.name || connected;
      setSuccessMsg(`${name} connected successfully!`);
      // Clean URL
      window.history.replaceState({}, "", "/integrations");
    }

    if (oauthError) {
      const messages: Record<string, string> = {
        oauth_cancelled: "OAuth was cancelled.",
        oauth_invalid: "Invalid OAuth state — please try again.",
        oauth_token_failed: "Token exchange failed — please try again.",
        oauth_server_error: "Server error during OAuth — please try again.",
      };
      setError((messages[oauthError] || "OAuth error") + (provider ? ` (${provider})` : ""));
      window.history.replaceState({}, "", "/integrations");
    }

    fetchConnected();
  }, [fetchConnected]);

  const handleConnect = async (providerConfig: Provider) => {
    const oauthProvider = OAUTH_PROVIDER_MAP[providerConfig.provider];
    if (!oauthProvider) return;

    try {
      setConnecting(providerConfig.provider);
      setError(null);
      setSuccessMsg(null);

      // ChatGPT uses Device Auth flow (no redirect)
      if (oauthProvider === "chatgpt") {
        const res = await authFetch(`/api/v1/integrations/chatgpt/connect`, { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to start ChatGPT device auth");
        }
        const data = await res.json();
        if (data.mode === "device_auth" && data.user_code) {
          setDeviceAuth({
            user_code: data.user_code,
            verification_url: data.verification_url || "https://auth.openai.com/codex/device",
            polling: true,
          });
          // Start polling for completion
          pollDeviceAuth();
        }
        return;
      }

      // Standard OAuth redirect flow for other providers
      const res = await authFetch(`/api/v1/integrations/${oauthProvider}/connect`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to initiate ${providerConfig.name} OAuth`);
      }
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("No auth URL returned from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to connect ${providerConfig.name}`);
      setConnecting(null);
    }
  };

  const pollDeviceAuth = async () => {
    const maxAttempts = 180; // 15 min at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await authFetch(`/api/v1/integrations/chatgpt/poll`, { method: "POST" });
        const data = await res.json();
        if (data.status === "connected") {
          setDeviceAuth(null);
          setConnecting(null);
          setSuccessMsg("ChatGPT connected successfully!");
          await fetchConnected();
          return;
        }
        if (!data.success && res.status === 410) {
          // Expired
          setDeviceAuth(null);
          setConnecting(null);
          setError("Device auth session expired. Please try again.");
          return;
        }
        // status === "pending" → keep polling
      } catch {
        // Network error, keep trying
      }
    }
    setDeviceAuth(null);
    setConnecting(null);
    setError("Device auth timed out. Please try again.");
  };

  const handleDisconnect = async (providerConfig: Provider) => {
    const oauthProvider = OAUTH_PROVIDER_MAP[providerConfig.provider] || providerConfig.provider;

    if (!confirm(`Disconnect ${providerConfig.name}? This will remove your OAuth tokens.`)) return;

    try {
      setDisconnecting(providerConfig.provider);
      setError(null);
      setSuccessMsg(null);

      const res = await authFetch(`/api/v1/integrations/${oauthProvider}/disconnect`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to disconnect ${providerConfig.name}`);
      }

      setSuccessMsg(`${providerConfig.name} disconnected.`);
      await fetchConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${providerConfig.name}`);
    } finally {
      setDisconnecting(null);
    }
  };

  const isConnected = (p: Provider): boolean => {
    const oauthProvider = OAUTH_PROVIDER_MAP[p.provider] || p.provider;
    return !!(connectedMap[p.provider] || connectedMap[oauthProvider]);
  };

  const getConnectedInfo = (p: Provider): ConnectedIntegration | undefined => {
    const oauthProvider = OAUTH_PROVIDER_MAP[p.provider] || p.provider;
    return connectedMap[p.provider] || connectedMap[oauthProvider];
  };

  const filtered = PROVIDERS.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedProviders = PROVIDERS.filter((p) => isConnected(p));
  const availableProviders = filtered.filter((p) => !isConnected(p));

  // ─── Category color map ──────────────────────────────────────────────────

  const categoryColors: Record<string, string> = {
    productivity: "bg-blue-500/10 text-blue-400",
    development: "bg-purple-500/10 text-purple-400",
    communication: "bg-green-500/10 text-green-400",
    knowledge: "bg-amber-500/10 text-amber-400",
    "project-management": "bg-rose-500/10 text-rose-400",
    ai: "bg-emerald-500/10 text-emerald-400",
  };

  const providerIconBg: Record<string, string> = {
    "google-calendar": "bg-blue-500",
    "google-drive": "bg-yellow-500",
    github: "bg-gray-700",
    slack: "bg-[#4A154B]",
    whatsapp: "bg-[#25D366]",
    telegram: "bg-[#2AABEE]",
    discord: "bg-[#5865F2]",
    notion: "bg-white",
    linear: "bg-[#5E6AD2]",
    jira: "bg-[#0052CC]",
    chatgpt: "bg-[#10a37f]",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Integrations</h1>
        <p className="text-[#9ca3af]">
          Connect external tools and services to your workspace. Agents can then use these connections to take actions on your behalf.
        </p>
      </div>

      {/* Device Auth Modal (ChatGPT) */}
      {deviceAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl p-8 max-w-md w-full mx-4 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#065f46] flex items-center justify-center">
              <ChatGPTIcon />
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <div className="flex items-center gap-3 justify-center text-[#9ca3af] text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Waiting for confirmation...
            </div>
            <button
              onClick={() => { setDeviceAuth(null); setConnecting(null); }}
              className="text-[#6b7280] hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto flex-shrink-0 opacity-70 hover:opacity-100">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto flex-shrink-0 opacity-70 hover:opacity-100">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Connected integrations */}
      {!loading && connectedProviders.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Connected ({connectedProviders.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectedProviders.map((p) => {
              const info = getConnectedInfo(p);
              return (
                <div
                  key={p.provider}
                  className="bg-[#0f1117] border border-green-500/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${providerIconBg[p.provider] || "bg-gray-700"} ${p.provider === "notion" ? "!text-black" : ""}`}
                    >
                      {p.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm">{p.name}</p>
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
                  <p className="text-xs text-[#6b7280] leading-relaxed flex-1">{p.description}</p>
                  <button
                    onClick={() => handleDisconnect(p)}
                    disabled={disconnecting === p.provider}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {disconnecting === p.provider ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#0f1117] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm placeholder-[#6b7280] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Available integrations */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          Available Integrations
          {availableProviders.length > 0 && (
            <span className="ml-2 text-sm font-normal text-[#6b7280]">
              ({availableProviders.length})
            </span>
          )}
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-[#0f1117] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 h-[160px] animate-pulse"
              />
            ))}
          </div>
        ) : availableProviders.length === 0 && searchQuery ? (
          <div className="text-center py-16 text-[#6b7280]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <p className="text-sm">No integrations match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableProviders.map((p) => (
              <ProviderCard
                key={p.provider}
                provider={p}
                categoryColor={categoryColors[p.category] || "bg-gray-500/10 text-gray-400"}
                iconBg={providerIconBg[p.provider] || "bg-gray-700"}
                connecting={connecting === p.provider}
                onConnect={handleConnect}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: Provider;
  categoryColor: string;
  iconBg: string;
  connecting: boolean;
  onConnect: (p: Provider) => void;
}

function ProviderCard({ provider, categoryColor, iconBg, connecting, onConnect }: ProviderCardProps) {
  const categoryLabel = provider.category
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="bg-[#0f1117] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 flex flex-col gap-3 hover:border-[rgba(255,255,255,0.12)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${iconBg} ${provider.provider === "notion" ? "!text-black" : ""}`}
          >
            {provider.icon}
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium text-sm">{provider.name}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${categoryColor}`}>
              {categoryLabel}
            </span>
          </div>
        </div>

        {provider.comingSoon && (
          <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] text-[#6b7280] border border-[rgba(255,255,255,0.08)]">
            Soon
          </span>
        )}
      </div>

      <p className="text-xs text-[#9ca3af] leading-relaxed flex-1">{provider.description}</p>

      {provider.comingSoon ? (
        <div className="w-full text-xs px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.04)] text-[#6b7280] text-center cursor-not-allowed select-none">
          Coming Soon
        </div>
      ) : (
        <button
          onClick={() => onConnect(provider)}
          disabled={connecting}
          className="w-full text-xs px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          {connecting ? (
            <>
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecting...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Connect
            </>
          )}
        </button>
      )}
    </div>
  );
}
