"use client";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    workspace_name: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifications: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetch("/api/v1/settings")
      .then((r) => r.json())
      .then((d) => setSettings((prev) => ({ ...prev, ...d })))
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

  const deleteWorkspace = async () => {
    try {
      await fetch("/api/v1/settings", { method: "DELETE" });
      window.location.href = "/";
    } catch {
      setMsg({ ok: false, text: "Failed to delete workspace" });
    }
  };

  const input =
    "w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition";

  if (loading) return <div className="min-h-screen bg-[#08090f] text-white p-8"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Workspace Settings</h1>
      <p className="text-gray-400 mb-8">Manage your workspace configuration</p>

      {msg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${msg.ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={save} className="max-w-xl space-y-6 mb-12">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Workspace Name</label>
          <input className={input} value={settings.workspace_name} onChange={(e) => setSettings({ ...settings, workspace_name: e.target.value })} placeholder="My Workspace" />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Timezone</label>
          <input className={input} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
        </div>

        <div className="flex items-center justify-between bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
          <div>
            <p className="font-medium">Notifications</p>
            <p className="text-sm text-gray-500">Receive alerts and updates</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
            className={`w-12 h-6 rounded-full transition ${settings.notifications ? "bg-blue-500" : "bg-gray-700"} relative`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${settings.notifications ? "left-6" : "left-0.5"}`} />
          </button>
        </div>

        <button type="submit" disabled={saving} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg transition">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>

      <div className="max-w-xl border border-red-900/50 rounded-xl p-6">
        <h2 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-gray-400 text-sm mb-4">Permanently delete this workspace and all its data. This action cannot be undone.</p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition">
            Delete Workspace
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={deleteWorkspace} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition">
              Confirm Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
