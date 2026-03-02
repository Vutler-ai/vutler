"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AgentIntegration {
  provider: string;
  name: string;
  icon: string;
  enabled: boolean;
  scopes: string[];
}

const META: Record<string, { icon: string; name: string }> = {
  slack: { icon: "💬", name: "Slack" },
  google: { icon: "🔵", name: "Google Workspace" },
  github: { icon: "🐙", name: "GitHub" },
};

export default function AgentIntegrationsPage() {
  const { id } = useParams<{ id: string }>();
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      authFetch("/api/v1/integrations").then((r) => r.json()).catch(() => ({ integrations: [] })),
      authFetch(`/api/v1/agents/${id}/config`).then((r) => r.json()).catch(() => ({ config: { integrations: [] } })),
    ]).then(([intData, agentData]) => {
      const enabled: string[] = agentData?.config?.integrations || [];
      const connected = (intData.integrations || []).map((i: { provider: string; scopes?: string[] }) => ({
        provider: i.provider,
        name: META[i.provider]?.name || i.provider,
        icon: META[i.provider]?.icon || "🔌",
        enabled: enabled.includes(i.provider),
        scopes: i.scopes || [],
      }));
      setIntegrations(connected);
      setLoading(false);
    });
  }, [id]);

  const toggle = (provider: string) => {
    setIntegrations((p) => p.map((i) => (i.provider === provider ? { ...i, enabled: !i.enabled } : i)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/v1/agents/${id}/config`, {
        method: "PUT",
        body: JSON.stringify({ integrations: integrations.filter((i) => i.enabled).map((i) => i.provider) }),
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
          <Link href={`/agents/${id}/config`} className="text-[#3b82f6] text-sm hover:underline">← Back to Agent Config</Link>
          <h1 className="text-xl font-bold text-white mt-2">Agent Integrations</h1>
          <p className="text-[#9ca3af] text-sm mt-1">Toggle which integrations this agent can use</p>
        </div>
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 text-sm cursor-pointer">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {toast && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{toast}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]" />)}
        </div>
      ) : integrations.length === 0 ? (
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-8 text-center">
          <p className="text-[#6b7280]">No connected integrations. <Link href="/settings/integrations" className="text-[#3b82f6] hover:underline">Connect one</Link></p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map((i) => (
            <div key={i.provider} className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-4">
              <div className="flex items-center gap-4">
                <span className="text-2xl">{i.icon}</span>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{i.name}</h3>
                  {i.enabled && i.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {i.scopes.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[#3b82f6]/10 text-[#3b82f6]">{s}</span>)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggle(i.provider)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${i.enabled ? "bg-[#3b82f6]" : "bg-[rgba(255,255,255,0.1)]"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${i.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
