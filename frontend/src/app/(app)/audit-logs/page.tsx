"use client";

import { authFetch } from "@/lib/authFetch";
import { useState, useEffect, useCallback } from "react";

interface AuditLog {
  id: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
  action: string;
  resource?: string;
  ip_address?: string;
}

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actions, setActions] = useState<string[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (actionFilter) params.set("action", actionFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await authFetch(`/api/v1/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLogs(data.data || data.logs || []);
      setTotal(data.total || 0);
      if (data.actions) setActions(data.actions);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString(); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-[#9ca3af] text-sm mt-1">Track all actions performed in the system</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[#9ca3af] mb-1">Action</label>
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#9ca3af] mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]" />
        </div>
        <div>
          <label className="block text-xs text-[#9ca3af] mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]" />
        </div>
        <button onClick={() => { setActionFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}
          className="px-3 py-2 text-sm text-[#9ca3af] hover:text-white transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.07)]">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#14151f] text-[#9ca3af] text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#6b7280]">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#6b7280]">No audit logs found</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="hover:bg-[#14151f] transition-colors">
                <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-4 py-3 text-white">{log.user_email || log.user_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#3b82f6]/10 text-[#3b82f6]">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-[#9ca3af]">{log.resource || "—"}</td>
                <td className="px-4 py-3 text-[#6b7280] font-mono text-xs">{log.ip_address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#6b7280]">{total} total entries</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-[#14151f] text-[#9ca3af] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-[rgba(255,255,255,0.07)]">
            Previous
          </button>
          <span className="text-[#9ca3af]">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-[#14151f] text-[#9ca3af] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-[rgba(255,255,255,0.07)]">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
