"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  account_type: string;
  connected_at: string;
}

interface UsageData {
  used: number;
  limit: number;
  plan_limit: number;
  addon_posts: number;
  percentage: number;
  allowed: boolean;
}

const PLATFORMS = [
  { id: "linkedin", name: "LinkedIn", icon: "💼" },
  { id: "twitter", name: "X (Twitter)", icon: "🐦" },
  { id: "instagram", name: "Instagram", icon: "📸" },
  { id: "facebook", name: "Facebook", icon: "📘" },
  { id: "tiktok", name: "TikTok", icon: "🎵" },
  { id: "youtube", name: "YouTube", icon: "📺" },
  { id: "threads", name: "Threads", icon: "🧵" },
  { id: "bluesky", name: "Bluesky", icon: "🦋" },
  { id: "pinterest", name: "Pinterest", icon: "📌" },
];

export default function SocialMediaPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [accountsRes, usageRes] = await Promise.all([
        authFetch("/api/v1/social-media/accounts").then((r) => r.json()),
        authFetch("/api/v1/social-media/usage").then((r) => r.json()),
      ]);
      setAccounts(accountsRes.data || []);
      setUsage(usageRes.data || null);
    } catch {
      setError("Failed to load social media data");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(platform: string) {
    try {
      setConnecting(platform);
      setError("");
      const r = await authFetch(`/api/v1/social-media/auth-url/${platform}`);
      const data = await r.json();
      if (data.success && data.data?.url) {
        window.open(data.data.url, "_blank");
      } else {
        setError(data.error || "Failed to generate auth URL");
      }
    } catch {
      setError("Failed to connect");
    } finally {
      setConnecting("");
    }
  }

  async function handleDisconnect(id: string, name: string) {
    if (!confirm(`Disconnect ${name}?`)) return;
    try {
      await authFetch(`/api/v1/social-media/accounts/${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Failed to disconnect");
    }
  }

  async function handleRefresh() {
    setLoading(true);
    await loadData();
  }

  const platformIcon = (platform: string) =>
    PLATFORMS.find((p) => p.id === platform)?.icon || "🌐";
  const platformName = (platform: string) =>
    PLATFORMS.find((p) => p.id === platform)?.name || platform;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/settings/integrations"
            className="text-sm text-[#9ca3af] hover:text-white transition-colors mb-2 inline-block"
          >
            ← Back to Integrations
          </Link>
          <h1 className="text-2xl font-bold text-white">📱 Social Media</h1>
          <p className="text-[#9ca3af] mt-1">
            Connect your social accounts and let your agents post content
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-sm rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white transition-colors cursor-pointer"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Usage Bar */}
      {usage && (
        <div className="mb-8 p-4 rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#9ca3af]">Posts this month</span>
            <span className="text-sm text-white font-medium">
              {usage.used} / {usage.limit}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[rgba(255,255,255,0.05)]">
            <div
              className={`h-full rounded-full transition-all ${
                usage.percentage > 90
                  ? "bg-red-500"
                  : usage.percentage > 70
                  ? "bg-yellow-500"
                  : "bg-[#3b82f6]"
              }`}
              style={{ width: `${Math.min(usage.percentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-[#6b7280]">
            <span>Plan: {usage.plan_limit} posts</span>
            {usage.addon_posts > 0 && (
              <span>+ {usage.addon_posts} addon posts</span>
            )}
            <Link
              href="/billing"
              className="text-[#3b82f6] hover:underline"
            >
              Get more posts →
            </Link>
          </div>
        </div>
      )}

      {/* Connected Accounts */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Connected Accounts ({accounts.length})
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]"
              />
            ))}
          </div>
        ) : accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-4 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {platformIcon(account.platform)}
                  </span>
                  <div>
                    <p className="text-white font-medium">
                      {account.account_name || platformName(account.platform)}
                    </p>
                    <p className="text-xs text-[#6b7280]">
                      {platformName(account.platform)} · {account.account_type}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleDisconnect(account.id, account.account_name)
                  }
                  className="px-3 py-1.5 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[#6b7280]">
            No social accounts connected yet. Connect one below.
          </div>
        )}
      </div>

      {/* Connect New Account */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Connect a Platform
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              onClick={() => handleConnect(platform.id)}
              disabled={connecting === platform.id}
              className="flex items-center gap-3 p-4 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.07)] hover:border-[#3b82f6]/40 transition-all cursor-pointer disabled:opacity-50"
            >
              <span className="text-2xl">{platform.icon}</span>
              <span className="text-white text-sm font-medium">
                {connecting === platform.id ? "Connecting..." : platform.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="mt-8 p-4 rounded-xl bg-[#14151f]/50 border border-[rgba(255,255,255,0.05)] text-[#6b7280] text-sm">
        <p className="font-medium text-[#9ca3af] mb-2">How it works</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Click a platform above to connect your account</li>
          <li>Authorize access in the popup window</li>
          <li>Your agents can now post content to your connected accounts</li>
          <li>Track usage and manage quotas from this page</li>
        </ol>
      </div>
    </div>
  );
}
