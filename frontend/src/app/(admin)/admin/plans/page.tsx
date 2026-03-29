"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/client";
import type { AdminStats } from "@/lib/api/types";
import Link from "next/link";
import {
  CreditCard,
  Users,
  Zap,
  Star,
  Crown,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlanInfo {
  name: string;
  key: string;
  price: number;
  icon: typeof Crown;
  color: string;
  bg: string;
  features: string[];
}

const PLANS: PlanInfo[] = [
  {
    name: "Free",
    key: "plan_free",
    price: 0,
    icon: Users,
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    features: ["1 Agent", "500 messages/mo", "1 GB storage"],
  },
  {
    name: "Starter",
    key: "plan_starter",
    price: 19,
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    features: ["5 Agents", "5,000 messages/mo", "5 GB storage", "Email integration"],
  },
  {
    name: "Team",
    key: "plan_team",
    price: 49,
    icon: Star,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    features: ["25 Agents", "25,000 messages/mo", "25 GB storage", "All integrations", "Priority support"],
  },
  {
    name: "Enterprise",
    key: "plan_enterprise",
    price: 199,
    icon: Crown,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    features: ["Unlimited Agents", "Unlimited messages", "1 TB storage", "Custom integrations", "SLA", "Dedicated support"],
  },
  {
    name: "Beta",
    key: "plan_beta",
    price: 0,
    icon: Zap,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    features: ["Full access (testing)", "Admin-granted only"],
  },
];

export default function AdminPlansPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch<{ success: boolean; data: AdminStats }>("/api/v1/admin/stats")
      .then((res) => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        Failed to load stats
      </div>
    );
  }

  const totalPaying =
    Number(stats.plan_starter) + Number(stats.plan_team) + Number(stats.plan_enterprise);
  const mrr =
    Number(stats.plan_starter) * 19 +
    Number(stats.plan_team) * 49 +
    Number(stats.plan_enterprise) * 199;
  const arr = mrr * 12;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-muted-foreground" />
          Plans & Revenue
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Plan distribution and revenue overview
        </p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">MRR</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            CHF {mrr.toLocaleString()}
          </div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">ARR</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">
            CHF {arr.toLocaleString()}
          </div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">Paying Users</span>
          </div>
          <div className="text-2xl font-bold text-purple-400">{totalPaying}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-muted-foreground">Conversion</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {Number(stats.total) > 0
              ? ((totalPaying / Number(stats.total)) * 100).toFixed(1)
              : "0"}
            %
          </div>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const count = Number((stats as Record<string, string>)[plan.key]) || 0;
          const revenue = count * plan.price;
          const PlanIcon = plan.icon;

          return (
            <div key={plan.key} className="bg-card border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${plan.bg}`}>
                    <PlanIcon className={`h-5 w-5 ${plan.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {plan.price > 0 ? `CHF ${plan.price}/mo` : "Free"}
                    </p>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${plan.color}`}>{count}</div>
              </div>

              {/* Revenue for this plan */}
              {plan.price > 0 && (
                <div className="bg-muted/50 rounded-md px-3 py-2 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Monthly revenue</span>
                    <span className="font-medium text-emerald-400">
                      CHF {revenue.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Usage bar - % of total users */}
              <div className="mb-3">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      plan.color.replace("text-", "bg-")
                    }`}
                    style={{
                      width: `${Number(stats.total) > 0 ? (count / Number(stats.total)) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {Number(stats.total) > 0
                    ? ((count / Number(stats.total)) * 100).toFixed(1)
                    : "0"}
                  % of users
                </p>
              </div>

              {/* Features */}
              <ul className="text-xs text-muted-foreground space-y-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-1">
                    <span className={`w-1 h-1 rounded-full ${plan.color.replace("text-", "bg-")}`} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            Manage Users
          </Button>
        </Link>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            Stripe Dashboard
          </Button>
        </a>
      </div>
    </div>
  );
}
