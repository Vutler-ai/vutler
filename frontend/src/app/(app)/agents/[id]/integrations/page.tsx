"use client";

import { authFetch } from "@/lib/authFetch";
import {
  CONNECTOR_META,
  WORKSPACE_CONNECTOR_ORDER,
  SOCIAL_PLATFORM_PROVIDERS,
  getSocialPlatformMeta,
  isSocialPlatformProvider,
  normalizeIntegrationKey,
} from "@/lib/integrations/catalog";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AgentIntegrationCard {
  provider: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  scopes: string[];
  connectedPlatforms: Array<{ provider: string; name: string; icon: string }>;
  selectedPlatforms: string[];
}

interface WorkspaceIntegrationRow {
  provider: string;
  connected?: boolean;
  scopes?: string[];
}

function sortByConnectorOrder(a: AgentIntegrationCard, b: AgentIntegrationCard) {
  const aIndex = WORKSPACE_CONNECTOR_ORDER.indexOf(a.provider as (typeof WORKSPACE_CONNECTOR_ORDER)[number]);
  const bIndex = WORKSPACE_CONNECTOR_ORDER.indexOf(b.provider as (typeof WORKSPACE_CONNECTOR_ORDER)[number]);
  const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
  const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
  return safeA - safeB || a.name.localeCompare(b.name);
}

