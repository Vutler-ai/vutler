"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const META: Record<string, { icon: string; name: string }> = {
  slack: { icon: "💬", name: "Slack" },
  google: { icon: "🔵", name: "Google Workspace" },
  github: { icon: "🐙", name: "GitHub" },
  notion: { icon: "📝", name: "Notion" },
  jira: { icon: "🔷", name: "Jira" },
  linear: { icon: "🟣", name: "Linear" },
  n8n: { icon: "⚡", name: "n8n" },
};

interface Detail {
  provider: string;
  status: string;
  connected_at: string;
  scopes: string[];
  connected?: boolean;
  config?: {
    baseUrl?: string;
    email?: string;
    connectMode?: string;
  };
  usage: { api_calls_today: number; rate_limit_remaining: number };
  webhook_url?: string;
}

interface Agent {
  id: string;
  name: string;
  has_access: boolean;
}

export default function IntegrationDetailPage() {
  const { provider } = useParams<{ provider: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
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

const meta = META[provider] || { icon: "🔌", name: provider };
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
          status: "disconnected",
          connected_at: "",
          scopes: ["read", "write"],
          usage: { api_calls_today: 0, rate_limit_remaining: 1000 },
          webhook_url: `https://app.vutler.ai/api/v1/webhooks/${provider}`,
        });
      setAgents(a.agents || []);
      setLoading(false);
    });
  }, [provider]);

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
            status: "connected",
            connected_at: new Date().toISOString(),
            scopes: [],
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
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${detail?.status === "connected" ? "bg-green-500/10 text-green-400" : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"}`}>
                {detail?.status === "connected" ? "✅ Connected" : "⚪ Disconnected"}
              </span>
              {detail?.connected_at && (
                <span className="text-xs text-[#6b7280]">Connected since {new Date(detail.connected_at).toLocaleDateString()}</span>
              )}
            </div>
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
        <h2 className="text-white font-semibold mb-3">Permissions & Scopes</h2>
        <div className="flex flex-wrap gap-2">
          {(detail?.scopes || []).map((s) => (
            <span key={s} className="px-3 py-1 text-xs rounded-full bg-[#3b82f6]/10 text-[#3b82f6]">{s}</span>
          ))}
        </div>
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
