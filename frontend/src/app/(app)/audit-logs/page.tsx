"use client";

import { useState, useCallback } from "react";
import { useApi } from "@/hooks/use-api";
import { apiFetch } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
  action: string;
  resource?: string;
  details?: string | Record<string, unknown>;
  ip_address?: string;
}

interface AuditLogsResponse {
  data?: AuditLog[];
  logs?: AuditLog[];
  total?: number;
  actions?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d;
  }
}

function actionColor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("remove")) return "bg-red-500/10 text-red-400 border-red-500/30";
  if (a.includes("create") || a.includes("add") || a.includes("register")) return "bg-green-500/10 text-green-400 border-green-500/30";
  if (a.includes("update") || a.includes("edit") || a.includes("modify")) return "bg-blue-500/10 text-[#3b82f6] border-[#3b82f6]/30";
  if (a.includes("login") || a.includes("auth") || a.includes("logout")) return "bg-purple-500/10 text-purple-400 border-purple-500/30";
  return "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30";
}

function buildParams(page: number, action: string, dateFrom: string, dateTo: string): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(PAGE_SIZE));
  if (action) p.set("action", action);
  if (dateFrom) p.set("from", dateFrom);
  if (dateTo) p.set("to", dateTo);
  return p.toString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const cacheKey = `/api/v1/audit-logs?${buildParams(page, actionFilter, dateFrom, dateTo)}`;

  const { data, isLoading, error, mutate } = useApi<AuditLogsResponse>(
    cacheKey,
    () => apiFetch<AuditLogsResponse>(cacheKey)
  );

  const logs: AuditLog[] = data?.data ?? data?.logs ?? [];
  const total = data?.total ?? 0;
  const actions: string[] = data?.actions ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = useCallback(
    (key: "action" | "from" | "to", value: string) => {
      setPage(1);
      if (key === "action") setActionFilter(value);
      else if (key === "from") setDateFrom(value);
      else setDateTo(value);
    },
    []
  );

  const clearFilters = useCallback(() => {
    setPage(1);
    setActionFilter("");
    setDateFrom("");
    setDateTo("");
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-sm text-[#9ca3af] mt-1">
            Track all actions performed in the system.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => mutate()}
          className="bg-[#3b82f6] hover:bg-[#2563eb] shrink-0"
        >
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-[#9ca3af]">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => handleFilterChange("action", e.target.value)}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] min-w-[160px]"
          >
            <option value="" className="bg-[#14151f]">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a} className="bg-[#14151f]">
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-[#9ca3af]">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange("from", e.target.value)}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-[#9ca3af]">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange("to", e.target.value)}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          />
        </div>

        {(actionFilter || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-[#9ca3af] hover:text-white"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg bg-[#1f2028]" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 mb-4 rounded-2xl bg-[#1f2028] flex items-center justify-center text-2xl">
                📋
              </div>
              <p className="text-white font-semibold mb-1">No audit logs found</p>
              <p className="text-[#9ca3af] text-sm">
                {actionFilter || dateFrom || dateTo
                  ? "Try adjusting or clearing your filters."
                  : "Actions taken in your workspace will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Timestamp</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">User</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Action</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Resource</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Details</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const detailsStr =
                      typeof log.details === "string"
                        ? log.details
                        : log.details
                        ? JSON.stringify(log.details)
                        : "—";

                    return (
                      <TableRow
                        key={log.id}
                        className="border-[rgba(255,255,255,0.05)] hover:bg-[#1f2028]/50 transition-colors"
                      >
                        <TableCell className="text-[#9ca3af] text-sm whitespace-nowrap">
                          {fmtDate(log.created_at)}
                        </TableCell>
                        <TableCell className="text-white text-sm">
                          {log.user_email ?? log.user_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${actionColor(log.action)}`}
                          >
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-[#9ca3af] text-sm">
                          {log.resource ?? "—"}
                        </TableCell>
                        <TableCell className="text-[#6b7280] text-xs max-w-[200px] truncate" title={detailsStr}>
                          {detailsStr}
                        </TableCell>
                        <TableCell className="text-[#6b7280] font-mono text-xs whitespace-nowrap">
                          {log.ip_address ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#6b7280]">
          {total > 0 ? `${total.toLocaleString()} total entries` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white disabled:opacity-30"
          >
            Previous
          </Button>
          <span className="text-[#9ca3af] px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white disabled:opacity-30"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
