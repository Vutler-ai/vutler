"use client";
import { useState, useEffect } from "react";

const AGENT_TYPES = ["conversational", "task", "retrieval", "coding", "custom"];

export default function BuilderPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("conversational");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/models")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.models || d.items || [];
        setModels(list.map((m: any) => (typeof m === "string" ? m : m.id || m.name)));
      })
      .catch(() => setModels(["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-20250514", "claude-opus-4-20250514"]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          model,
          system_prompt: systemPrompt,
          tools: tools
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setMsg({ ok: true, text: "Agent created!" });
      setName("");
      setSystemPrompt("");
      setTools("");
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Failed to create agent" });
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition";

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Agent Builder</h1>
      <p className="text-gray-400 mb-8">Create a new AI agent</p>

      {msg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${msg.ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={submit} className="max-w-2xl space-y-6">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Agent Name</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" required />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Type</label>
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Model</label>
          <select className={input} value={model} onChange={(e) => setModel(e.target.value)} required>
            <option value="">Select a model…</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">System Prompt</label>
          <textarea className={input + " h-32 resize-y"} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant..." />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Tools (comma-separated)</label>
          <input className={input} value={tools} onChange={(e) => setTools(e.target.value)} placeholder="web_search, code_interpreter" />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg transition"
        >
          {saving ? "Creating…" : "Create Agent"}
        </button>
      </form>
    </div>
  );
}
