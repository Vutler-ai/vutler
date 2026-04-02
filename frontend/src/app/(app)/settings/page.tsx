"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import { apiFetch } from "@/lib/api/client";
import { getMe, updateMe, getSettings, updateSettings, updatePassword, getProviders, getApiKeys, createApiKey, revokeApiKey } from "@/lib/api/endpoints/settings";
import { getIntegrations, getAvailableProviders, connect, disconnect } from "@/lib/api/endpoints/integrations";
import type { UserProfile, WorkspaceSettings, Integration, AvailableProvider, Provider, ApiKey, ApiKeyRole } from "@/lib/api/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-top-2 ${
        type === "success"
          ? "bg-green-600/90 text-white"
          : "bg-red-600/90 text-white"
      }`}
    >
      {type === "success" ? "✓" : "✕"} {message}
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const cx = {
  input:
    "bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]",
  label: "text-[#d1d5db]",
  readonly:
    "w-full px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.05)] rounded-md text-[#6b7280] text-sm cursor-not-allowed select-none",
};

function extractArrayField<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object" && value !== null) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) return candidate as T[];
  }
  return [];
}

function extractObjectField<T extends object>(value: unknown, key: string): T | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = (value as Record<string, unknown>)[key];
  if (candidate && typeof candidate === "object") return candidate as T;
  return null;
}

const SHOW_OPEN_SOURCE_SNIPARA_SETTINGS =
  process.env.NEXT_PUBLIC_VUTLER_OPEN_SOURCE === "true";

function normalizeDefaultProviderValue(value: unknown, providers: Provider[]): string {
  const raw = typeof value === "string"
    ? value.trim()
    : (typeof value === "object" && value !== null && "value" in value
        ? String((value as { value?: string }).value || "").trim()
        : "");

  if (!raw) return "";
  const byId = providers.find((provider) => provider.id === raw);
  if (byId) return byId.id;
  const byType = providers.find((provider) => provider.provider === raw);
  return byType?.id || raw;
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  profile,
  onToast,
}: {
  profile: UserProfile | null;
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMe({ display_name: name, avatar_url: avatarUrl || null });
      onToast("Profile saved", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white">Profile Information</CardTitle>
          <CardDescription className="text-[#9ca3af]">
            Update your display name and avatar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className={cx.label}>Display Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={cx.input}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={cx.label}>Email</Label>
              <div className={cx.readonly}>{profile?.email ?? ""}</div>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className={cx.label}>Avatar URL</Label>
              <Input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className={cx.input}
              />
            </div>
          </div>

          {avatarUrl && (
            <div className="space-y-1.5">
              <Label className={cx.label}>Preview</Label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt="Avatar preview"
                className="w-16 h-16 rounded-full object-cover border-2 border-[rgba(255,255,255,0.1)]"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#3b82f6] hover:bg-[#2563eb]"
            >
              {saving ? "Saving…" : "Save Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab({
  onToast,
}: {
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      onToast("All fields are required", "error");
      return;
    }
    if (newPw !== confirmPw) {
      onToast("New passwords don't match", "error");
      return;
    }
    if (newPw.length < 8) {
      onToast("Password must be at least 8 characters", "error");
      return;
    }
    setSaving(true);
    try {
      await updatePassword({ current_password: currentPw, new_password: newPw });
      onToast("Password updated", "success");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to change password", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <CardTitle className="text-white">Change Password</CardTitle>
        <CardDescription className="text-[#9ca3af]">
          Update your account password. You&apos;ll need your current password to confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className={cx.label}>Current Password</Label>
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="••••••••"
              className={cx.input}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={cx.label}>New Password</Label>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="••••••••"
              className={cx.input}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={cx.label}>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="••••••••"
              className={cx.input}
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleChange}
            disabled={saving || !currentPw || !newPw || !confirmPw}
            className="bg-[#3b82f6] hover:bg-[#2563eb]"
          >
            {saving ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Workspace Tab ────────────────────────────────────────────────────────────

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Zurich",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

function WorkspaceTab({
  settings,
  providers,
  onToast,
}: {
  settings: WorkspaceSettings | null;
  providers: Provider[];
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const getStr = (v: unknown): string => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object" && "value" in (v as object)) return (v as { value: string }).value;
    return "";
  };

  const [wsName, setWsName] = useState(getStr(settings?.workspace_name));
  const [wsDesc, setWsDesc] = useState(getStr(settings?.workspace_description));
  const [timezone, setTimezone] = useState(getStr(settings?.timezone) || "UTC");
  const [defaultProvider, setDefaultProvider] = useState(
    normalizeDefaultProviderValue(settings?.default_provider, providers)
  );
  const [driveRoot, setDriveRoot] = useState(getStr(settings?.drive_root) || "/projects/Vutler");
  const [sniparaKey, setSniparaKey] = useState(getStr((settings as Record<string, unknown>)?.snipara_api_key));
  const [sniparaProjectId, setSniparaProjectId] = useState(getStr((settings as Record<string, unknown>)?.snipara_project_id));
  const [sniparaProjectSlug, setSniparaProjectSlug] = useState(getStr((settings as Record<string, unknown>)?.snipara_project_slug));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setWsName(getStr(settings.workspace_name));
      setWsDesc(getStr(settings.workspace_description));
      setTimezone(getStr(settings.timezone) || "UTC");
      setDefaultProvider(normalizeDefaultProviderValue(settings.default_provider, providers));
      setDriveRoot(getStr(settings.drive_root) || "/projects/Vutler");
      setSniparaKey(getStr((settings as Record<string, unknown>)?.snipara_api_key));
      setSniparaProjectId(getStr((settings as Record<string, unknown>)?.snipara_project_id));
      setSniparaProjectSlug(getStr((settings as Record<string, unknown>)?.snipara_project_slug));
    }
  }, [settings, providers]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: { settings: Record<string, unknown>; [key: string]: unknown } = {
        settings: {
          workspace_name: { value: wsName, type: "text" },
          workspace_description: { value: wsDesc, type: "text" },
          timezone: { value: timezone, type: "text" },
          default_provider: { value: defaultProvider, type: "text" },
          drive_root: { value: driveRoot, type: "text" },
        },
        default_provider: defaultProvider,
      };
      if (SHOW_OPEN_SOURCE_SNIPARA_SETTINGS) {
        // Only send Snipara fields if they contain real values (not masked)
        if (sniparaKey && !sniparaKey.includes("••")) {
          payload.snipara_api_key = sniparaKey;
        }
        if (sniparaProjectId) {
          payload.snipara_project_id = sniparaProjectId;
        }
        if (sniparaProjectSlug) {
          payload.snipara_project_slug = sniparaProjectSlug;
        }
      }
      await updateSettings(payload);
      onToast("Workspace settings saved", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <CardTitle className="text-white">Workspace Settings</CardTitle>
        <CardDescription className="text-[#9ca3af]">
          Configure workspace defaults used when agents and tasks do not override them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className={cx.label}>Workspace Name</Label>
            <Input
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="My Workspace"
              className={cx.input}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={cx.label}>Timezone</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full h-9 px-3 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz} className="bg-[#1f2028]">
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className={cx.label}>Description</Label>
            <textarea
              value={wsDesc}
              onChange={(e) => setWsDesc(e.target.value)}
              rows={3}
              placeholder="Describe your workspace…"
              className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] resize-none"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className={cx.label}>Default LLM Provider</Label>
            <select
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.target.value)}
              className="w-full h-9 px-3 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            >
              <option value="" className="bg-[#1f2028]">
                — Select a provider —
              </option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#1f2028]">
                  {p.name} ({p.provider})
                </option>
              ))}
            </select>
            <p className="text-xs text-[#6b7280]">
              Used as the fallback connection when no provider is explicitly set on the agent.
            </p>
            {providers.length === 0 && (
              <p className="text-xs text-[#6b7280]">
                No active providers. Configure them in the Providers page.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className={cx.label}>Drive Root</Label>
            <Input
              value={driveRoot}
              onChange={(e) => setDriveRoot(e.target.value)}
              placeholder="/projects/Vutler"
              className={cx.input}
            />
          </div>
        </div>

        <div className="border-t border-[rgba(255,255,255,0.07)] pt-5 mt-2">
          <h3 className="text-white text-sm font-medium mb-1">Snipara</h3>
          {SHOW_OPEN_SOURCE_SNIPARA_SETTINGS ? (
            <>
              <p className="text-[#6b7280] text-xs mb-3">
                Manual Snipara configuration is only needed for the open-source deployment.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className={cx.label}>API Key</Label>
                  <Input
                    type="password"
                    value={sniparaKey}
                    onChange={(e) => setSniparaKey(e.target.value)}
                    placeholder="rlm_..."
                    className={cx.input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={cx.label}>Project ID</Label>
                  <Input
                    value={sniparaProjectId}
                    onChange={(e) => setSniparaProjectId(e.target.value)}
                    placeholder="cmmf..."
                    className={cx.input}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className={cx.label}>Project Slug</Label>
                  <Input
                    value={sniparaProjectSlug}
                    onChange={(e) => setSniparaProjectSlug(e.target.value)}
                    placeholder="vutler"
                    className={cx.input}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.08)] px-4 py-3">
              <p className="text-sm text-white">Snipara is provisioned automatically on Vutler Cloud.</p>
              <p className="text-xs text-[#9ca3af] mt-1">
                No manual setup is required here. The editable Snipara section is reserved for the open-source edition.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#3b82f6] hover:bg-[#2563eb]"
          >
            {saving ? "Saving…" : "Save Workspace Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab({
  onToast,
}: {
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const { data: integrations, isLoading: loadingIntegrations, mutate: mutateIntegrations } =
    useApi<Integration[]>("/api/v1/integrations", getIntegrations);

  const { data: available, isLoading: loadingAvailable } =
    useApi<AvailableProvider[]>("/api/v1/integrations/available", getAvailableProviders);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const connectedSet = new Set((integrations ?? []).filter((i) => i.connected).map((i) => i.provider));

  const handleConnect = async (provider: string) => {
    setActionLoading(provider);
    try {
      const res = await connect(provider);
      if (res.url) {
        window.location.href = res.url;
      } else {
        await mutateIntegrations();
        onToast(`${provider} connected`, "success");
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to connect", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setActionLoading(provider);
    try {
      await disconnect(provider);
      await mutateIntegrations();
      onToast(`${provider} disconnected`, "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to disconnect", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const isLoading = loadingIntegrations || loadingAvailable;
  const providers = available ?? [];

  // Merge available with connected status
  const merged = providers.map((p) => ({
    ...p,
    connected: connectedSet.has(p.provider),
    integration: (integrations ?? []).find((i) => i.provider === p.provider),
  }));

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <CardTitle className="text-white">Integrations</CardTitle>
        <CardDescription className="text-[#9ca3af]">
          Connect external services to extend your agents&apos; capabilities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl bg-[#1f2028]" />
            ))}
          </div>
        ) : merged.length === 0 ? (
          <p className="text-[#6b7280] text-sm">No integrations available.</p>
        ) : (
          <div className="space-y-3">
            {merged.map((p) => (
              <div
                key={p.provider}
                className="flex items-center justify-between gap-4 p-4 bg-[#1f2028] border border-[rgba(255,255,255,0.05)] rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ background: p.color || "#374151" }}
                  >
                    {p.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.icon} alt={p.name} className="w-5 h-5 object-contain" />
                    ) : (
                      p.name.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{p.name}</p>
                    <p className="text-[#6b7280] text-xs truncate">{p.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {p.connected && (
                    <Badge
                      variant="outline"
                      className="border-green-500/30 text-green-400 bg-green-500/10 text-xs"
                    >
                      Connected
                    </Badge>
                  )}
                  {p.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(p.provider)}
                      disabled={actionLoading === p.provider}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      {actionLoading === p.provider ? "…" : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(p.provider)}
                      disabled={actionLoading === p.provider}
                      className="bg-[#3b82f6] hover:bg-[#2563eb]"
                    >
                      {actionLoading === p.provider ? "…" : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────

const ROLES: { value: ApiKeyRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full access to all APIs" },
  { value: "developer", label: "Developer", description: "Read/write access, no billing" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

function roleBadgeClass(role?: string) {
  if (role === "admin") return "border-purple-500/40 text-purple-400 bg-purple-500/10";
  if (role === "viewer") return "border-gray-500/40 text-gray-400 bg-gray-500/10";
  return "border-blue-500/40 text-blue-400 bg-blue-500/10";
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ApiKeysTab({ onToast }: { onToast: (msg: string, type: "success" | "error") => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState<ApiKeyRole>("developer");
  const [generating, setGenerating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Revoke confirm state
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Masked copy feedback
  const [copiedMasked, setCopiedMasked] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApiKeys();
      setKeys(res.keys ?? []);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to load API keys", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const openDialog = () => {
    setNewKeyName("");
    setNewKeyRole("developer");
    setRevealedSecret(null);
    setCopiedSecret(false);
    setShowDialog(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const handleGenerate = async () => {
    if (!newKeyName.trim()) { onToast("Key name is required", "error"); return; }
    setGenerating(true);
    try {
      const res = await createApiKey(newKeyName.trim(), newKeyRole);
      setRevealedSecret(res.secret);
      await fetchKeys();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to generate key", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopySecret = async () => {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      onToast("Copy failed — please select and copy manually", "error");
    }
  };

  const handleCopyMasked = (keyId: string) => {
    onToast("Key is masked. Generate a new one to get the full key.", "error");
    setCopiedMasked(keyId);
    setTimeout(() => setCopiedMasked(null), 2500);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeApiKey(revokeTarget.id);
      onToast(`Key "${revokeTarget.name}" revoked`, "success");
      setRevokeTarget(null);
      await fetchKeys();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to revoke key", "error");
    } finally {
      setRevoking(false);
    }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => !!k.revoked_at);

  return (
    <div className="space-y-6">
      {/* Generate dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h3 className="text-white text-lg font-semibold mb-1">Generate New API Key</h3>
              <p className="text-[#9ca3af] text-sm mb-5">The full key is shown only once after generation.</p>

              {!revealedSecret ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm text-[#d1d5db]">Key Name</label>
                    <input
                      ref={nameRef}
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. CLI key, MCP server, Nexus"
                      className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
                      onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-[#d1d5db]">Role</label>
                    <div className="space-y-2">
                      {ROLES.map((r) => (
                        <label
                          key={r.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            newKeyRole === r.value
                              ? "border-[#3b82f6] bg-[#3b82f6]/10"
                              : "border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={r.value}
                            checked={newKeyRole === r.value}
                            onChange={() => setNewKeyRole(r.value)}
                            className="mt-0.5 accent-[#3b82f6]"
                          />
                          <div>
                            <p className="text-white text-sm font-medium">{r.label}</p>
                            <p className="text-[#6b7280] text-xs">{r.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowDialog(false)}
                      className="px-4 py-2 text-sm text-[#9ca3af] border border-[rgba(255,255,255,0.1)] rounded-lg hover:text-white hover:bg-[#1f2028] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating || !newKeyName.trim()}
                      className="px-4 py-2 text-sm bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {generating ? "Generating…" : "Generate Key"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-amber-300 text-sm font-medium mb-1">Save this key — you won&apos;t see it again</p>
                    <p className="text-amber-200/70 text-xs">Store it in a secure location such as a password manager or secret vault.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-[#d1d5db]">Your new API key</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={revealedSecret}
                        className="flex-1 px-3 py-2 bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-md text-green-400 text-xs font-mono focus:outline-none select-all"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={handleCopySecret}
                        className={`shrink-0 px-3 py-2 text-sm rounded-md border transition-colors ${
                          copiedSecret
                            ? "border-green-500/50 text-green-400 bg-green-500/10"
                            : "border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
                        }`}
                      >
                        {copiedSecret ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowDialog(false)}
                      className="px-4 py-2 text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm dialog */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#14151f] border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-white text-lg font-semibold mb-2">Revoke API Key</h3>
            <p className="text-[#9ca3af] text-sm mb-5">
              Are you sure you want to revoke{" "}
              <span className="text-white font-medium">&quot;{revokeTarget.name}&quot;</span>?
              Any applications using it will immediately lose access.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="px-4 py-2 text-sm text-[#9ca3af] border border-[rgba(255,255,255,0.1)] rounded-lg hover:text-white hover:bg-[#1f2028] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                disabled={revoking}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {revoking ? "Revoking…" : "Revoke Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white">API Keys</CardTitle>
              <CardDescription className="text-[#9ca3af]">
                Manage programmatic access keys for your workspace.
              </CardDescription>
            </div>
            <Button onClick={openDialog} className="bg-[#3b82f6] hover:bg-[#2563eb] shrink-0">
              Generate New Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl bg-[#1f2028]" />
              ))}
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[#6b7280] text-sm">No active API keys.</p>
              <p className="text-[#4b5563] text-xs mt-1">Generate your first key to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-4 p-4 bg-[#1f2028] border border-[rgba(255,255,255,0.05)] rounded-xl"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-white text-sm font-medium">{k.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${roleBadgeClass(k.role)}`}
                      >
                        {k.role ?? "developer"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs border-green-500/30 text-green-400 bg-green-500/10"
                      >
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <code className="text-[#6b7280] text-xs font-mono bg-[#0a0b14] px-2 py-0.5 rounded">
                        {k.key_prefix}
                      </code>
                      <span className="text-[#4b5563] text-xs">Created {formatDate(k.created_at)}</span>
                      {k.last_used_at && (
                        <span className="text-[#4b5563] text-xs">Last used {formatDate(k.last_used_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyMasked(k.id)}
                      className={`border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#14151f] text-xs ${
                        copiedMasked === k.id ? "border-amber-500/40 text-amber-400" : ""
                      }`}
                    >
                      {copiedMasked === k.id ? "Masked" : "Copy"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeTarget(k)}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {revokedKeys.length > 0 && (
            <div className="mt-6">
              <p className="text-xs text-[#4b5563] font-medium uppercase tracking-wide mb-3">Revoked Keys</p>
              <div className="space-y-2">
                {revokedKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between gap-4 p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.03)] rounded-xl opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[#6b7280] text-sm line-through">{k.name}</span>
                        <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10">
                          Revoked
                        </Badge>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <code className="text-[#4b5563] text-xs font-mono">{k.key_prefix}</code>
                        <span className="text-[#4b5563] text-xs">Revoked {formatDate(k.revoked_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white text-base">Using Your API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-[#9ca3af] text-sm font-medium">REST API</p>
            <p className="text-[#6b7280] text-xs">Use either header format:</p>
            <pre className="bg-[#0a0b14] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 text-xs text-[#6b7280] font-mono overflow-x-auto">
              {`# Bearer token
curl https://app.vutler.ai/api/v1/agents \\
  -H "Authorization: Bearer vt_your_key_here"

# X-API-Key header
curl https://app.vutler.ai/api/v1/agents \\
  -H "X-API-Key: vt_your_key_here"`}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-[#9ca3af] text-sm font-medium">MCP Integration (Claude Desktop, Cursor, Claude Code)</p>
            <p className="text-[#6b7280] text-xs">Add to your <code className="text-purple-400">.mcp.json</code> to connect AI tools to your Vutler workspace:</p>
            <pre className="bg-[#0a0b14] border border-purple-500/10 rounded-lg p-4 text-xs text-purple-300/70 font-mono overflow-x-auto">
              {`{
  "mcpServers": {
    "vutler": {
      "command": "npx",
      "args": ["-y", "@vutler/mcp"],
      "env": {
        "VUTLER_API_URL": "https://app.vutler.ai",
        "VUTLER_API_KEY": "vt_your_key_here"
      }
    }
  }
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Account Tab (danger zone) ────────────────────────────────────────────────

function AccountTab({
  onToast,
}: {
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleLogout = async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    localStorage.removeItem("vutler_auth_token");
    router.push("/login");
  };

  const handleDelete = async () => {
    if (deleteText !== "DELETE") {
      onToast("Type DELETE to confirm", "error");
      return;
    }
    setDeleting(true);
    try {
      await apiFetch("/api/v1/auth/me", { method: "DELETE" });
      localStorage.removeItem("vutler_auth_token");
      router.push("/login");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white">Sign Out</CardTitle>
          <CardDescription className="text-[#9ca3af]">
            Sign out of your account on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-[#14151f] border-red-500/30">
        <CardHeader>
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription className="text-[#9ca3af]">
            Permanently delete your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showDelete ? (
            <Button
              variant="outline"
              onClick={() => setShowDelete(true)}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              Delete Account
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-sm text-red-300 mb-3">
                  This will permanently delete your account. Type{" "}
                  <strong>DELETE</strong> to confirm.
                </p>
                <Input
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE"
                  className="bg-[#0a0b14] border-red-500/50 text-white placeholder-[#6b7280] focus-visible:ring-red-500"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setShowDelete(false); setDeleteText(""); }}
                  className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleting || deleteText !== "DELETE"}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleting ? "Deleting…" : "Permanently Delete"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Email & Domains Tab ─────────────────────────────────────────────────────

interface EmailDomain { id: string; domain: string; verification: { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean; fullyVerified: boolean }; dnsRecords: Record<string, { type: string; host: string; value: string; priority?: number; description?: string }>; createdAt: string }
interface EmailRoute { id: string; emailAddress: string; agentId: string; agentName: string; agentUsername: string; agentAvatar?: string; autoReply: boolean; approvalRequired: boolean }
interface EmailGroupItem { id: string; name: string; emailAddress: string; description?: string; memberCount: number; members?: { id: string; memberType: 'agent' | 'human'; agentId?: string; agentName?: string; humanEmail?: string; humanName?: string }[] }
interface AgentItem { id: string; name: string; username: string; email?: string }

function isEmailGroupItem(value: unknown): value is EmailGroupItem {
  return typeof value === "object" && value !== null && "id" in value && "name" in value && "emailAddress" in value;
}

function CopyInlineButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[10px] uppercase tracking-wide text-[#60a5fa] hover:text-[#93c5fd]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DomainDnsRecord({
  label,
  record,
  verified,
}: {
  label: string;
  record: { type: string; host: string; value: string; priority?: number; description?: string };
  verified: boolean;
}) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#14151f] p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-[11px] text-[#6b7280]">{record.description || "DNS record required for email delivery."}</p>
        </div>
        <Badge
          variant="outline"
          className={verified
            ? "border-green-500/30 text-green-400 bg-green-500/10"
            : "border-amber-500/30 text-amber-400 bg-amber-500/10"}
        >
          {verified ? "Verified" : "Pending"}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-[110px_1fr] sm:items-start">
        <span className="text-[11px] uppercase tracking-wide text-[#6b7280]">Type / Host</span>
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#1f2028] px-2.5 py-2">
          <code className="text-xs text-white">{record.type}</code>
          <span className="text-[#4b5563]">•</span>
          <code className="text-xs text-white">{record.host}</code>
          <CopyInlineButton value={`${record.type} ${record.host}`} />
        </div>

        <span className="text-[11px] uppercase tracking-wide text-[#6b7280]">Value</span>
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[#1f2028] px-2.5 py-2">
          <code className="text-xs break-all text-white">{record.value}</code>
          <CopyInlineButton value={record.value} />
        </div>

        {typeof record.priority === "number" && (
          <>
            <span className="text-[11px] uppercase tracking-wide text-[#6b7280]">Priority</span>
            <div className="rounded-md bg-[#1f2028] px-2.5 py-2">
              <code className="text-xs text-white">{record.priority}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmailTab({ onToast }: { onToast: (msg: string, type: "success" | "error") => void }) {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [routes, setRoutes] = useState<EmailRoute[]>([]);
  const [groups, setGroups] = useState<EmailGroupItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);

  // Domain form
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  // Route form
  const [newRouteAgentId, setNewRouteAgentId] = useState('');
  const [newRoutePrefix, setNewRoutePrefix] = useState('');
  const [addingRoute, setAddingRoute] = useState(false);

  // Group form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrefix, setNewGroupPrefix] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newMemberAgentId, setNewMemberAgentId] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, rRes, gRes, aRes] = await Promise.allSettled([
        apiFetch<{ domains?: EmailDomain[] }>('/api/v1/email/domains'),
        apiFetch<{ routes?: EmailRoute[] }>('/api/v1/email/routes'),
        apiFetch<{ groups?: EmailGroupItem[] } | EmailGroupItem[]>('/api/v1/email/groups'),
        apiFetch<{ agents?: AgentItem[] } | AgentItem[]>('/api/v1/agents'),
      ]);
      if (dRes.status === 'fulfilled') setDomains(Array.isArray(dRes.value?.domains) ? dRes.value.domains : []);
      if (rRes.status === 'fulfilled') setRoutes(Array.isArray(rRes.value?.routes) ? rRes.value.routes : []);
      if (gRes.status === 'fulfilled') setGroups(extractArrayField<EmailGroupItem>(gRes.value, 'groups'));
      if (aRes.status === 'fulfilled') setAgents(extractArrayField<AgentItem>(aRes.value, 'agents'));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    try {
      await apiFetch('/api/v1/email/domains', { method: 'POST', body: JSON.stringify({ domain: newDomain.trim() }) });
      setNewDomain('');
      onToast('Domain added', 'success');
      load();
    } catch { onToast('Failed to add domain', 'error'); }
    setAddingDomain(false);
  };

  const verifyDomain = async (id: string) => {
    setVerifyingDomainId(id);
    try {
      const data = await apiFetch<{ verification?: { fullyVerified?: boolean } }>(`/api/v1/email/domains/${id}/verify`, { method: 'POST' });
      onToast(data.verification?.fullyVerified ? 'All records verified!' : 'Some records still missing', data.verification?.fullyVerified ? 'success' : 'error');
      load();
    } catch { onToast('Verification failed', 'error'); }
    setVerifyingDomainId(null);
  };

  const deleteDomain = async (id: string) => {
    if (!confirm('Remove this domain?')) return;
    try { await apiFetch(`/api/v1/email/domains/${id}`, { method: 'DELETE' }); load(); } catch { /* silent */ }
  };

  const addRoute = async () => {
    if (!newRouteAgentId || !newRoutePrefix.trim()) return;
    setAddingRoute(true);
    try {
      await apiFetch('/api/v1/email/routes', { method: 'POST', body: JSON.stringify({ agent_id: newRouteAgentId, email_prefix: newRoutePrefix.trim() }) });
      setNewRouteAgentId(''); setNewRoutePrefix('');
      onToast('Email route created', 'success');
      load();
    } catch { onToast('Failed to create route', 'error'); }
    setAddingRoute(false);
  };

  const deleteRoute = async (id: string) => {
    if (!confirm('Remove this email route?')) return;
    try { await apiFetch(`/api/v1/email/routes/${id}`, { method: 'DELETE' }); load(); } catch { /* silent */ }
  };

  const addGroup = async () => {
    if (!newGroupName.trim() || !newGroupPrefix.trim()) return;
    setAddingGroup(true);
    try {
      await apiFetch('/api/v1/email/groups', { method: 'POST', body: JSON.stringify({ name: newGroupName.trim(), email_prefix: newGroupPrefix.trim() }) });
      setNewGroupName(''); setNewGroupPrefix('');
      onToast('Group created', 'success');
      load();
    } catch { onToast('Failed to create group', 'error'); }
    setAddingGroup(false);
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this email group?')) return;
    try { await apiFetch(`/api/v1/email/groups/${id}`, { method: 'DELETE' }); load(); } catch { /* silent */ }
  };

  const toggleGroupExpand = async (groupId: string) => {
    if (expandedGroupId === groupId) { setExpandedGroupId(null); return; }
    setExpandedGroupId(groupId);
    try {
      const data = await apiFetch<{ group?: EmailGroupItem } | EmailGroupItem>(`/api/v1/email/groups/${groupId}`);
      const group = extractObjectField<EmailGroupItem>(data, 'group') || (isEmailGroupItem(data) ? data : null);
      const members = Array.isArray(group?.members) ? group.members : [];
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, members } : g));
    } catch { /* silent */ }
  };

  const addMember = async (groupId: string, type: 'agent' | 'human') => {
    const body = type === 'agent' ? { member_type: 'agent', agent_id: newMemberAgentId } : { member_type: 'human', email: newMemberEmail.trim() };
    try {
      await apiFetch(`/api/v1/email/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify(body) });
      setNewMemberAgentId(''); setNewMemberEmail('');
      toggleGroupExpand(''); toggleGroupExpand(groupId); // reload members
      load();
    } catch { /* silent */ }
  };

  const removeMember = async (groupId: string, memberId: string) => {
    try { await apiFetch(`/api/v1/email/groups/${groupId}/members/${memberId}`, { method: 'DELETE' }); toggleGroupExpand(''); toggleGroupExpand(groupId); load(); } catch { /* silent */ }
  };

  const handleAgentSelect = (agentId: string) => {
    setNewRouteAgentId(agentId);
    const agent = agents.find(a => a.id === agentId);
    if (agent) setNewRoutePrefix(agent.username);
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-[#14151f]" />)}</div>;

  const sectionCx = "bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-6";
  const inputCx = "px-3 py-2.5 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]";
  const btnDanger = "px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors";
  const btnGhost = "px-3 py-1.5 text-xs bg-[#1f2028] hover:bg-[#334155] rounded-lg transition-colors text-[#9ca3af]";

  return (
    <div className="space-y-8">
      {/* ── Custom Domains ─────────────────────────────────────── */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white">Custom Domains</CardTitle>
          <CardDescription>Use your own domain for agent emails (e.g. <span className="font-mono text-white">jarvis@yourcompany.com</span>)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDomain()} placeholder="yourcompany.com" className={cx.input} />
            <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()} className="bg-[#3b82f6] hover:bg-[#2563eb] sm:shrink-0">{addingDomain ? 'Adding…' : 'Add Domain'}</Button>
          </div>
          {domains.length === 0 ? (
            <p className="text-sm text-[#6b7280]">No custom domains. Agents use <span className="font-mono">workspace.vutler.ai</span>.</p>
          ) : domains.map(d => (
            <div key={d.id} className={sectionCx + " space-y-3"}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{d.domain}</p>
                  <div className="flex gap-3 mt-1">{(['mx','spf','dkim','dmarc'] as const).map(k => (
                    <span key={k} className="flex items-center gap-1 text-xs"><span className={`w-2 h-2 rounded-full ${d.verification[k] ? 'bg-green-400' : 'bg-red-400'}`} /><span className="text-[#9ca3af] uppercase">{k}</span></span>
                  ))}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExpandedDomains((prev) => ({ ...prev, [d.id]: !(prev[d.id] ?? !d.verification.fullyVerified) }))}
                    className={btnGhost}
                  >
                    {(expandedDomains[d.id] ?? !d.verification.fullyVerified) ? 'Hide DNS' : 'DNS help'}
                  </button>
                  <button
                    onClick={() => verifyDomain(d.id)}
                    className={btnGhost}
                    disabled={verifyingDomainId === d.id}
                  >
                    {verifyingDomainId === d.id ? 'Checking…' : 'Verify DNS'}
                  </button>
                  <button onClick={() => deleteDomain(d.id)} className={btnDanger}>Remove</button>
                </div>
              </div>
              <p className="text-xs text-[#6b7280]">
                Add the MX, SPF, DKIM, and DMARC records below in your DNS provider. If a record stays pending, double-check the host, the value, and the MX priority.
              </p>
              {(expandedDomains[d.id] ?? !d.verification.fullyVerified) && (
                <div className="space-y-3">
                  <div className="grid gap-3">
                    {([
                      ["mx", "MX"],
                      ["spf", "SPF"],
                      ["dkim", "DKIM"],
                      ["dmarc", "DMARC"],
                    ] as const).map(([key, label]) => {
                      const record = d.dnsRecords?.[key];
                      if (!record) return null;
                      return (
                        <DomainDnsRecord
                          key={key}
                          label={label}
                          record={record}
                          verified={Boolean(d.verification[key])}
                        />
                      );
                    })}
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#111827] px-3 py-3 text-xs text-[#9ca3af] space-y-1">
                    <p>DNS troubleshooting:</p>
                    <p>Use <span className="font-mono text-white">@</span> for the root domain if your DNS provider asks for a host. Some providers expect the host field to be left empty instead.</p>
                    <p>You must keep a single SPF TXT record per domain. If you already have one, merge the new <span className="font-mono text-white">include:</span> value instead of creating a second SPF record.</p>
                    <p>MX changes are not instant. It can work in a few minutes, but full propagation can still take up to 48 hours.</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Agent Email Routes ─────────────────────────────────── */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white">Agent Email Addresses</CardTitle>
          <CardDescription>Assign emails to agents. Incoming mail will be routed to them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <select value={newRouteAgentId} onChange={e => handleAgentSelect(e.target.value)} className={inputCx + " flex-1 min-w-[180px]"}>
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} (@{a.username})</option>)}
            </select>
            <Input value={newRoutePrefix} onChange={e => setNewRoutePrefix(e.target.value)} placeholder="email-prefix" className={cx.input + " flex-1 min-w-[140px]"} />
            <Button onClick={addRoute} disabled={addingRoute || !newRouteAgentId || !newRoutePrefix.trim()} className="bg-[#3b82f6] hover:bg-[#2563eb]">{addingRoute ? 'Assigning…' : 'Assign'}</Button>
          </div>
          <p className="text-xs text-[#6b7280]">Address: <span className="font-mono text-[#9ca3af]">prefix@your-domain-or-workspace.vutler.ai</span></p>
          {routes.length === 0 ? (
            <p className="text-sm text-[#6b7280]">No agent email addresses assigned.</p>
          ) : routes.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-[#1f2028]">
              <div>
                <p className="text-sm font-medium text-white">{r.agentName || r.agentUsername}</p>
                <p className="text-xs font-mono text-[#3b82f6]">{r.emailAddress}</p>
                <div className="flex gap-3 mt-0.5">
                  <span className={`text-[10px] ${r.autoReply ? 'text-green-400' : 'text-[#6b7280]'}`}>{r.autoReply ? 'Auto-reply on' : 'Auto-reply off'}</span>
                  <span className={`text-[10px] ${r.approvalRequired ? 'text-yellow-400' : 'text-green-400'}`}>{r.approvalRequired ? 'Needs approval' : 'Auto-send'}</span>
                </div>
              </div>
              <button onClick={() => deleteRoute(r.id)} className={btnDanger}>Remove</button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Email Groups ─────────────────────────────────────── */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white">Email Groups</CardTitle>
          <CardDescription>Shared addresses (e.g. <span className="font-mono text-white">info@yourcompany.com</span>) with multiple agents or team members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" className={cx.input + " flex-1 min-w-[180px]"} />
            <Input value={newGroupPrefix} onChange={e => setNewGroupPrefix(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGroup()} placeholder="email prefix (e.g. info)" className={cx.input + " flex-1 min-w-[140px]"} />
            <Button onClick={addGroup} disabled={addingGroup || !newGroupName.trim() || !newGroupPrefix.trim()} className="bg-[#3b82f6] hover:bg-[#2563eb]">{addingGroup ? 'Creating…' : 'Create Group'}</Button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-[#6b7280]">No email groups created.</p>
          ) : groups.map(g => (
            <div key={g.id} className="rounded-lg bg-[#1f2028] overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium text-white">{g.name}</p>
                  <p className="text-xs font-mono text-[#3b82f6]">{g.emailAddress}</p>
                  <p className="text-[10px] text-[#6b7280] mt-0.5">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleGroupExpand(g.id)} className={btnGhost}>{expandedGroupId === g.id ? 'Hide' : 'Manage'}</button>
                  <button onClick={() => deleteGroup(g.id)} className={btnDanger}>Delete</button>
                </div>
              </div>
              {expandedGroupId === g.id && (
                <div className="px-3 pb-3 border-t border-[rgba(255,255,255,0.05)] pt-3 space-y-2">
                  {g.members && g.members.length > 0 ? g.members.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 px-2 bg-[#14151f] rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={m.memberType === 'agent' ? 'bg-violet-900/40 text-violet-300 border-none text-[10px]' : 'bg-blue-900/40 text-blue-300 border-none text-[10px]'}>{m.memberType}</Badge>
                        <span className="text-white">{m.memberType === 'agent' ? m.agentName : (m.humanName || m.humanEmail)}</span>
                      </div>
                      <button onClick={() => removeMember(g.id, m.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  )) : <p className="text-xs text-[#6b7280]">No members yet.</p>}
                  <div className="flex gap-2">
                    <select value={newMemberAgentId} onChange={e => setNewMemberAgentId(e.target.value)} className={inputCx + " flex-1"}>
                      <option value="">Add agent…</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <Button onClick={() => addMember(g.id, 'agent')} disabled={!newMemberAgentId} size="sm" className="bg-[#3b82f6] hover:bg-[#2563eb]">Add</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && newMemberEmail.trim() && addMember(g.id, 'human')} placeholder="human@email.com" className={cx.input + " flex-1"} />
                    <Button onClick={() => addMember(g.id, 'human')} disabled={!newMemberEmail.trim()} size="sm" className="bg-[#3b82f6] hover:bg-[#2563eb]">Add</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => setToast({ message, type }),
    []
  );

  // Fetch data up front
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, s, p] = await Promise.all([getMe(), getSettings(), getProviders()]);
        setProfile(me);
        setSettings(s.settings);
        setProviders(p.filter((pr) => pr.is_active));
      } catch {
        // non-fatal — individual sections handle their own state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-[#9ca3af] mt-1">
          Manage your profile, security, workspace, and API keys.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-[#14151f]" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] p-1 h-auto flex flex-wrap gap-1">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              Security
            </TabsTrigger>
            <TabsTrigger
              value="workspace"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              Workspace
            </TabsTrigger>
            <TabsTrigger
              value="api-keys"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              API Keys
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              Account
            </TabsTrigger>
            <TabsTrigger
              value="email"
              className="data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white text-[#9ca3af]"
            >
              Email &amp; Domains
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab profile={profile} onToast={showToast} />
          </TabsContent>

          <TabsContent value="security">
            <SecurityTab onToast={showToast} />
          </TabsContent>

          <TabsContent value="workspace">
            <WorkspaceTab settings={settings} providers={providers} onToast={showToast} />
          </TabsContent>

          <TabsContent value="api-keys">
            <ApiKeysTab onToast={showToast} />
          </TabsContent>

          <TabsContent value="account">
            <AccountTab onToast={showToast} />
          </TabsContent>

          <TabsContent value="email">
            <EmailTab onToast={showToast} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
