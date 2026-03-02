"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

interface Provider {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

type Tab = "profile" | "workspace";

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
      type === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"
    }`}>
      {type === "success" ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
      {message}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Workspace state
  const [wsName, setWsName] = useState("");
  const [wsDesc, setWsDesc] = useState("");
  const [wsTimezone, setWsTimezone] = useState("UTC");
  const [wsDefaultProvider, setWsDefaultProvider] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);

  const showToast = (message: string, type: "success" | "error" = "success") => setToast({ message, type });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [meRes, settingsRes, providersRes] = await Promise.all([
        authFetch("/api/v1/auth/me"),
        authFetch("/api/v1/settings"),
        authFetch("/api/v1/providers"),
      ]);

      if (meRes.ok) {
        const data = await meRes.json();
        const u = data.user || data;
        setProfile(u);
        setName(u.display_name || "");
        setAvatarUrl(u.avatar_url || "");
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const s = data.settings || {};
        setWsName(s.workspace_name?.value || s.workspace_name || "");
        setWsDesc(s.workspace_description?.value || s.workspace_description || "");
        setWsTimezone(s.timezone?.value || s.timezone || "UTC");
        setWsDefaultProvider(s.default_provider?.value || s.default_provider || "");
      }

      if (providersRes.ok) {
        const data = await providersRes.json();
        setProviders((data.providers || []).filter((p: Provider) => p.is_active));
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/v1/auth/me", {
        method: "PUT",
        body: JSON.stringify({ display_name: name, avatar_url: avatarUrl || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save");
      showToast("Profile saved");
    } catch (err: any) {
      showToast(err.message || "Error saving profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (newPw !== confirmPw) return showToast("Passwords don't match", "error");
    if (newPw.length < 6) return showToast("Password must be at least 6 characters", "error");
    setSaving(true);
    try {
      const res = await authFetch("/api/v1/auth/me/password", {
        method: "PUT",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      showToast("Password changed");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      showToast(err.message || "Error changing password", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveWorkspace = async () => {
    setSaving(true);
    try {
      const settings: Record<string, { value: string; type: string }> = {
        workspace_name: { value: wsName, type: "text" },
        workspace_description: { value: wsDesc, type: "text" },
        timezone: { value: wsTimezone, type: "text" },
        default_provider: { value: wsDefaultProvider, type: "text" },
      };
      const res = await authFetch("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to save workspace settings");
      showToast("Workspace settings saved");
    } catch (err: any) {
      showToast(err.message || "Error saving", "error");
    } finally {
      setSaving(false);
    }
  };

  const timezones = [
    "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Zurich",
    "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Australia/Sydney",
  ];

  const inputClass = "w-full px-3 py-2.5 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-[#6b7280]";
  const labelClass = "block text-sm font-medium text-[#d1d5db] mb-1.5";
  const readonlyClass = "w-full px-3 py-2.5 bg-[#14151f] border border-[rgba(255,255,255,0.05)] rounded-lg text-[#6b7280] text-sm cursor-not-allowed";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Manage your profile and workspace preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("profile")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            tab === "profile" ? "bg-blue-600 text-white" : "text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          }`}
        >
          <UserCircleIcon className="w-4 h-4" />
          Profile
        </button>
        <button
          onClick={() => setTab("workspace")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            tab === "workspace" ? "bg-blue-600 text-white" : "text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          }`}
        >
          <BuildingOfficeIcon className="w-4 h-4" />
          Workspace
        </button>
      </div>

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="space-y-6">
          {/* Profile Info Card */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Profile Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Display Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="Your name" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={profile?.email || ""} readOnly className={readonlyClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Avatar URL</label>
                <input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} className={inputClass} placeholder="https://example.com/avatar.jpg" />
              </div>
              {avatarUrl && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Preview</label>
                  <img src={avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-[rgba(255,255,255,0.1)]" onError={e => (e.currentTarget.style.display = 'none')} />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={saveProfile} disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer">
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Change Password</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={labelClass}>Current Password</label>
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} placeholder="••••••••" />
              </div>
              <div>
                <label className={labelClass}>New Password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} placeholder="••••••••" />
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} placeholder="••••••••" />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={changePassword} disabled={saving || !currentPw || !newPw || !confirmPw} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer">
                {saving ? "Updating…" : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Tab */}
      {tab === "workspace" && (
        <div className="space-y-6">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Workspace Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Workspace Name</label>
                <input type="text" value={wsName} onChange={e => setWsName(e.target.value)} className={inputClass} placeholder="My Workspace" />
              </div>
              <div>
                <label className={labelClass}>Timezone</label>
                <select value={wsTimezone} onChange={e => setWsTimezone(e.target.value)} className={inputClass}>
                  {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea value={wsDesc} onChange={e => setWsDesc(e.target.value)} rows={3} className={inputClass} placeholder="Describe your workspace…" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Default LLM Provider</label>
                <select value={wsDefaultProvider} onChange={e => setWsDefaultProvider(e.target.value)} className={inputClass}>
                  <option value="">— Select a provider —</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.provider})</option>
                  ))}
                </select>
                {providers.length === 0 && (
                  <p className="text-xs text-[#6b7280] mt-1">No active providers found. Configure them in the Providers page.</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={saveWorkspace} disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer">
                {saving ? "Saving…" : "Save Workspace Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