export default function AgentIntegrationsPage() {
  const { id } = useParams<{ id: string }>();
  const [integrations, setIntegrations] = useState<AgentIntegrationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      authFetch("/api/v1/integrations").then((r) => r.json()).catch(() => ({ integrations: [] })),
      authFetch(`/api/v1/agents/${id}/config`).then((r) => r.json()).catch(() => ({ config: { integrations: [] } })),
      authFetch("/api/v1/social-media/accounts").then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([integrationData, agentData, socialData]) => {
      const enabledSet = new Set<string>(
        Array.isArray(agentData?.config?.integrations)
          ? agentData.config.integrations.map((value: string) => normalizeIntegrationKey(value))
          : []
      );

      const workspaceRows: WorkspaceIntegrationRow[] = Array.isArray(integrationData?.integrations)
        ? integrationData.integrations.filter((row: WorkspaceIntegrationRow) => row?.connected)
        : [];

      const cards: AgentIntegrationCard[] = [];

      for (const row of workspaceRows) {
        const provider = normalizeIntegrationKey(row.provider);
        if (provider === "social_media") continue;
        const meta = CONNECTOR_META[provider];
        if (!meta) continue;
        cards.push({
          provider,
          name: meta.name,
          icon: meta.icon,
          description: meta.description,
          enabled: enabledSet.has(provider),
          scopes: Array.isArray(row.scopes) ? row.scopes : [],
          connectedPlatforms: [],
          selectedPlatforms: [],
        });
      }

      const uniqueSocialPlatforms: string[] = Array.from(
        new Set<string>(
          (Array.isArray(socialData?.data) ? socialData.data : [])
            .map((account: { platform?: string }) => normalizeIntegrationKey(account?.platform))
            .filter((platform: string): platform is string => isSocialPlatformProvider(platform))
        )
      );

      const hasSocialConnector = workspaceRows.some((row) => normalizeIntegrationKey(row.provider) === "social_media");
      if (hasSocialConnector || uniqueSocialPlatforms.length > 0) {
        const connectedPlatforms = uniqueSocialPlatforms.map((provider) => ({
          provider,
          ...getSocialPlatformMeta(provider),
        }));
        const selectedPlatforms = uniqueSocialPlatforms.filter((provider: string) => enabledSet.has(provider));
        cards.push({
          provider: "social_media",
          name: CONNECTOR_META.social_media.name,
          icon: CONNECTOR_META.social_media.icon,
          description: CONNECTOR_META.social_media.description,
          enabled: enabledSet.has("social_media") || selectedPlatforms.length > 0,
          scopes: ["post_content"],
          connectedPlatforms,
          selectedPlatforms: enabledSet.has("social_media") ? uniqueSocialPlatforms : selectedPlatforms,
        });
      }

      setIntegrations(cards.sort(sortByConnectorOrder));
      setLoading(false);
    });
  }, [id]);

  const toggleConnector = (provider: string) => {
    setIntegrations((previous) =>
      previous.map((integration) => {
        if (integration.provider !== provider) return integration;
        if (provider !== "social_media") {
          return { ...integration, enabled: !integration.enabled };
        }

        const nextEnabled = !integration.enabled;
        return {
          ...integration,
          enabled: nextEnabled,
          selectedPlatforms: nextEnabled ? integration.connectedPlatforms.map((platform) => platform.provider) : [],
        };
      })
    );
  };

  const toggleSocialPlatform = (provider: string) => {
    setIntegrations((previous) =>
      previous.map((integration) => {
        if (integration.provider !== "social_media") return integration;

        const selected = new Set(integration.selectedPlatforms);
        if (selected.has(provider)) selected.delete(provider);
        else selected.add(provider);

        const nextSelectedPlatforms = integration.connectedPlatforms
          .map((platform) => platform.provider)
          .filter((platform) => selected.has(platform));

        return {
          ...integration,
          enabled: nextSelectedPlatforms.length > 0,
          selectedPlatforms: nextSelectedPlatforms,
        };
      })
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const providers: string[] = [];

      for (const integration of integrations) {
        if (!integration.enabled) continue;

        if (integration.provider !== "social_media") {
          providers.push(integration.provider);
          continue;
        }

        const connectedPlatforms = integration.connectedPlatforms.map((platform) => platform.provider);
        const selectedPlatforms = integration.selectedPlatforms.filter((platform) => connectedPlatforms.includes(platform));

        if (connectedPlatforms.length > 0 && selectedPlatforms.length > 0 && selectedPlatforms.length < connectedPlatforms.length) {
          providers.push(...selectedPlatforms);
        } else {
          providers.push("social_media");
        }
      }

      await authFetch(`/api/v1/agents/${id}/config`, {
        method: "PUT",
        body: JSON.stringify({ integrations: Array.from(new Set(providers)) }),
      });
      setToast("Saved!");
      setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("Error saving");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/agents/${id}/config`} className="text-[#3b82f6] text-sm hover:underline">
            ← Back to Agent Config
          </Link>
          <h1 className="text-xl font-bold text-white mt-2">Agent Integrations</h1>
          <p className="text-[#9ca3af] text-sm mt-1">
            Enable workspace connectors for this agent. Social Media is grouped once, with optional platform restrictions.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 text-sm cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {toast && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-20 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]"
            />
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-8 text-center">
          <p className="text-[#6b7280]">
            No connected integrations.{" "}
            <Link href="/settings/integrations" className="text-[#3b82f6] hover:underline">
              Connect one
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => (
            <div
              key={integration.provider}
              className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-4"
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{integration.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium">{integration.name}</h3>
                  <p className="text-[#6b7280] text-sm mt-1">{integration.description}</p>

                  {integration.enabled && integration.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {integration.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="text-xs px-2 py-0.5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6]"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleConnector(integration.provider)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    integration.enabled ? "bg-[#3b82f6]" : "bg-[rgba(255,255,255,0.1)]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      integration.enabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {integration.provider === "social_media" && integration.connectedPlatforms.length > 0 && (
                <div className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {integration.connectedPlatforms.map((platform) => (
                      <span
                        key={platform.provider}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.05)] text-[#9ca3af]"
                      >
                        <span>{platform.icon}</span>
                        {platform.name}
                      </span>
                    ))}
                  </div>

                  {integration.enabled && (
                    <>
                      <p className="text-xs text-[#6b7280] mb-3">
                        Restrict this agent to specific social platforms if needed. Leaving all selected grants access to the full Social Media connector.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {integration.connectedPlatforms.map((platform) => {
                          const selected = integration.selectedPlatforms.includes(platform.provider);
                          return (
                            <button
                              key={platform.provider}
                              onClick={() => toggleSocialPlatform(platform.provider)}
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${
                                selected
                                  ? "border-[#3b82f6]/40 bg-[#3b82f6]/10 text-white"
                                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-[#9ca3af]"
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <span>{platform.icon}</span>
                                {platform.name}
                              </span>
                              <span className="text-xs">{selected ? "Allowed" : "Blocked"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
