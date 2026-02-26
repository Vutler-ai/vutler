"use client";
import { useState, useEffect } from "react";

interface Provider {
  id: string;
  name: string;
  api_key?: string;
  enabled: boolean;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", api_key: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/v1/providers")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.providers || d.items || [];
        setProviders(list);
      })
      .catch(() => setError("Failed to load providers"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setForm({ name: "", api_key: "" });
      setShowAdd(false);
      load();
    } catch {
      setError("Failed to add provider");
    } finally {
      setSaving(false);
    }
  };

  const mask = (key?: string) => {
    if (!key) return "••••••••";
    return key.slice(0, 4) + "••••••••" + key.slice(-4);
  };

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">LLM Providers</h1>
          <p className="text-gray-400 mt-1">Manage your AI provider connections</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition">
          {showAdd ? "Cancel" : "+ Add Provider"}
        </button>
      </div>

      {error && <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/40 text-red-300 text-sm">{error}</div>}

      {showAdd && (
        <form onSubmit={addProvider} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-6 max-w-lg space-y-4">
          <input
            className="w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="Provider name (e.g. OpenAI)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="API Key"
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            required
          />
          <button type="submit" disabled={saving} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition">
            {saving ? "Saving…" : "Save Provider"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : providers.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg">No providers configured yet</p>
          <p className="text-gray-500 text-sm mt-2">Add your first LLM provider to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {providers.map((p) => (
            <div key={p.id || p.name} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-gray-500 text-sm font-mono mt-1">{mask(p.api_key)}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${p.enabled ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                {p.enabled ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
