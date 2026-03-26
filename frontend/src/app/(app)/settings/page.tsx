"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  CreditCardIcon,
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

interface BetaFeatures {
  pixel_office_enabled: boolean;
}

interface SubscriptionUsage {
  agents: { used: number; limit: number | null };
  tokens: { used: number; limit: number | null };
  storage_gb: { used: number; limit: number | null };
}

interface Subscription {
  plan_name: string;
  status: string;
  current_period_end: string | null;
  usage: SubscriptionUsage | null;
}

type Tab = "profile" | "account" | "workspace" | "billing" | "beta";

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
  const router = useRouter();
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

  // Beta features state
  const [betaFeatures, setBetaFeatures] = useState<BetaFeatures>({
    pixel_office_enabled: false,
  });

  // Billing state
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
        // Load beta features if present
        if (s.beta_features) {
          setBetaFeatures(s.beta_features);
        }
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

  const saveBetaFeatures = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            beta_features: { value: JSON.stringify(betaFeatures), type: "json" }
          }
        }),
      });
      if (!res.ok) throw new Error("Failed to save beta features");
      showToast("Beta features updated");
    } catch (err: any) {
      showToast(err.message || "Error saving", "error");
    } finally {
      setSaving(false);
    }
  };

  const fetchSubscription = async () => {
    setBillingLoading(true);
    try {
      const res = await authFetch("/api/v1/billing/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription || data);
      } else {
        setSubscription(null);
      }
    } catch (err) {
      console.error("Failed to load subscription", err);
      setSubscription(null);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await authFetch("/api/v1/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error("Failed to open billing portal");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error("No portal URL returned");
    } catch (err: any) {
      showToast(err.message || "Error opening billing portal", "error");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch("/api/v1/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignore error, clear locally anyway
    }
    localStorage.removeItem("auth_token");
    router.push("/login");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      showToast("Please type DELETE to confirm", "error");
      return;
    }
    setSaving(true);
    try {
      // This endpoint needs to be implemented
      const res = await authFetch("/api/v1/auth/me", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      localStorage.removeItem("auth_token");
      router.push("/login");
    } catch (err: any) {
      showToast(err.message || "Error deleting account", "error");
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
        <p className="text-sm text-[#9ca3af] mt-1">Manage your profile, workspace, and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg p-1 w-fit">
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
          onClick={() => setTab("account")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            tab === "account" ? "bg-blue-600 text-white" : "text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          }`}
        >
          <ShieldCheckIcon className="w-4 h-4" />
          Account
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
        <button
          onClick={() => { setTab("billing"); fetchSubscription(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            tab === "billing" ? "bg-blue-600 text-white" : "text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          }`}
        >
          <CreditCardIcon className="w-4 h-4" />
          Billing
        </button>
        <button
          onClick={() => setTab("beta")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            tab === "beta" ? "bg-amber-600 text-white" : "text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          }`}
        >
          <SparklesIcon className="w-4 h-4" />
          Beta
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

      {/* Account Tab */}
      {tab === "account" && (
        <div className="space-y-6">
          {/* Logout Card */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Sign Out</h2>
            <p className="text-sm text-[#9ca3af] mb-6">Sign out from your account on this device.</p>
            <button 
              onClick={handleLogout}
              className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          {/* Delete Account Card */}
          <div className="bg-[#14151f] border border-red-500/30 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
            <p className="text-sm text-[#9ca3af] mb-6">
              Once you delete your account, there is no going back. All your data, agents, and configurations will be permanently removed.
            </p>
            
            {!showDeleteConfirm ? (
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="px-5 py-2.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Delete Account
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm text-red-300 mb-2">
                    ⚠️ This action cannot be undone. Type <strong>DELETE</strong> to confirm.
                  </p>
                  <input 
                    type="text" 
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0a0b14] border border-red-500/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Type DELETE"
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                    className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDeleteAccount}
                    disabled={saving || deleteConfirmText !== "DELETE"}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    {saving ? "Deleting…" : "Permanently Delete Account"}
                  </button>
                </div>
              </div>
            )}
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

      {/* Billing Tab */}
      {tab === "billing" && (
        <div className="space-y-6">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Billing & Subscription</h2>
            <p className="text-sm text-[#9ca3af] mb-6">
              Manage your subscription, payment methods, and billing history.
            </p>

            {billingLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : subscription && subscription.status === "active" ? (
              <>
                <div className="bg-[#1f2028] rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-white font-medium">Current Plan</h3>
                      <p className="text-sm text-[#9ca3af] capitalize">{subscription.plan_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-green-600/20 text-green-400 border border-green-500/30 rounded-full text-xs font-medium capitalize">
                        {subscription.status}
                      </span>
                    </div>
                  </div>
                  {subscription.current_period_end && (
                    <p className="text-xs text-[#6b7280] mb-4">
                      Renews {new Date(subscription.current_period_end).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  )}
                  {subscription.usage && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-[#9ca3af]">
                        <span>Agents</span>
                        <span>
                          {subscription.usage.agents.used}
                          {subscription.usage.agents.limit !== null ? ` / ${subscription.usage.agents.limit}` : " / Unlimited"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#9ca3af]">
                        <span>Tokens</span>
                        <span>
                          {subscription.usage.tokens.used.toLocaleString()}
                          {subscription.usage.tokens.limit !== null ? ` / ${subscription.usage.tokens.limit.toLocaleString()}` : " / Unlimited"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#9ca3af]">
                        <span>Storage</span>
                        <span>
                          {subscription.usage.storage_gb.used} GB
                          {subscription.usage.storage_gb.limit !== null ? ` / ${subscription.usage.storage_gb.limit} GB` : " / Unlimited"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    {portalLoading ? "Opening…" : "Manage Subscription"}
                  </button>
                  <button
                    onClick={() => router.push("/billing")}
                    className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    Change Plan
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-[#1f2028] rounded-lg p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-medium">Current Plan</h3>
                    <p className="text-sm text-[#9ca3af]">Free</p>
                  </div>
                  <span className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-xs font-medium">Free tier</span>
                </div>
                <p className="text-sm text-[#9ca3af] mb-5">
                  You're on the Free plan. Upgrade to unlock more agents, tokens, and storage.
                </p>
                <button
                  onClick={() => router.push("/billing")}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Upgrade Plan
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Beta Tab */}
      {tab === "beta" && (
        <div className="space-y-6">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <SparklesIcon className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">Beta Features</h2>
            </div>
            <p className="text-sm text-[#9ca3af] mb-6">
              Try out experimental features before they're released. These features may be unstable and change without notice.
            </p>

            {/* Pixel Office Feature */}
            <div className="bg-[#1f2028] rounded-lg p-5 border border-amber-500/20">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium">🎮 Pixel Office</h3>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">BETA</span>
                  </div>
                  <p className="text-sm text-[#9ca3af] mb-3">
                    Enable the virtual pixel office where your agents appear in a live simulation. 
                    Agents move between rooms, attend meetings, and work on tasks in real-time.
                  </p>
                  <ul className="text-xs text-[#6b7280] space-y-1 mb-4">
                    <li>• Visual representation of your AI team</li>
                    <li>• Real-time agent movements and activities</li>
                    <li>• Meeting rooms and collaboration spaces</li>
                    <li>• ⚠️ May impact browser performance</li>
                  </ul>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={betaFeatures.pixel_office_enabled}
                    onChange={e => setBetaFeatures(prev => ({ ...prev, pixel_office_enabled: e.target.checked }))}
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>
              
              {betaFeatures.pixel_office_enabled && (
                <div className="mt-4 pt-4 border-t border-amber-500/20">
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <CheckCircleIcon className="w-4 h-4" />
                    <span>Pixel Office enabled! Access it from the sidebar.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={saveBetaFeatures} 
                disabled={saving} 
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {saving ? "Saving…" : "Save Beta Preferences"}
              </button>
            </div>
          </div>

          {/* Feedback Card */}
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <h3 className="text-white font-medium mb-2">Feedback</h3>
            <p className="text-sm text-[#9ca3af] mb-4">
              Have feedback on beta features? We'd love to hear from you.
            </p>
            <a 
              href="mailto:feedback@starbox-group.com" 
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Send Feedback
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
