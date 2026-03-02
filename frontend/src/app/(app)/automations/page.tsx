"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect } from "react";
import Link from "next/link";

type Tab = "automations" | "n8n" | "templates";

interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger_provider: string;
  trigger_event: string;
  action_type: string;
  created_at: string;
}

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  nodes_count?: number;
}

const TEMPLATES = [
  {
    id: "email-summarize-slack",
    title: "Email → Summarize → Slack",
    icon: "📧→💬",
    description: "Automatically summarize incoming emails and post key points to a Slack channel.",
    integrations: ["google", "slack"],
    integrationIcons: ["🔵", "💬"],
  },
  {
    id: "github-review-comment",
    title: "GitHub PR → Code Review → Comment",
    icon: "🐙→🔍",
    description: "AI-powered code review on new pull requests with inline comments.",
    integrations: ["github"],
    integrationIcons: ["🐙"],
  },
  {
    id: "calendar-brief-email",
    title: "Calendar → Brief → Email",
    icon: "📅→📧",
    description: "Generate meeting briefs from calendar events and send prep emails.",
    integrations: ["google"],
    integrationIcons: ["🔵"],
  },
  {
    id: "form-crm-followup",
    title: "Form → CRM → Agent Follow-up",
    icon: "📝→💰",
    description: "Route form submissions to your CRM and trigger agent follow-up sequences.",
    integrations: ["n8n"],
    integrationIcons: ["⚡"],
  },
];

const PROVIDER_ICONS: Record<string, string> = {
  slack: "💬", google: "🔵", github: "🐙", notion: "📝", jira: "🔷", linear: "🟣", n8n: "⚡",
};

export default function AutomationsPage() {
  const [tab, setTab] = useState<Tab>("automations");
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [loadingAuto, setLoadingAuto] = useState(true);
  const [loadingN8n, setLoadingN8n] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/v1/automations")
      .then((r) => r.json())
      .then((data) => { setAutomations(data.automations || []); setLoadingAuto(false); })
      .catch(() => setLoadingAuto(false));
  }, []);

  useEffect(() => {
    if (tab === "n8n" && workflows.length === 0) {
      setLoadingN8n(true);
      authFetch("/api/v1/integrations/n8n/workflows")
        .then((r) => r.json())
        .then((data) => { setWorkflows(data.workflows || []); setLoadingN8n(false); })
        .catch(() => setLoadingN8n(false));
    }
  }, [tab]);

  const toggleAutomation = async (id: string, enabled: boolean) => {
    setTogglingId(id);
    try {
      await authFetch(`/api/v1/automations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
    } catch { /* ignore */ }
    setTogglingId(null);
  };

  const triggerWorkflow = async (id: string) => {
    setTriggeringId(id);
    try {
      await authFetch(`/api/v1/integrations/n8n/workflows/${id}/trigger`, { method: "POST" });
    } catch { /* ignore */ }
    setTimeout(() => setTriggeringId(null), 1500);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "automations", label: "My Automations" },
    { key: "n8n", label: "n8n Workflows" },
    { key: "templates", label: "Templates" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">⚡ Automations & Workflows</h1>
          <p className="text-[#9ca3af] mt-1">Create triggers, connect integrations, automate everything</p>
        </div>
        <Link
          href="/automations/new"
          className="mt-4 sm:mt-0 px-4 py-2 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors inline-flex items-center gap-2"
        >
          + New Automation
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#14151f] rounded-lg p-1 w-fit border border-[rgba(255,255,255,0.07)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors cursor-pointer ${
              tab === t.key ? "bg-[#3b82f6] text-white" : "text-[#9ca3af] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* My Automations */}
      {tab === "automations" && (
        <div className="space-y-3">
          {loadingAuto ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]" />
            ))
          ) : automations.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)]">
              <p className="text-[#6b7280] text-lg mb-2">No automations yet</p>
              <p className="text-[#6b7280] text-sm mb-4">Create your first automation to get started</p>
              <Link href="/automations/new" className="px-4 py-2 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors">
                + Create Automation
              </Link>
            </div>
          ) : (
            automations.map((a) => (
              <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] hover:border-[#3b82f6]/30 transition-colors">
                <span className="text-2xl">{PROVIDER_ICONS[a.trigger_provider] || "⚡"}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">{a.name}</h3>
                  <p className="text-[#6b7280] text-xs mt-0.5">
                    {a.trigger_provider} → {a.trigger_event} → {a.action_type}
                  </p>
                </div>
                <button
                  onClick={() => toggleAutomation(a.id, a.enabled)}
                  disabled={togglingId === a.id}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${a.enabled ? "bg-[#3b82f6]" : "bg-[rgba(255,255,255,0.1)]"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${a.enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* n8n Workflows */}
      {tab === "n8n" && (
        <div className="space-y-3">
          {loadingN8n ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-[#14151f] animate-pulse border border-[rgba(255,255,255,0.07)]" />
            ))
          ) : workflows.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)]">
              <p className="text-[#6b7280] text-lg mb-2">No n8n workflows found</p>
              <p className="text-[#6b7280] text-sm">Connect n8n in <Link href="/settings/integrations" className="text-[#3b82f6] hover:underline">Integrations</Link> first</p>
            </div>
          ) : (
            workflows.map((w) => (
              <div key={w.id} className="flex items-center gap-4 p-4 rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] hover:border-[#3b82f6]/30 transition-colors">
                <span className="text-2xl">⚡</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium truncate">{w.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${w.active ? "bg-green-500/10 text-green-400" : "bg-[rgba(255,255,255,0.05)] text-[#6b7280]"}`}>
                      {w.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-[#6b7280] text-xs mt-0.5">
                    Updated {new Date(w.updated_at).toLocaleDateString()}
                    {w.nodes_count ? ` · ${w.nodes_count} nodes` : ""}
                  </p>
                </div>
                <button
                  onClick={() => triggerWorkflow(w.id)}
                  disabled={triggeringId === w.id}
                  className="px-3 py-1.5 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {triggeringId === w.id ? "Triggered ✓" : "▶ Trigger"}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6 hover:border-[#3b82f6]/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{t.icon}</span>
                <div className="flex gap-1">
                  {t.integrationIcons.map((ic, i) => (
                    <span key={i} className="text-lg" title={t.integrations[i]}>{ic}</span>
                  ))}
                </div>
              </div>
              <h3 className="text-white font-semibold mb-2">{t.title}</h3>
              <p className="text-[#9ca3af] text-sm mb-4">{t.description}</p>
              <button className="px-4 py-1.5 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer">
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
