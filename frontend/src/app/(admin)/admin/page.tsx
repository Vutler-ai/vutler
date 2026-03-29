"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/client";
import type { AdminStats } from "@/lib/api/types";
import {
  Users,
  UserPlus,
  Shield,
  TrendingUp,
  Crown,
  Zap,
  Star,
  Ban,
} from "lucide-react";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ success: boolean; data: AdminStats }>("/api/v1/admin/stats")
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        {error || "Failed to load stats"}
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Admins", value: stats.admins, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Signups (7d)", value: stats.signups_7d, icon: UserPlus, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Signups (30d)", value: stats.signups_30d, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  const planCards = [
    { label: "Free", value: stats.plan_free, icon: Users, color: "text-gray-400", bg: "bg-gray-500/10" },
    { label: "Starter", value: stats.plan_starter, icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Team", value: stats.plan_team, icon: Star, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Enterprise", value: stats.plan_enterprise, icon: Crown, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Beta", value: stats.plan_beta, icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Banned", value: stats.banned, icon: Ban, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Platform statistics at a glance</p>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Users
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className={`${card.bg} rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`h-4 w-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans breakdown */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Plans Distribution
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {planCards.map((card) => (
            <div key={card.label} className={`${card.bg} rounded-lg p-4 text-center`}>
              <card.icon className={`h-5 w-5 ${card.color} mx-auto mb-2`} />
              <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue estimate */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Estimated MRR
        </h2>
        <div className="bg-card border rounded-lg p-6">
          <div className="text-3xl font-bold text-emerald-400">
            CHF{" "}
            {(
              Number(stats.plan_starter) * 19 +
              Number(stats.plan_team) * 49 +
              Number(stats.plan_enterprise) * 199
            ).toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground ml-2">/month</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Based on: Starter CHF 19 x {stats.plan_starter} + Team CHF 49 x {stats.plan_team} + Enterprise CHF 199 x {stats.plan_enterprise}
          </p>
        </div>
      </div>
    </div>
  );
}
