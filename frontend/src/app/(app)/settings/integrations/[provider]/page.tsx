"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CONNECTOR_META } from "@/lib/integrations/catalog";
import type { IntegrationCapabilityEntry, IntegrationDetail } from "@/lib/api/types";

interface Agent {
  id: string;
  name: string;
  has_access: boolean;
}

export default function IntegrationDetailPage() {
  const { provider } = useParams<{ provider: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jiraTesting, setJiraTesting] = useState(false);
  const [jiraConnecting, setJiraConnecting] = useState(false);
  const [jiraValidation, setJiraValidation] = useState<{ projectCount?: number; sampleProjects?: Array<{ key?: string; name?: string }> } | null>(null);

  const meta = CONNECTOR_META[provider] || { icon: "🔌", name: provider, description: "" };
  const isOauthProvider = ["google", "github", "microsoft365"].includes(provider);
  const isJiraProvider = provider === "jira";

  useEffect(() => {
    Promise.all([
      authFetch(`/api/v1/integrations/${provider}`).then((r) => r.json()).catch(() => null),
      authFetch(`/api/v1/integrations/${provider}/agents`).then((r) => r.json()).catch(() => ({ agents: [] })),
    ]).then(([d, a]) => {
      if (d?.integration) setDetail(d.integration);
      else
        setDetail({
          provider,
          id: provider,
          name: meta.name,
          description: meta.description || "",
          icon: meta.icon,
          category: "workspace",
          source: "internal",
          connected: false,
          status: "disconnected",
          connected_at: "",
          connected_by: "",
          scopes: ["read", "write"],
          readiness: "coming_soon",
          readiness_label: "Coming soon",
          readiness_description: "Connector readiness has not been classified yet.",
          access_model: "cloud-required",
          access_model_label: "Cloud-required",
          access_model_description: "This connector depends on the remote provider API path.",
          runtime_state: {
            workspace_available: false,
            provisioned: false,
            effective: false,
            reason: "The workspace has not connected this connector yet.",
          },
          consent: {
            requested_scopes: [],
            granted_scopes: [],
            validated_scopes: [],
            missing_scopes: [],
          },
          capabilities: [],
          unsupported_capabilities: [],
          health: null,
          usage: { api_calls_today: 0, rate_limit_remaining: 1000 },
          webhook_url: `https://app.vutler.ai/api/v1/webhooks/${provider}`,
        });
      setAgents(a.agents || []);
      setLoading(false);
    });
  }, [meta.description, meta.icon, meta.name, provider]);

  useEffect(() => {
    if (!isJiraProvider) return;
    setJiraBaseUrl(detail?.config?.baseUrl || "");
    setJiraEmail(detail?.config?.email || "");
  }, [detail?.config?.baseUrl, detail?.config?.email, isJiraProvider]);

  const handleReconnect = async () => {
    try {
      const r = await authFetch(
        `/api/v1/integrations/${provider}/connect`,
        isOauthProvider ? undefined : { method: "POST" }
      );
      if (!r.ok) throw new Error("Reconnect failed");
      const data = await r.json();
      if (isOauthProvider && data?.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
        setDetail((prev) => prev ? { ...prev, status: data?.integration?.status || "connected", connected_at: data?.integration?.connected_at || new Date().toISOString() } : prev);
    } catch {
      setError("Failed to reconnect");
    }
  };

  const submitJiraConnection = async (validateOnly: boolean) => {
    if (!jiraBaseUrl.trim() || !jiraEmail.trim() || !jiraApiToken.trim()) {
      setError("Base URL, email, and API token are required for Jira.");
      return;
    }

    setError("");
    if (validateOnly) setJiraTesting(true);
    else setJiraConnecting(true);

    try {
      const response = await authFetch("/api/v1/integrations/jira/connect", {
        method: "POST",
        body: JSON.stringify({
          baseUrl: jiraBaseUrl.trim(),
          email: jiraEmail.trim(),
          apiToken: jiraApiToken.trim(),
          validateOnly,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Jira connection failed");

      setJiraValidation({
        projectCount: data?.projectCount,
        sampleProjects: Array.isArray(data?.sampleProjects) ? data.sampleProjects : [],
      });

      if (!validateOnly) {
        setDetail((prev) => ({
          ...(prev || {
            provider,
            id: provider,
            name: meta.name,
            description: meta.description || "",
            icon: meta.icon,
            category: "workspace",
            source: "internal",
            connected: false,
            status: "connected",
            connected_at: new Date().toISOString(),
            connected_by: "",
            scopes: [],
            readiness: "operational" as const,
            readiness_label: "Operational",
            readiness_description: "Connector readiness has not been classified yet.",
            access_model: "cloud-required" as const,
            access_model_label: "Cloud-required",
            access_model_description: "This connector depends on the remote provider API path.",
            runtime_state: {
              workspace_available: true,
              provisioned: true,
              effective: true,
              reason: "The connector is connected and validated.",
            },
            consent: {
              requested_scopes: [],
              granted_scopes: [],
              validated_scopes: [],
              missing_scopes: [],
            },
            capabilities: [],
            unsupported_capabilities: [],
            health: null,
            usage: { api_calls_today: 0, rate_limit_remaining: 1000 },
          }),
          provider,
          status: data?.status || "connected",
          connected: true,
          connected_at: new Date().toISOString(),
          config: {
            ...(prev?.config || {}),
            baseUrl: data?.baseUrl || jiraBaseUrl.trim(),
            email: data?.email || jiraEmail.trim(),
            connectMode: "api_token",
          },
        }));
        setJiraApiToken("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jira connection failed");
    } finally {
      setJiraTesting(false);
      setJiraConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta.name}? This will revoke all access.`)) return;
    try {
      await authFetch(`/api/v1/integrations/${provider}`, { method: "DELETE" });
      router.push("/settings/integrations");
    } catch {
      setError("Failed to disconnect");
    }
  };

  const toggleAgent = (agentId: string) => {
    setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, has_access: !a.has_access } : a)));
  };

  const saveAgentAccess = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/v1/integrations/${provider}/agents`, {
        method: "PUT",
        body: JSON.stringify({ agents: agents.filter((a) => a.has_access).map((a) => a.id) }),
      });
    } catch {
      setError("Failed to save");
    }
    setSaving(false);
  };

  const copyWebhook = () => {
    if (detail?.webhook_url) {
      navigator.clipboard.writeText(detail.webhook_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading)
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-64 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]" />
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/settings/integrations" className="text-[#3b82f6] text-sm hover:underline">← Back to Integrations</Link>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{meta.icon}</span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{meta.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                detail?.status === "connected" || detail?.status === "degraded"
                  ? "bg-green-500/10 text-green-400"
                  : detail?.status === "failed"
                    ? "bg-red-500/10 text-red-300"
                    : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"
              }`}>
                {detail?.status === "connected"
                  ? "Connected"
                  : detail?.status === "degraded"
                    ? "Degraded"
                    : detail?.status === "failed"
                      ? "Validation failed"
                      : "Disconnected"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                detail?.readiness === "operational"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : detail?.readiness === "partial"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"
              }`}>
                {detail?.readiness_label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                detail?.access_model === "local-first"
                  ? "bg-[#3b82f6]/10 text-[#93c5fd]"
                  : "bg-[rgba(255,255,255,0.05)] text-[#d1d5db]"
              }`}>
                {detail?.access_model_label}
              </span>
              {detail?.connected_at && (
                <span className="text-xs text-[#6b7280]">Connected since {new Date(detail.connected_at).toLocaleDateString()}</span>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#9ca3af]">
              {detail?.access_model_description}
            </p>
          </div>
          <div className="flex gap-2">
            {!isJiraProvider && (
              <button onClick={handleReconnect} className="px-4 py-2 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer">Reconnect</button>
            )}
            {(detail?.connected || detail?.status === "connected") && (
              <button onClick={handleDisconnect} className="px-4 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer">Disconnect</button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StateCard
          label="Workspace available"
          value={detail?.runtime_state.workspace_available ? "Yes" : "No"}
          active={detail?.runtime_state.workspace_available}
          description="The workspace has a connector path provisioned at all."
        />
        <StateCard
          label="Provisioned"
          value={detail?.runtime_state.provisioned ? "Yes" : "No"}
          active={detail?.runtime_state.provisioned}
          description="Tokens or credentials are saved with enough setup to route work."
        />
        <StateCard
          label="Effective"
          value={detail?.runtime_state.effective ? "Yes" : "No"}
          active={detail?.runtime_state.effective}
          description={detail?.runtime_state.reason || "No runtime explanation available."}
        />
      </div>

      {isJiraProvider && (
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6 space-y-4">
          <div>
            <h2 className="text-white font-semibold">Jira connection</h2>
            <p className="text-sm text-[#9ca3af] mt-1">
              Validate your Atlassian base URL and API token before saving the connector to the workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Base URL</label>
              <input
                type="url"
                value={jiraBaseUrl}
                onChange={(event) => setJiraBaseUrl(event.target.value)}
                placeholder="https://your-company.atlassian.net"
                className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0e0f1a] px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Atlassian email</label>
              <input
                type="email"
                value={jiraEmail}
                onChange={(event) => setJiraEmail(event.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0e0f1a] px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">API token</label>
              <input
                type="password"
                value={jiraApiToken}
                onChange={(event) => setJiraApiToken(event.target.value)}
                placeholder={detail?.connected ? "Enter a new token to revalidate or rotate" : "Paste Jira API token"}
                className="w-full rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0e0f1a] px-3 py-2 text-sm text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
            </div>
          </div>

          <p className="text-xs text-[#6b7280]">
            Jira uses API token authentication. Vutler stores the token encrypted and only returns the base URL and email back to this screen.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void submitJiraConnection(true)}
              disabled={jiraTesting || jiraConnecting}
              className="px-4 py-2 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {jiraTesting ? "Validating..." : "Validate connection"}
            </button>
            <button
              onClick={() => void submitJiraConnection(false)}
              disabled={jiraTesting || jiraConnecting}
              className="px-4 py-2 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {jiraConnecting ? "Saving..." : detail?.connected ? "Save new credentials" : "Save & connect"}
            </button>
          </div>

          {jiraValidation && (
            <div className="rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-white font-medium">Connection test passed</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                  {jiraValidation.projectCount ?? 0} projects visible
                </span>
              </div>
              {jiraValidation.sampleProjects && jiraValidation.sampleProjects.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {jiraValidation.sampleProjects.map((project) => (
                    <span
                      key={`${project.key || project.name}`}
                      className="px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.05)] text-[#9ca3af] text-xs"
                    >
                      {(project.key || "PROJECT")} · {project.name || "Unnamed"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold">Consent, scopes, and validation</h2>
            <p className="mt-1 text-sm text-[#9ca3af]">
              Separate what Vutler requested, what the provider granted, and what the runtime actually validated.
            </p>
          </div>
          <span className="text-xs text-[#6b7280]">
            {detail?.health?.checked_at ? `Last check ${new Date(detail.health.checked_at).toLocaleString()}` : "No post-connect check yet"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ScopeColumn
            title="Requested scopes"
            tone="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#d1d5db]"
            values={detail?.consent.requested_scopes || []}
            empty="No requested scopes declared for this connector."
          />
          <ScopeColumn
            title="Granted scopes"
            tone="border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#93c5fd]"
            values={detail?.consent.granted_scopes || []}
            empty="The workspace has not granted any scope yet."
          />
          <ScopeColumn
            title="Validated scopes"
            tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            values={detail?.consent.validated_scopes || []}
            empty="No validated scope yet. The connector may still be connected without a probe."
          />
        </div>

        {detail?.consent.missing_scopes && detail.consent.missing_scopes.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-medium text-white">Missing from granted set</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.consent.missing_scopes.map((scope) => (
                <code key={scope} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                  {scope}
                </code>
              ))}
            </div>
          </div>
        )}

        {detail?.health && (
          <div className="mt-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0e0f1a] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Validation checks</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                detail.health.status === "connected"
                  ? "bg-green-500/10 text-green-400"
                  : detail.health.status === "degraded"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-red-500/10 text-red-300"
              }`}>
                {detail.health.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#9ca3af]">{detail.health.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {detail.health.checks.map((check) => (
                <div key={check.key} className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{check.label}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      check.status === "ok"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-300"
                    }`}>
                      {check.status === "ok" ? "Validated" : "Failed"}
                    </span>
                  </div>
                  {(check.error || check.code) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-[#6b7280]">
                      {[check.code, check.error].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
        <div>
          <h2 className="text-white font-semibold">Effective capability</h2>
          <p className="mt-1 text-sm text-[#9ca3af]">
            This connector can expose supported, consented, validated, unsupported, or local fallback capability paths.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(detail?.capabilities || []).map((capability) => (
            <CapabilityCard key={capability.key} capability={capability} />
          ))}
        </div>

        {detail?.unsupported_capabilities && detail.unsupported_capabilities.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm font-medium text-white">Unsupported capability blocks</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.unsupported_capabilities.map((capability) => (
                <span key={capability.key} className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
                  {capability.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold">Agent Access</h2>
          <button onClick={saveAgentAccess} disabled={saving} className="px-4 py-1.5 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors cursor-pointer">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {agents.length === 0 ? (
          <p className="text-[#6b7280] text-sm">No agents found. Create an agent first.</p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.03)] cursor-pointer">
                <input type="checkbox" checked={a.has_access} onChange={() => toggleAgent(a.id)} className="w-4 h-4 rounded bg-[#0e0f1a] border-[rgba(255,255,255,0.2)] text-[#3b82f6] focus:ring-[#3b82f6]" />
                <span className="text-white text-sm">{a.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
        <h2 className="text-white font-semibold mb-3">Usage Statistics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.03)]">
            <p className="text-[#6b7280] text-xs mb-1">API Calls Today</p>
            <p className="text-white text-2xl font-bold">{detail?.usage?.api_calls_today ?? 0}</p>
          </div>
          <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.03)]">
            <p className="text-[#6b7280] text-xs mb-1">Rate Limit Remaining</p>
            <p className="text-white text-2xl font-bold">{detail?.usage?.rate_limit_remaining ?? "—"}</p>
          </div>
        </div>
      </div>

      {detail?.webhook_url && (
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
          <h2 className="text-white font-semibold mb-3">Webhook URL</h2>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-[#0e0f1a] text-[#9ca3af] text-sm truncate">{detail.webhook_url}</code>
            <button onClick={copyWebhook} className="px-3 py-2 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer whitespace-nowrap">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StateCard({
  label,
  value,
  active,
  description,
}: {
  label: string;
  value: string;
  active: boolean | undefined;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#14151f] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          active
            ? "bg-green-500/10 text-green-400"
            : "bg-[rgba(255,255,255,0.05)] text-[#9ca3af]"
        }`}>
          {value}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[#9ca3af]">{description}</p>
    </div>
  );
}

function ScopeColumn({
  title,
  tone,
  values,
  empty,
}: {
  title: string;
  tone: string;
  values: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0e0f1a] p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      {values.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <code key={value} className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>
              {value}
            </code>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#6b7280]">{empty}</p>
      )}
    </div>
  );
}

function CapabilityCard({ capability }: { capability: IntegrationCapabilityEntry }) {
  const tone = capability.status === "validated"
    ? "bg-green-500/10 text-green-400 border-green-500/20"
    : capability.status === "consented"
      ? "bg-[#3b82f6]/10 text-[#93c5fd] border-[#3b82f6]/20"
      : capability.status === "local_fallback"
        ? "bg-violet-500/10 text-violet-300 border-violet-500/20"
        : capability.status === "unsupported"
          ? "bg-red-500/10 text-red-300 border-red-500/20"
          : "bg-[rgba(255,255,255,0.05)] text-[#d1d5db] border-[rgba(255,255,255,0.08)]";

  const label = capability.status === "validated"
    ? "Validated"
    : capability.status === "consented"
      ? "Consented"
      : capability.status === "local_fallback"
        ? "Local fallback"
        : capability.status === "unsupported"
          ? "Unsupported"
          : "Supported";

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0e0f1a] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{capability.label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
          {label}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">{capability.description}</p>
    </div>
  );
}
