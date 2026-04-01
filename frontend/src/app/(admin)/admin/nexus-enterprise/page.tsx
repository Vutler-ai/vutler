"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/api/client";
import type {
  NexusEnterpriseEventSubscription,
  NexusEnterpriseEventSubscriptionProvider,
  NexusEnterpriseProvisioningMode,
} from "@/lib/api/types";
import { RefreshCcw, Copy, RadioTower, Loader2 } from "lucide-react";

const PROVIDERS: Array<{ value: "all" | NexusEnterpriseEventSubscriptionProvider; label: string }> = [
  { value: "all", label: "All providers" },
  { value: "microsoft_graph", label: "Microsoft Graph" },
  { value: "zoom", label: "Zoom" },
  { value: "google", label: "Google" },
  { value: "generic_http", label: "Generic HTTP" },
];

const PROVISIONING_STATES = [
  { value: "all", label: "All states" },
  { value: "manual_required", label: "Manual required" },
  { value: "assisted_required", label: "Assisted required" },
  { value: "pending", label: "Pending" },
  { value: "provisioned", label: "Provisioned" },
  { value: "failed", label: "Failed" },
] as const;

function formatProviderLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string): string {
  if (status === "provisioned") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (status === "pending") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (status === "failed") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (status === "assisted_required") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-slate-500/10 text-slate-300 border-slate-500/20";
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch (_) {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111827] hover:bg-[#172033] text-xs text-slate-200 transition-colors"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : label}
    </button>
  );
}

export default function AdminNexusEnterprisePage() {
  const [subscriptions, setSubscriptions] = useState<NexusEnterpriseEventSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<"all" | NexusEnterpriseEventSubscriptionProvider>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (stateFilter !== "all") params.set("provisioningStatus", stateFilter);
      if (workspaceFilter.trim()) params.set("workspaceId", workspaceFilter.trim());
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await adminFetch<{ success: boolean; data: NexusEnterpriseEventSubscription[] }>(
        `/api/v1/admin/nexus-enterprise/event-subscriptions${suffix}`
      );
      setSubscriptions(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Nexus Enterprise subscriptions");
    } finally {
      setLoading(false);
    }
  }, [providerFilter, stateFilter, workspaceFilter]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const stats = useMemo(() => {
    return subscriptions.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.provisioningStatus] = (acc[item.provisioningStatus] || 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [subscriptions]);

  const patchSubscription = async (
    subscription: NexusEnterpriseEventSubscription,
    patch: {
      status?: string;
      provisioningMode?: NexusEnterpriseProvisioningMode;
    }
  ) => {
    setSavingId(subscription.id);
    try {
      const response = await adminFetch<{ success: boolean; data: NexusEnterpriseEventSubscription }>(
        `/api/v1/admin/nexus-enterprise/event-subscriptions/${subscription.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        }
      );
      setSubscriptions((current) =>
        current.map((item) => (item.id === subscription.id ? response.data : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setSavingId(null);
    }
  };

  const retryProvisioning = async (subscription: NexusEnterpriseEventSubscription) => {
    setRetryingId(subscription.id);
    try {
      const response = await adminFetch<{ success: boolean; data: NexusEnterpriseEventSubscription }>(
        `/api/v1/admin/nexus-enterprise/event-subscriptions/${subscription.id}/retry`,
        {
          method: "POST",
          body: JSON.stringify({ provisioningMode: subscription.provisioningMode }),
        }
      );
      setSubscriptions((current) =>
        current.map((item) => (item.id === subscription.id ? response.data : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry provisioning");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <RadioTower className="h-6 w-6 text-orange-400" />
          Nexus Enterprise
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Global operator view for enterprise webhook subscriptions, provisioning ownership, and retry actions.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total || 0, tone: "text-white" },
          { label: "Provisioned", value: stats.provisioned || 0, tone: "text-emerald-400" },
          { label: "Pending", value: stats.pending || 0, tone: "text-blue-400" },
          { label: "Needs partner", value: (stats.manual_required || 0) + (stats.assisted_required || 0), tone: "text-amber-300" },
          { label: "Failed", value: stats.failed || 0, tone: "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="bg-card border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-semibold mt-2 ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Provider</label>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as "all" | NexusEnterpriseEventSubscriptionProvider)}
              className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm"
            >
              {PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>{provider.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Provisioning state</label>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm"
            >
              {PROVISIONING_STATES.map((state) => (
                <option key={state.value} value={state.value}>{state.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Workspace ID</label>
            <input
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              placeholder="Optional workspace UUID"
              className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadSubscriptions()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-sm text-muted-foreground">
            No enterprise subscriptions match the current filters.
          </div>
        ) : (
          subscriptions.map((subscription) => (
            <div key={subscription.id} className="bg-card border rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-medium">
                      {subscription.roomName || subscription.sourceResource || "Unscoped subscription"}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full border text-xs bg-slate-500/10 text-slate-300 border-slate-500/20">
                      {formatProviderLabel(subscription.provider)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border text-xs ${statusTone(subscription.provisioningStatus)}`}>
                      {subscription.provisioningStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Workspace {subscription.workspaceId} · Agent {subscription.agentId || "deployment-level"} · Created {formatDateTime(subscription.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CopyButton value={subscription.callbackUrl} label="Copy URL" />
                  <CopyButton value={subscription.verificationSecret} label="Copy Secret" />
                  <CopyButton value={JSON.stringify(subscription, null, 2)} label="Copy JSON" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Status</label>
                  <select
                    value={subscription.status}
                    onChange={(event) => void patchSubscription(subscription, { status: event.target.value })}
                    disabled={savingId === subscription.id}
                    className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Provisioning mode</label>
                  <select
                    value={subscription.provisioningMode}
                    onChange={(event) =>
                      void patchSubscription(subscription, {
                        provisioningMode: event.target.value as NexusEnterpriseProvisioningMode,
                      })
                    }
                    disabled={savingId === subscription.id}
                    className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm"
                  >
                    <option value="manual">Manual</option>
                    <option value="assisted">Assisted</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Source resource</label>
                  <div className="px-3 py-2 rounded-md bg-muted border border-border text-sm break-all">
                    {subscription.sourceResource || "—"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                <div className="rounded-md bg-muted/40 border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Events</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(subscription.events || []).length > 0 ? subscription.events.map((event) => (
                      <span key={`${subscription.id}-${event}`} className="px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300 text-xs">
                        {event}
                      </span>
                    )) : <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Callback URL</p>
                  <p className="break-all text-sm">{subscription.callbackUrl}</p>
                </div>
                <div className="rounded-md bg-muted/40 border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Last event</p>
                  <p>{formatDateTime(subscription.lastEventAt)}</p>
                </div>
              </div>

              {subscription.provisioningError && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {subscription.provisioningError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  External subscription {subscription.externalSubscriptionId || "not assigned"} · Updated {formatDateTime(subscription.updatedAt)}
                </p>
                <button
                  type="button"
                  onClick={() => void retryProvisioning(subscription)}
                  disabled={retryingId === subscription.id}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/20 text-sm transition-colors disabled:opacity-60"
                >
                  {retryingId === subscription.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Retry provisioning
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
