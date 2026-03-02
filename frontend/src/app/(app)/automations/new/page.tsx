"use client";

import { authFetch } from "@/lib/authFetch";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TRIGGER_OPTIONS: Record<string, { icon: string; name: string; events: string[] }> = {
  github: { icon: "🐙", name: "GitHub", events: ["new_issue", "new_pr", "push", "comment", "review"] },
  slack: { icon: "💬", name: "Slack", events: ["message", "reaction", "mention", "channel_created"] },
  google: { icon: "🔵", name: "Google", events: ["new_email", "calendar_event", "drive_change"] },
  notion: { icon: "📝", name: "Notion", events: ["page_created", "page_updated", "database_change"] },
  jira: { icon: "🔷", name: "Jira", events: ["issue_created", "issue_updated", "sprint_started", "comment"] },
  linear: { icon: "🟣", name: "Linear", events: ["issue_created", "issue_updated", "cycle_started", "comment"] },
  n8n: { icon: "⚡", name: "n8n", events: ["webhook", "workflow_completed"] },
};

const ACTION_TYPES = [
  { value: "analyze_respond", label: "Analyze and respond" },
  { value: "summarize", label: "Summarize" },
  { value: "create_task", label: "Create task" },
  { value: "notify", label: "Send notification" },
  { value: "custom", label: "Custom prompt" },
];

export default function NewAutomationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [triggerProvider, setTriggerProvider] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("");
  const [actionType, setActionType] = useState("");
  const [agentId, setAgentId] = useState("");
  const [conditions, setConditions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const selectedTrigger = triggerProvider ? TRIGGER_OPTIONS[triggerProvider] : null;

  const handleSave = async () => {
    if (!name || !triggerProvider || !triggerEvent || !actionType) {
      setError("Please fill in all required fields");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/v1/automations", {
        method: "POST",
        body: JSON.stringify({
          name,
          trigger_provider: triggerProvider,
          trigger_event: triggerEvent,
          action_type: actionType,
          agent_id: agentId || undefined,
          conditions: conditions || undefined,
        }),
      });
      const data = await res.json();
      if (data.webhook_url) {
        setWebhookUrl(data.webhook_url);
      } else {
        router.push("/automations");
      }
    } catch {
      setError("Failed to save automation");
    }
    setSaving(false);
  };

  const [copied, setCopied] = useState(false);
  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (webhookUrl) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-8 text-center">
          <span className="text-5xl mb-4 block">✅</span>
          <h1 className="text-xl font-bold text-white mb-2">Automation Created!</h1>
          <p className="text-[#9ca3af] mb-6">Configure this webhook URL in your provider to start receiving events:</p>
          <div className="flex items-center gap-2 mb-6">
            <code className="flex-1 px-4 py-3 rounded-lg bg-[#0e0f1a] text-[#3b82f6] text-sm text-left truncate">{webhookUrl}</code>
            <button onClick={copyUrl} className="px-4 py-3 text-sm rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors cursor-pointer whitespace-nowrap">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <Link href="/automations" className="px-4 py-2 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors">
            Go to Automations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/automations" className="text-[#3b82f6] text-sm hover:underline mb-6 block">← Back to Automations</Link>

      <h1 className="text-2xl font-bold text-white mb-2">⚡ New Automation</h1>
      <p className="text-[#9ca3af] mb-8">Set up a trigger → action pipeline</p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-white text-sm font-medium mb-2">Automation Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Auto-review PRs"
            className="w-full px-4 py-2.5 rounded-lg bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-sm"
          />
        </div>

        {/* Trigger */}
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
          <h2 className="text-white font-semibold mb-4">🎯 Trigger</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Integration *</label>
              <select
                value={triggerProvider}
                onChange={(e) => { setTriggerProvider(e.target.value); setTriggerEvent(""); }}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] cursor-pointer"
              >
                <option value="">Select integration</option>
                {Object.entries(TRIGGER_OPTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Event *</label>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                disabled={!selectedTrigger}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] cursor-pointer disabled:opacity-40"
              >
                <option value="">Select event</option>
                {selectedTrigger?.events.map((ev) => (
                  <option key={ev} value={ev}>{ev.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
          <h2 className="text-white font-semibold mb-4">🚀 Action</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Action Type *</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] cursor-pointer"
              >
                <option value="">Select action</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#9ca3af] text-xs mb-1.5">Agent (optional)</label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="Agent ID or leave empty"
                className="w-full px-3 py-2.5 rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#6b7280] text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="rounded-xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-6">
          <h2 className="text-white font-semibold mb-4">🔍 Conditions (optional)</h2>
          <textarea
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="e.g., channel=general, repo=vutler, label=bug"
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white placeholder-[#6b7280] text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] resize-none"
          />
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 text-sm rounded-lg bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors cursor-pointer font-medium"
          >
            {saving ? "Creating..." : "Create Automation"}
          </button>
          <Link href="/automations" className="px-6 py-2.5 text-sm rounded-lg bg-[rgba(255,255,255,0.05)] text-[#9ca3af] hover:text-white transition-colors">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
