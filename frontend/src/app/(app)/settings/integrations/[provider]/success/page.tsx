"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const META: Record<string, { icon: string; name: string }> = {
  slack: { icon: "💬", name: "Slack" },
  google: { icon: "🔵", name: "Google Workspace" },
  github: { icon: "🐙", name: "GitHub" },
};

interface Agent {
  id: string;
  name: string;
  selected: boolean;
}

export default function ConnectSuccessPage() {
  const { provider } = useParams<{ provider: string }>();
  const meta = META[provider] || { icon: "🔌", name: provider };
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    authFetch("/api/v1/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents((data.agents || []).map((a: { id: string; name: string }) => ({ ...a, selected: false })));
      })
      .catch(() => {});
  }, []);

  const toggle = (id: string) => setAgents((p) => p.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)));

  const saveAccess = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/v1/integrations/${provider}/agents`, {
        method: "PUT",
        body: JSON.stringify({ agents: agents.filter((a) => a.selected).map((a) => a.id) }),
      });
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="max-w-lg mx-auto text-center pt-12">
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-4">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Connected to {meta.name}! {meta.icon}</h1>
        <p className="text-[#9ca3af]">Your integration is ready to use.</p>
      </div>

      {agents.length > 0 && !saved && (
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6 text-left mb-6">
          <h2 className="text-white font-semibold mb-3">Quick Setup: Grant Agent Access</h2>
          <div className="space-y-2 mb-4">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[rgba(255,255,255,0.03)] cursor-pointer">
                <input type="checkbox" checked={a.selected} onChange={() => toggle(a.id)} className="w-4 h-4 rounded bg-[#0e0f1a] border-[rgba(255,255,255,0.2)] text-[#3b82f6] focus:ring-[#3b82f6]" />
                <span className="text-white text-sm">{a.name}</span>
              </label>
            ))}
          </div>
          <button onClick={saveAccess} disabled={saving} className="w-full py-2 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 text-sm cursor-pointer">
            {saving ? "Saving..." : "Grant Access"}
          </button>
        </div>
      )}

      {saved && <p className="text-green-400 text-sm mb-6">✅ Agent access saved!</p>}

      <Link href={`/settings/integrations/${provider}`} className="inline-block px-6 py-2.5 rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] text-sm transition-colors">
        Go to Settings
      </Link>
    </div>
  );
}
