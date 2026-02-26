"use client";
import { useState, useEffect } from "react";

export default function LLMSettingsPage() {
  const [settings, setSettings] = useState({
    default_model: "",
    temperature: 0.7,
    max_tokens: 4096,
    streaming: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings((prev) => ({ ...prev, ...d }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setMsg({ ok: true, text: "Settings saved!" });
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition";

  if (loading) return <div className="min-h-screen bg-[#08090f] text-white p-8"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">LLM Settings</h1>
      <p className="text-gray-400 mb-8">Global model configuration</p>

      {msg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${msg.ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={save} className="max-w-xl space-y-6">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Default Model</label>
          <input className={input} value={settings.default_model} onChange={(e) => setSettings({ ...settings, default_model: e.target.value })} placeholder="gpt-4o" />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Temperature: {settings.temperature}</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>Precise (0)</span>
            <span>Creative (2)</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Max Tokens</label>
          <input
            type="number"
            className={input}
            value={settings.max_tokens}
            onChange={(e) => setSettings({ ...settings, max_tokens: parseInt(e.target.value) || 0 })}
          />
        </div>

        <div className="flex items-center justify-between bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
          <div>
            <p className="font-medium">Streaming</p>
            <p className="text-sm text-gray-500">Stream responses token by token</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, streaming: !settings.streaming })}
            className={`w-12 h-6 rounded-full transition ${settings.streaming ? "bg-blue-500" : "bg-gray-700"} relative`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${settings.streaming ? "left-6" : "left-0.5"}`} />
          </button>
        </div>

        <button type="submit" disabled={saving} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg transition">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
