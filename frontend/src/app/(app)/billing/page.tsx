"use client";

import { useState, useCallback } from "react";
import { useApi } from "@/hooks/use-api";
import { getPlans, getSubscription, checkout, portal } from "@/lib/api/endpoints/billing";
import type { Plan, PlansResponse, Subscription, SubscriptionUsage } from "@/lib/api/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Static plan definitions (mirrored from featureGate.js) ──────────────────
// These are shown when the API is unavailable and serve as the source of truth
// for plan metadata. Prices are in cents. Limits: -1 = unlimited.

// NOTE: LLM is BYOK — no token limits on any plan. Token tracking in /usage
// is for monitoring only. Users can also purchase LLM Credits separately.
const FALLBACK_PLANS: PlansResponse = {
  office: [
    {
      id: "free",
      label: "Free",
      price: { monthly: 0, yearly: 0 },
      features: [],
      limits: { agents: 1, storage: "1 GB" },
    },
    {
      id: "office_starter",
      label: "Office Starter",
      price: { monthly: 2900, yearly: 29000 },
      features: [
        "Chat & messaging",
        "Drive file storage",
        "Email integration",
        "Tasks & calendar",
        "Integrations",
        "WhatsApp",
        "Dashboard",
        "Goals & CRM",
        "Pixel Office",
        "LLM: Bring Your Own Key",
      ],
      limits: { storage: "10 GB" },
    },
    {
      id: "office_team",
      label: "Office Team",
      price: { monthly: 7900, yearly: 79000 },
      features: [
        "Chat & messaging",
        "Drive file storage",
        "Email integration",
        "Tasks & calendar",
        "Integrations",
        "WhatsApp",
        "Dashboard",
        "Goals & CRM",
        "Pixel Office",
        "LLM: Bring Your Own Key",
      ],
      limits: { storage: "100 GB" },
    },
  ],
  agents: [
    {
      id: "agents_starter",
      label: "Agents Starter",
      price: { monthly: 2900, yearly: 29000 },
      features: [
        "Up to 25 agents",
        "Nexus orchestration",
        "Marketplace access",
        "Sandbox & builder",
        "Swarm & automations",
        "LLM settings",
        "Tools & runtime",
        "Deployments & templates",
        "Knowledge base",
        "Providers & dashboard",
        "LLM: Bring Your Own Key",
      ],
      limits: { agents: 25, nexusNodes: 2, storage: "10 GB" },
    },
    {
      id: "agents_pro",
      label: "Agents Pro",
      price: { monthly: 7900, yearly: 79000 },
      features: [
        "Up to 100 agents",
        "Nexus orchestration",
        "Marketplace access",
        "Sandbox & builder",
        "Swarm & automations",
        "LLM settings",
        "Tools & runtime",
        "Deployments & templates",
        "Knowledge base",
        "Providers & dashboard",
        "3 enterprise Nexus nodes",
        "LLM: Bring Your Own Key",
      ],
      limits: { agents: 100, nexusNodes: 10, storage: "100 GB" },
    },
  ],
  full: [
    {
      id: "full",
      label: "Full Platform",
      price: { monthly: 12900, yearly: 129000 },
      features: [
        "Everything in Office + Agents",
        "Up to 100 agents",
        "Nexus orchestration",
        "All integrations",
        "Priority support",
        "Unlimited features",
        "5 enterprise Nexus nodes",
        "LLM: Bring Your Own Key",
      ],
      limits: { agents: 100, nexusNodes: 10, storage: "100 GB" },
    },
    {
      id: "enterprise",
      label: "Enterprise",
      price: { monthly: 0, yearly: 0 },
      features: [
        "Unlimited agents",
        "Unlimited storage",
        "Unlimited Nexus nodes",
        "Custom SLAs",
        "White-labelling",
        "Dedicated support",
        "Custom integrations",
        "LLM: Bring Your Own Key",
      ],
      limits: {},
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(0);
}

function planBadgeClass(status: string | undefined): string {
  if (status === "active") return "border-green-500/30 text-green-400 bg-green-500/10";
  if (status === "past_due") return "border-yellow-500/30 text-yellow-400 bg-yellow-500/10";
  if (status === "canceled") return "border-red-500/30 text-red-400 bg-red-500/10";
  return "border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent";
}

// ─── Usage Meter ──────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  used,
  limit,
  unit = "",
}: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const usedFmt = used >= 1_000_000 ? `${(used / 1_000_000).toFixed(1)}M` : used >= 1_000 ? `${(used / 1_000).toFixed(1)}K` : String(used);
  const limitFmt = limit ? (limit >= 1_000_000 ? `${(limit / 1_000_000).toFixed(1)}M` : limit >= 1_000 ? `${(limit / 1_000).toFixed(1)}K` : String(limit)) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#9ca3af]">{label}</span>
        <span className="text-white font-medium">
          {usedFmt}{unit}
          {limitFmt ? ` / ${limitFmt}${unit}` : " / Unlimited"}
        </span>
      </div>
      {limit && (
        <div className="h-1.5 bg-[#1f2028] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-[#3b82f6]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Current Plan Card ────────────────────────────────────────────────────────

function CurrentPlanCard({
  subscription,
  onManage,
  portalLoading,
}: {
  subscription: Subscription | null;
  onManage: () => void;
  portalLoading: boolean;
}) {
  const planLabel =
    subscription?.planId
      ? subscription.planId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Free";
  const status = subscription?.status ?? (subscription?.planId ? "active" : "free");
  const usage: SubscriptionUsage | null = subscription?.usage ?? null;

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-white">Current Plan</CardTitle>
            <CardDescription className="text-[#9ca3af] mt-1 capitalize">
              {planLabel}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={planBadgeClass(status)}>
              {status === "free" ? "Free tier" : status}
            </Badge>
            {subscription?.planId && (
              <Button
                size="sm"
                variant="outline"
                onClick={onManage}
                disabled={portalLoading}
                className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
              >
                {portalLoading ? "Opening…" : "Manage Billing"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {usage && (
        <CardContent className="space-y-4 border-t border-[rgba(255,255,255,0.06)] pt-5">
          <p className="text-sm text-[#6b7280] uppercase tracking-wide font-medium">Usage</p>
          {subscription?.current_period_end && (
            <p className="text-xs text-[#6b7280]">
              Renews{" "}
              {new Date(subscription.current_period_end).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
          <UsageMeter
            label="Agents"
            used={usage.agents.used}
            limit={usage.agents.limit}
          />
          <UsageMeter
            label="Storage"
            used={usage.storage_gb.used}
            limit={usage.storage_gb.limit}
            unit=" GB"
          />
        </CardContent>
      )}

      {!subscription?.planId && (
        <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5">
          <p className="text-sm text-[#9ca3af]">
            You&apos;re on the Free plan. Upgrade below to unlock more agents and storage. LLM is Bring Your Own Key — no token limits on any plan.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  interval,
  currentPlanId,
  onCheckout,
  loadingId,
}: {
  plan: Plan;
  interval: "monthly" | "yearly";
  currentPlanId: string | null;
  onCheckout: (planId: string) => void;
  loadingId: string | null;
}) {
  const isCurrent = plan.id === currentPlanId;
  const isEnterprise = plan.id === "enterprise";
  const isFree = plan.id === "free";
  const price = interval === "yearly" ? plan.price.yearly : plan.price.monthly;
  const isLoading = loadingId === plan.id;

  // For -1 limits (enterprise unlimited), display "Unlimited"
  function formatLimit(val: number | undefined): string {
    if (val === undefined) return "—";
    if (val === -1) return "Unlimited";
    if (val >= 1_000_000) return `${val / 1_000_000}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
    return String(val);
  }

  return (
    <div
      className={`flex flex-col bg-[#14151f] border rounded-2xl p-6 transition-all duration-200 ${
        isCurrent
          ? "border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
          : isEnterprise
          ? "border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.2)]"
          : "border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <p className="text-white font-semibold text-lg">{plan.label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            {isEnterprise ? (
              <span className="text-2xl font-bold text-white">Custom</span>
            ) : isFree ? (
              <span className="text-2xl font-bold text-white">$0</span>
            ) : (
              <>
                <span className="text-2xl font-bold text-white">${formatPrice(price)}</span>
                <span className="text-[#6b7280] text-sm">/{interval === "yearly" ? "yr" : "mo"}</span>
              </>
            )}
          </div>
        </div>
        {isCurrent && (
          <Badge
            variant="outline"
            className="shrink-0 border-[#3b82f6]/40 text-[#3b82f6] bg-[#3b82f6]/10 text-xs"
          >
            Current Plan
          </Badge>
        )}
      </div>

      {/* Limits */}
      {Object.keys(plan.limits).length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          {plan.limits.agents !== undefined && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(plan.limits.agents)}</p>
              <p className="text-[#6b7280] text-xs">Agents</p>
            </div>
          )}
          {plan.limits.nexusNodes !== undefined && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(plan.limits.nexusNodes)}</p>
              <p className="text-[#6b7280] text-xs">Nexus Nodes</p>
            </div>
          )}
          {/* Tokens/mo removed — LLM is BYOK, no plan-based token limits */}
          {plan.limits.storage && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{plan.limits.storage}</p>
              <p className="text-[#6b7280] text-xs">Storage</p>
            </div>
          )}
        </div>
      )}

      {/* Features */}
      <ul className="flex-1 space-y-2 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[#9ca3af]">
            <svg
              className="w-4 h-4 text-[#3b82f6] shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="py-2.5 text-center text-sm text-[#6b7280] border border-[rgba(255,255,255,0.07)] rounded-lg">
          Current Plan
        </div>
      ) : isEnterprise ? (
        <Button
          asChild
          className="w-full bg-[#1f2028] hover:bg-[#2a2d3a] text-white border border-[rgba(255,255,255,0.1)]"
        >
          <a href="mailto:enterprise@vutler.com">Contact Sales</a>
        </Button>
      ) : isFree ? (
        <div className="py-2.5 text-center text-sm text-[#6b7280] border border-[rgba(255,255,255,0.07)] rounded-lg">
          Free forever
        </div>
      ) : (
        <Button
          onClick={() => onCheckout(plan.id)}
          disabled={isLoading}
          className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60"
        >
          {isLoading ? "Redirecting…" : "Upgrade"}
        </Button>
      )}
    </div>
  );
}

// ─── Plan tabs ─────────────────────────────────────────────────────────────────

type TabKey = "office" | "agents" | "full";
const TABS: { key: TabKey; label: string }[] = [
  { key: "office", label: "Office" },
  { key: "agents", label: "Agents" },
  { key: "full", label: "Full Platform" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: plans, isLoading: plansLoading, error: plansError } =
    useApi<PlansResponse>("/api/v1/billing/plans", getPlans);

  const { data: subscription, isLoading: subLoading } =
    useApi<Subscription | null>("/api/v1/billing/subscription", getSubscription);

  const [activeTab, setActiveTab] = useState<TabKey>("office");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const isLoading = plansLoading || subLoading;
  // Use API plans if available; fall back to static definitions from featureGate.js
  const resolvedPlans: PlansResponse = plans ?? FALLBACK_PLANS;
  const currentPlans: Plan[] = resolvedPlans[activeTab] ?? [];

  const handleCheckout = useCallback(
    async (planId: string) => {
      setCheckoutLoadingId(planId);
      setActionError("");
      try {
        const res = await checkout(planId, interval);
        if (res.url) window.location.href = res.url;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Checkout failed. Please try again.");
      } finally {
        setCheckoutLoadingId(null);
      }
    },
    [interval]
  );

  const handlePortal = useCallback(async () => {
    setPortalLoading(true);
    setActionError("");
    try {
      const res = await portal();
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Plans & Billing</h1>
        <p className="text-sm text-[#9ca3af] mt-1">
          Manage your subscription, view usage, and upgrade your plan.
        </p>
      </div>

      {/* Errors */}
      {(plansError || actionError) && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {plansError?.message || actionError}
        </div>
      )}

      {/* Current Plan */}
      {!subLoading && (
        <CurrentPlanCard
          subscription={subscription ?? null}
          onManage={handlePortal}
          portalLoading={portalLoading}
        />
      )}

      {/* LLM Credits */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-white">LLM Credits</CardTitle>
              <p className="text-sm text-[#9ca3af] mt-1">
                Bring your own OpenRouter or Anthropic key, or purchase credits to use Vutler&apos;s managed LLM pool.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs bg-[#1e293b] text-[#64748b] border border-[rgba(255,255,255,0.08)] px-2 py-1 rounded-md">
                Coming soon
              </span>
              <Button
                className="bg-[#3b82f6] hover:bg-[#2563eb] opacity-50 cursor-not-allowed"
                disabled
              >
                Buy Credits — $10 / 1M tokens
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-4">
          <p className="text-xs text-[#6b7280] leading-relaxed">
            Already have an API key?{" "}
            <a href="/settings/providers" className="text-[#3b82f6] hover:underline">
              Connect it in Settings → Providers
            </a>{" "}
            — tokens are unlimited when you use your own key.
          </p>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category tabs */}
        <div className="flex bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1 gap-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-[#3b82f6] text-white"
                  : "text-[#9ca3af] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Billing interval */}
        <div className="flex items-center gap-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1">
          <button
            onClick={() => setInterval("monthly")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              interval === "monthly" ? "bg-[#1e293b] text-white" : "text-[#9ca3af] hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              interval === "yearly" ? "bg-[#1e293b] text-white" : "text-[#9ca3af] hover:text-white"
            }`}
          >
            Yearly
            <span className="text-xs bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 px-1.5 py-0.5 rounded-full font-semibold">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl bg-[#14151f]" />
          ))}
        </div>
      ) : currentPlans.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={interval}
              currentPlanId={subscription?.planId ?? null}
              onCheckout={handleCheckout}
              loadingId={checkoutLoadingId}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <p className="text-white font-semibold">No plans in this category</p>
          <p className="text-[#6b7280] text-sm">Check back soon or contact us.</p>
        </div>
      )}

      {/* Enterprise footer note */}
      <div className="border-t border-[rgba(255,255,255,0.07)] pt-6 text-center">
        <p className="text-[#6b7280] text-sm">
          Need custom limits, SLAs, or white-labelling? See the{" "}
          <button
            onClick={() => setActiveTab("full")}
            className="text-[#3b82f6] hover:underline"
          >
            Full Platform tab
          </button>{" "}
          or{" "}
          <a href="mailto:enterprise@vutler.com" className="text-[#3b82f6] hover:underline">
            contact us for Enterprise
          </a>.
        </p>
      </div>
    </div>
  );
}
