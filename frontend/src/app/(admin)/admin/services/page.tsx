"use client";

import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/api/client";
import type { AdminChatMaintenanceResult, ServiceHealth, VpsHealth, VpsHealthResponse } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Activity,
  Wrench,
  Archive,
  MessageSquareText,
} from "lucide-react";

const REFRESH_OPTIONS = [
  { value: "5000", label: "5s" },
  { value: "10000", label: "10s" },
  { value: "30000", label: "30s" },
];

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [summary, setSummary] = useState<VpsHealthResponse["summary"] | null>(null);
  const [vps, setVps] = useState<VpsHealth | null>(null);
  const [chatMaintenanceStatus, setChatMaintenanceStatus] = useState<AdminChatMaintenanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState("10000");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNormalizingDms, setIsNormalizingDms] = useState(false);
  const [isArchivingDms, setIsArchivingDms] = useState(false);
  const [chatMaintenanceMessage, setChatMaintenanceMessage] = useState<string | null>(null);

  const fetchServices = useCallback(async (showIndicator = false) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const [healthResult, maintenanceResult] = await Promise.all([
        adminFetch<VpsHealthResponse>("/api/v1/admin/health/vps"),
        adminFetch<{ success: boolean; data: AdminChatMaintenanceResult }>("/api/v1/admin/chat/maintenance/status"),
      ]);
      setServices(healthResult.services);
      setSummary(healthResult.summary);
      setVps(healthResult.vps || null);
      setLastUpdated(new Date(healthResult.timestamp));
      setChatMaintenanceStatus(maintenanceResult.data || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  useEffect(() => {
    const interval = setInterval(() => fetchServices(), parseInt(refreshInterval));
    return () => clearInterval(interval);
  }, [refreshInterval, fetchServices]);

  const timeSince = () => {
    if (!lastUpdated) return "Never";
    const s = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (s < 5) return "Just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  const runChatMaintenance = useCallback(async (
    action: "normalize" | "archive"
  ) => {
    if (action === "normalize") setIsNormalizingDms(true);
    if (action === "archive") setIsArchivingDms(true);
    setChatMaintenanceMessage(null);
    try {
      const endpoint = action === "normalize"
        ? "/api/v1/admin/chat/maintenance/normalize-legacy-dms"
        : "/api/v1/admin/chat/maintenance/archive-technical-dms";
      const result = await adminFetch<{ success: boolean; data: AdminChatMaintenanceResult }>(endpoint, {
        method: "POST",
        body: {},
      });
      const data = result.data || {};
      if (action === "normalize") {
        setChatMaintenanceMessage(`Normalized ${data.normalized_count || 0} legacy chat(s).`);
      } else {
        setChatMaintenanceMessage(`Archived ${data.archived_channel_count || 0} technical DM(s).`);
      }
      await fetchServices();
    } catch (err) {
      setChatMaintenanceMessage(err instanceof Error ? err.message : "Chat maintenance failed");
    } finally {
      setIsNormalizingDms(false);
      setIsArchivingDms(false);
    }
  }, [fetchServices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error && services.length === 0) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  const unhealthy = services.filter((s) => s.status === "unhealthy" || s.status === "degraded");

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {unhealthy.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-medium">
              {unhealthy.length} service{unhealthy.length > 1 ? "s" : ""} unhealthy
            </p>
            <p className="text-red-400/70 text-sm">
              {unhealthy.map((s) => s.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Server className="h-6 w-6 text-muted-foreground" />
            VPS Health
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <Clock className="h-3 w-3" />
            Updated: {timeSince()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => fetchServices(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(e.target.value)}
            className="bg-muted border border-border rounded-md px-2 py-1 text-sm"
          >
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total" value={summary.total} color="text-blue-400" bg="bg-blue-500/10" />
          <SummaryCard label="Healthy" value={summary.healthy} color="text-emerald-400" bg="bg-emerald-500/10" />
          <SummaryCard label="Unhealthy" value={summary.unhealthy} color="text-red-400" bg="bg-red-500/10" />
          <SummaryCard label="Degraded" value={summary.degraded} color="text-amber-400" bg="bg-amber-500/10" />
        </div>
      )}

      {/* VPS Metrics */}
      {vps && <VpsHealthSection vps={vps} />}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-muted-foreground" />
              Chat Maintenance
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Normalize legacy DM labels and archive technical DM channels that should not clutter the chat list.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-1">
                Legacy chats: {chatMaintenanceStatus?.legacy_count || 0}
              </span>
              <span className="rounded-full border border-border px-2 py-1">
                Technical DMs: {chatMaintenanceStatus?.technical_count || 0}
              </span>
              <span className="rounded-full border border-border px-2 py-1">
                Technical channels: {chatMaintenanceStatus?.technical_workspace_channel_count || 0}
              </span>
            </div>
            {chatMaintenanceStatus && (
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {chatMaintenanceStatus.legacy_channels && chatMaintenanceStatus.legacy_channels.length > 0 && (
                  <p>
                    Legacy: {chatMaintenanceStatus.legacy_channels.slice(0, 3).map((channel) => `${channel.current_name} -> ${channel.canonical_name || "n/a"}`).join(", ")}
                  </p>
                )}
                {chatMaintenanceStatus.technical_channels && chatMaintenanceStatus.technical_channels.length > 0 && (
                  <p>
                    Technical: {chatMaintenanceStatus.technical_channels.slice(0, 3).map((channel) => channel.name).join(", ")}
                  </p>
                )}
                {chatMaintenanceStatus.technical_workspace_channels && chatMaintenanceStatus.technical_workspace_channels.length > 0 && (
                  <p>
                    Technical channels: {chatMaintenanceStatus.technical_workspace_channels.slice(0, 3).map((channel) => channel.name).join(", ")}
                  </p>
                )}
              </div>
            )}
            {chatMaintenanceMessage && (
              <p className="mt-2 text-sm text-blue-400">{chatMaintenanceMessage}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void runChatMaintenance("normalize")}
              disabled={isNormalizingDms || isArchivingDms}
            >
              <MessageSquareText className="mr-2 h-4 w-4" />
              {isNormalizingDms ? "Normalizing…" : "Normalize Legacy Chats"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void runChatMaintenance("archive")}
              disabled={isArchivingDms || isNormalizingDms}
            >
              <Archive className="mr-2 h-4 w-4" />
              {isArchivingDms ? "Archiving…" : "Archive Technical DMs"}
            </Button>
          </div>
        </div>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <ServiceCard key={service.key} service={service} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-4 text-center`}>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const cfg: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; border: string; label: string }> = {
    healthy: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Healthy" },
    unhealthy: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "Unhealthy" },
    degraded: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Degraded" },
    unknown: { icon: AlertTriangle, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20", label: "Unknown" },
  };
  const c = cfg[service.status] || cfg.unknown;
  const Icon = c.icon;

  return (
    <div className={`bg-card border ${c.border} rounded-lg p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-medium truncate">{service.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{service.description}</p>
        </div>
        <div className={`p-2 rounded-lg ${c.bg} ml-2 flex-shrink-0`}>
          <Icon className={`h-4 w-4 ${c.color}`} />
        </div>
      </div>
      <div className="space-y-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${service.status === "healthy" ? "bg-emerald-400" : service.status === "unhealthy" ? "bg-red-400" : "bg-amber-400"}`} />
          {c.label}
        </span>
        {service.latency_ms !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" /><span>{service.latency_ms}ms</span>
          </div>
        )}
        {service.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">{service.error}</div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function UsageBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function VpsHealthSection({ vps }: { vps: VpsHealth }) {
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    healthy: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Healthy" },
    warning: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Warning" },
    critical: { color: "text-red-400", bg: "bg-red-500/10", label: "Critical" },
  };
  const c = cfg[vps.status] || cfg.healthy;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          System Metrics
        </h2>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${vps.status === "healthy" ? "bg-emerald-400" : vps.status === "warning" ? "bg-amber-400" : "bg-red-400"}`} />
            {c.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {vps.hostname} &bull; Uptime: {vps.uptime.uptime_formatted}
          </span>
        </div>
      </div>

      {vps.alerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              {vps.alerts.map((alert, i) => (
                <p key={i} className="text-sm text-red-400">{alert}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10"><Cpu className="h-4 w-4 text-blue-400" /></div>
              <span className="font-medium">CPU</span>
            </div>
            <span className="text-lg font-semibold">{vps.cpu.usage_percent}%</span>
          </div>
          <UsageBar percent={vps.cpu.usage_percent} />
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Cores</span><span>{vps.cpu.cores}</span></div>
            <div className="flex justify-between">
              <span>Load</span>
              <span>{vps.cpu.load_average.one_minute.toFixed(2)} / {vps.cpu.load_average.five_minutes.toFixed(2)} / {vps.cpu.load_average.fifteen_minutes.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Memory */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/10"><MemoryStick className="h-4 w-4 text-purple-400" /></div>
              <span className="font-medium">Memory</span>
            </div>
            <span className="text-lg font-semibold">{vps.memory.usage_percent}%</span>
          </div>
          <UsageBar percent={vps.memory.usage_percent} />
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Used / Total</span><span>{formatBytes(vps.memory.used_bytes)} / {formatBytes(vps.memory.total_bytes)}</span></div>
            <div className="flex justify-between"><span>Available</span><span>{formatBytes(vps.memory.available_bytes)}</span></div>
            {vps.memory.swap_total_bytes > 0 && (
              <div className="flex justify-between"><span>Swap</span><span>{formatBytes(vps.memory.swap_used_bytes)} / {formatBytes(vps.memory.swap_total_bytes)}</span></div>
            )}
          </div>
        </div>

        {/* Disk */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><HardDrive className="h-4 w-4 text-amber-400" /></div>
            <span className="font-medium">Disk</span>
          </div>
          <div className="space-y-3">
            {vps.disks.slice(0, 3).map((disk, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground truncate max-w-[60%]">{disk.mount_point}</span>
                  <span className="font-medium">{disk.usage_percent}%</span>
                </div>
                <UsageBar percent={disk.usage_percent} />
                <div className="text-xs text-muted-foreground mt-1">{formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Network */}
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-cyan-500/10"><Network className="h-4 w-4 text-cyan-400" /></div>
            <span className="font-medium">Network</span>
          </div>
          <div className="space-y-3">
            {vps.network.slice(0, 2).map((iface, i) => (
              <div key={i} className="text-xs">
                <div className="font-medium mb-1">{iface.name}</div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div><span className="text-emerald-400">&#8595;</span> {formatBytes(iface.rx_bytes)}</div>
                  <div><span className="text-blue-400">&#8593;</span> {formatBytes(iface.tx_bytes)}</div>
                </div>
                {(iface.rx_errors > 0 || iface.tx_errors > 0) && (
                  <div className="text-red-400 mt-1">Errors: RX {iface.rx_errors} / TX {iface.tx_errors}</div>
                )}
              </div>
            ))}
            {vps.network.length === 0 && <div className="text-xs text-muted-foreground">No interfaces</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
