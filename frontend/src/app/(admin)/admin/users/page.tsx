"use client";

import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/api/client";
import type { AdminUser, AdminUsersMeta } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  Ban,
  Crown,
  Zap,
  Star,
  Check,
} from "lucide-react";

const PLANS = [
  "free",
  "office_starter",
  "office_team",
  "agents_starter",
  "agents_pro",
  "nexus_enterprise",
  "full",
  "enterprise",
  "beta",
] as const;
const ROLES = ["user", "admin", "banned"] as const;

const planBadge: Record<string, { color: string; icon: typeof Crown }> = {
  free: { color: "text-gray-400 bg-gray-500/10", icon: Users },
  office_starter: { color: "text-blue-400 bg-blue-500/10", icon: Zap },
  office_team: { color: "text-cyan-400 bg-cyan-500/10", icon: Star },
  agents_starter: { color: "text-violet-400 bg-violet-500/10", icon: Zap },
  agents_pro: { color: "text-amber-400 bg-amber-500/10", icon: Star },
  nexus_enterprise: { color: "text-orange-400 bg-orange-500/10", icon: Crown },
  full: { color: "text-emerald-400 bg-emerald-500/10", icon: Star },
  enterprise: { color: "text-purple-400 bg-purple-500/10", icon: Crown },
  beta: { color: "text-emerald-400 bg-emerald-500/10", icon: Zap },
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meta, setMeta] = useState<AdminUsersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (planFilter) params.set("plan", planFilter);
      const res = await adminFetch<{ success: boolean; data: AdminUser[]; meta: AdminUsersMeta }>(
        `/api/v1/admin/users?${params}`
      );
      setUsers(res.data);
      setMeta(res.meta);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, planFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const updateRole = async (userId: string, role: string) => {
    setActionLoading(userId);
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/role`, {
        method: "PUT",
        body: { role },
      });
      showToast(`Role updated to ${role}`);
      fetchUsers();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setActionLoading(null);
    }
  };

  const updatePlan = async (userId: string, plan: string) => {
    setActionLoading(userId);
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/plan`, {
        method: "PUT",
        body: { plan },
      });
      showToast(`Plan updated to ${plan}`);
      fetchUsers();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleBeta = async (userId: string, currentCode: string | null) => {
    setActionLoading(userId);
    try {
      await adminFetch(`/api/v1/admin/users/${userId}/plan`, {
        method: "PUT",
        body: {
          plan: currentCode ? "free" : "beta",
          beta_code: currentCode ? null : "ADMIN_GRANTED",
        },
      });
      showToast(currentCode ? "Beta removed" : "Beta granted");
      fetchUsers();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border rounded-lg px-4 py-2 shadow-lg text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="h-6 w-6 text-muted-foreground" />
          User Management
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {meta ? `${meta.total} users total` : "Loading..."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-md text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="bg-muted border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="bg-muted border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All plans</option>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => {
                  const plan = user.plan || "free";
                  const badge = planBadge[plan] || planBadge.free;
                  const BadgeIcon = badge.icon;
                  const isLoading = actionLoading === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{user.display_name || user.name || user.email}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.role === "admin" ? "text-purple-400 bg-purple-500/10" :
                          user.role === "banned" ? "text-red-400 bg-red-500/10" :
                          "text-gray-400 bg-gray-500/10"
                        }`}>
                          {user.role === "admin" ? <Shield className="h-3 w-3" /> :
                           user.role === "banned" ? <Ban className="h-3 w-3" /> : null}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                          <BadgeIcon className="h-3 w-3" />
                          {plan}
                        </span>
                        {user.beta_code && (
                          <span className="ml-1 text-xs text-emerald-400">(beta)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Role toggle */}
                          <select
                            value={user.role}
                            onChange={(e) => updateRole(user.id, e.target.value)}
                            disabled={isLoading}
                            className="bg-muted border border-border rounded px-2 py-1 text-xs"
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          {/* Plan select */}
                          <select
                            value={plan}
                            onChange={(e) => updatePlan(user.id, e.target.value)}
                            disabled={isLoading}
                            className="bg-muted border border-border rounded px-2 py-1 text-xs"
                          >
                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {/* Beta toggle */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleBeta(user.id, user.beta_code)}
                            disabled={isLoading}
                            className="text-xs h-7"
                          >
                            {user.beta_code ? "Remove Beta" : "Grant Beta"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.pages > 1 && (
            <div className="border-t px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {meta.page} of {meta.pages} ({meta.total} users)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                  disabled={page >= meta.pages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
