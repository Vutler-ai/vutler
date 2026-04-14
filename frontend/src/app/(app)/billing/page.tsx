'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useApi } from '@/hooks/use-api';
import { getPlans, getSubscription, checkout, portal } from '@/lib/api/endpoints/billing';
import type { Plan, PlansResponse, Subscription, SubscriptionUsage } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Static plan definitions (mirrored from featureGate.js) ──────────────────
// These are shown when the API is unavailable and serve as the source of truth
// for plan metadata. Prices are in cents. Limits: -1 = unlimited.

// NOTE: Plans stay token-unlimited by default. Workspaces can either bring
// their own keys or buy Vutler-managed credits for a hosted runtime path.
const FALLBACK_PLANS: PlansResponse = {
  office: [
    {
      id: 'free',
      label: 'Free',
      price: { monthly: 0, yearly: 0 },
      features: ['1 hosted agent', 'Chat & dashboard'],
      limits: { agents: 1, storage: '500 MB', socialPosts: 0 },
    },
    {
      id: 'office_starter',
      label: 'Office Starter',
      price: { monthly: 2900, yearly: 29000 },
      features: [
        '2 hosted agents included',
        'Chat & messaging',
        'Drive file storage',
        'Email integration',
        'Tasks & calendar',
        'Integrations',
        'WhatsApp',
        'Dashboard',
        'Memory (3-level)',
        'Pixel Office',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: { agents: 2, storage: '5 GB', socialPosts: 0 },
    },
    {
      id: 'office_team',
      label: 'Office Pro',
      price: { monthly: 7900, yearly: 79000 },
      features: [
        '10 hosted agents included',
        'Chat & messaging',
        'Drive file storage',
        'Email integration',
        'Tasks & calendar',
        'Integrations',
        'WhatsApp',
        'Dashboard',
        'Memory (3-level)',
        'Goals & CRM',
        'Pixel Office',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: { agents: 10, storage: '50 GB', socialPosts: 0 },
    },
  ],
  agents: [
    {
      id: 'agents_starter',
      label: 'Agents Starter',
      price: { monthly: 2900, yearly: 29000 },
      features: [
        'Up to 10 agents',
        'Nexus orchestration',
        'Marketplace access',
        'Sandbox & builder',
        'Swarm & automations',
        'LLM settings',
        'Tools & runtime',
        'Deployments & templates',
        'Knowledge base',
        'Providers & dashboard',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: { agents: 10, nexusNodes: 2, storage: '5 GB', socialPosts: 10 },
    },
    {
      id: 'agents_pro',
      label: 'Agents Pro',
      price: { monthly: 7900, yearly: 79000 },
      features: [
        'Up to 50 agents',
        'Nexus orchestration',
        'Marketplace access',
        'Sandbox & builder',
        'Swarm & automations',
        'LLM settings',
        'Tools & runtime',
        'Deployments & templates',
        'Knowledge base',
        'Providers & dashboard',
        'Nexus Local orchestration',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: { agents: 50, nexusNodes: 10, storage: '25 GB', socialPosts: 50 },
    },
  ],
  full: [
    {
      id: 'full',
      label: 'Full Platform',
      price: { monthly: 12900, yearly: 129000 },
      features: [
        'Everything in Office + Agents',
        'Up to 50 agents',
        'Nexus orchestration',
        'All integrations',
        'Priority support',
        'Unlimited features',
        'Office + Agents in one workspace',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: { agents: 50, nexusNodes: 10, storage: '100 GB', socialPosts: 100 },
    },
  ],
  enterprise: [
    {
      id: 'nexus_enterprise',
      label: 'Nexus Enterprise',
      price: { monthly: 149000, yearly: 1490000 },
      features: [
        '1 governed Nexus Enterprise node included',
        '5 Nexus Enterprise seats included',
        'Specialized enterprise agent profiles',
        'Governance, approvals, and audit',
        'Drive repo provisioning',
        'Webhook preparation and event ingestion',
        'AV / IT runtime orchestration',
        'LLM: BYOK or Vutler Credits',
      ],
      limits: {
        agents: 100,
        nexusNodes: 1,
        nexusEnterpriseNodes: 1,
        nexus_enterprise_seats: 5,
        storage: '100 GB',
        socialPosts: 100,
      },
    },
    {
      id: 'enterprise',
      label: 'Enterprise',
      price: { monthly: 0, yearly: 0 },
      features: [
        'Custom pricing and packaging',
        'Multi-node enterprise rollout',
        'Custom SLAs and onboarding',
        'Dedicated support and partner motion',
        'Advanced governance and integrations',
        'Custom SLAs',
        'White-labelling',
        'LLM: BYOK or Vutler Credits',
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
  if (status === 'active') return 'border-green-500/30 text-green-400 bg-green-500/10';
  if (status === 'past_due') return 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10';
  if (status === 'canceled') return 'border-red-500/30 text-red-400 bg-red-500/10';
  return 'border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent';
}

function resolveStorageLabel(plan: Plan): string | null {
  if (plan.limits.storage) return plan.limits.storage;
  if (plan.limits.storage_gb === undefined) return null;
  return plan.limits.storage_gb === -1 ? 'Unlimited' : `${plan.limits.storage_gb} GB`;
}

function resolveNexusNodes(plan: Plan): number | undefined {
  return plan.limits.nexusNodes ?? plan.limits.nexus_nodes;
}

function resolveEnterpriseNodes(plan: Plan): number | undefined {
  return plan.limits.nexusEnterpriseNodes ?? plan.limits.nexus_enterprise;
}

function resolveEnterpriseSeats(plan: Plan): number | undefined {
  return plan.limits.nexus_enterprise_seats;
}

function resolveSocialPosts(plan: Plan): number | undefined {
  return plan.limits.socialPosts ?? plan.limits.social_posts_month;
}

function formatMetricValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

// ─── Usage Meter ──────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  used,
  limit,
  unit = '',
}: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const usedFmt =
    used >= 1_000_000
      ? `${(used / 1_000_000).toFixed(1)}M`
      : used >= 1_000
        ? `${(used / 1_000).toFixed(1)}K`
        : String(used);
  const limitFmt = limit
    ? limit >= 1_000_000
      ? `${(limit / 1_000_000).toFixed(1)}M`
      : limit >= 1_000
        ? `${(limit / 1_000).toFixed(1)}K`
        : String(limit)
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#9ca3af]">{label}</span>
        <span className="text-white font-medium">
          {usedFmt}
          {unit}
          {limitFmt ? ` / ${limitFmt}${unit}` : ' / Unlimited'}
        </span>
      </div>
      {limit && (
        <div className="h-1.5 bg-[#1f2028] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-[#3b82f6]'}`}
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
    subscription?.plan_name || subscription?.planId
      ? (subscription.plan_name || subscription?.planId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Free';
  const status = subscription?.status ?? (subscription?.planId ? 'active' : 'free');
  const usage: SubscriptionUsage | null = subscription?.usage ?? null;
  const ai = subscription?.ai ?? null;
  const enterpriseSeats = subscription?.limits?.nexus_enterprise_seats ?? 0;
  const enterpriseNodes = subscription?.limits?.nexusEnterpriseNodes ?? subscription?.limits?.nexus_enterprise ?? 0;
  const showEnterpriseCapacity =
    subscription?.planId === 'nexus_enterprise' || enterpriseSeats > 0 || enterpriseNodes > 0;

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-white">Current Plan</CardTitle>
            <CardDescription className="text-[#9ca3af] mt-1 capitalize">{planLabel}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={planBadgeClass(status)}>
              {status === 'free' ? 'Free tier' : status}
            </Badge>
            {subscription?.planId && (
              <Button
                size="sm"
                variant="outline"
                onClick={onManage}
                disabled={portalLoading}
                className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
              >
                {portalLoading ? 'Opening…' : 'Manage Billing'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {showEnterpriseCapacity && (
        <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-orange-500/30 text-orange-300 bg-orange-500/10">
              {enterpriseSeats} enterprise seats
            </Badge>
            <Badge variant="outline" className="border-blue-500/30 text-blue-300 bg-blue-500/10">
              {enterpriseNodes} governed nodes
            </Badge>
          </div>
        </CardContent>
      )}

      {usage && (
        <CardContent className="space-y-4 border-t border-[rgba(255,255,255,0.06)] pt-5">
          <p className="text-sm text-[#6b7280] uppercase tracking-wide font-medium">Usage</p>
          {subscription?.current_period_end && (
            <p className="text-xs text-[#6b7280]">
              Renews{' '}
              {new Date(subscription.current_period_end).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <UsageMeter label="Agents" used={usage.agents.used} limit={usage.agents.limit} />
          <UsageMeter label="Storage" used={usage.storage_gb.used} limit={usage.storage_gb.limit} unit=" GB" />
          {usage.social_posts && (
            <UsageMeter label="Social posts" used={usage.social_posts.used} limit={usage.social_posts.limit} />
          )}
          {ai && (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0f1119] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm text-white font-medium">AI Credits</p>
                  <p className="text-xs text-[#6b7280] mt-1">Managed runtime balance and monthly credit usage.</p>
                </div>
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                  {formatMetricValue(ai.balances?.total_remaining ?? 0)} remaining
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-[#14151f] px-3 py-2">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Included / mo</p>
                  <p className="text-white font-semibold mt-1">{formatMetricValue(ai.monthly_included_credits ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-[#14151f] px-3 py-2">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Used this period</p>
                  <p className="text-white font-semibold mt-1">
                    {formatMetricValue(ai.current_period?.credits_consumed ?? 0)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#14151f] px-3 py-2">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">BYOK</p>
                  <p className="text-white font-semibold mt-1">{ai.byok_enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="rounded-lg bg-[#14151f] px-3 py-2">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Managed runtime</p>
                  <p className="text-white font-semibold mt-1">
                    {ai.managed_runtime_available ? 'Available' : 'Not configured'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(ai.balances?.trial_remaining ?? 0) > 0 && (
                  <Badge variant="outline" className="border-blue-500/30 text-blue-300 bg-blue-500/10">
                    Trial {formatMetricValue(ai.balances.trial_remaining)}
                  </Badge>
                )}
                {(ai.balances?.plan_remaining ?? 0) > 0 && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                    Included {formatMetricValue(ai.balances.plan_remaining)}
                  </Badge>
                )}
                {(ai.balances?.topup_remaining ?? 0) > 0 && (
                  <Badge variant="outline" className="border-violet-500/30 text-violet-300 bg-violet-500/10">
                    Top-up {formatMetricValue(ai.balances.topup_remaining)}
                  </Badge>
                )}
                {(ai.balances?.legacy_remaining ?? 0) > 0 && (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/10">
                    Legacy {formatMetricValue(ai.balances.legacy_remaining)}
                  </Badge>
                )}
                <Badge variant="outline" className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent">
                  Std {formatMetricValue(ai.current_period?.by_tier?.standard ?? 0)}
                </Badge>
                <Badge variant="outline" className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent">
                  Adv {formatMetricValue(ai.current_period?.by_tier?.advanced ?? 0)}
                </Badge>
                <Badge variant="outline" className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent">
                  Prem {formatMetricValue(ai.current_period?.by_tier?.premium ?? 0)}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {!subscription?.planId && (
        <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5">
          <p className="text-sm text-[#9ca3af]">
            You&apos;re on the Free plan. Upgrade below to unlock more agents and storage. LLM can run either through
            your own provider keys or through purchased Vutler credits.
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
  recommendedPlanId,
}: {
  plan: Plan;
  interval: 'monthly' | 'yearly';
  currentPlanId: string | null;
  onCheckout: (planId: string) => void;
  loadingId: string | null;
  recommendedPlanId?: string | null;
}) {
  const isCurrent = plan.id === currentPlanId;
  const isCustomEnterprise = plan.id === 'enterprise';
  const isFree = plan.id === 'free';
  const price = interval === 'yearly' ? plan.price.yearly : plan.price.monthly;
  const isLoading = loadingId === plan.id;
  const isRecommended = recommendedPlanId === plan.id && !isCurrent;
  const storageLabel = resolveStorageLabel(plan);
  const nexusNodes = resolveNexusNodes(plan);
  const enterpriseNodes = resolveEnterpriseNodes(plan);
  const enterpriseSeats = resolveEnterpriseSeats(plan);
  const socialPosts = resolveSocialPosts(plan);
  const showTotalNexusNodes =
    nexusNodes !== undefined && (enterpriseNodes === undefined || enterpriseNodes !== nexusNodes);

  // For -1 limits (enterprise unlimited), display "Unlimited"
  function formatLimit(val: number | undefined): string {
    if (val === undefined) return '—';
    if (val === -1) return 'Unlimited';
    if (val >= 1_000_000) return `${val / 1_000_000}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
    return String(val);
  }

  return (
    <div
      className={`flex flex-col bg-[#14151f] border rounded-2xl p-4 sm:p-6 transition-all duration-200 ${
        isCurrent
          ? 'border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
          : isRecommended
            ? 'border-emerald-400/40 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]'
            : isCustomEnterprise
              ? 'border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.2)]'
              : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)]'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <p className="text-white font-semibold text-lg">{plan.label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            {isCustomEnterprise ? (
              <span className="text-2xl font-bold text-white">Custom</span>
            ) : isFree ? (
              <span className="text-2xl font-bold text-white">$0</span>
            ) : (
              <>
                <span className="text-2xl font-bold text-white">${formatPrice(price)}</span>
                <span className="text-[#6b7280] text-sm">/{interval === 'yearly' ? 'yr' : 'mo'}</span>
              </>
            )}
          </div>
        </div>
        {isCurrent && (
          <Badge variant="outline" className="shrink-0 border-[#3b82f6]/40 text-[#3b82f6] bg-[#3b82f6]/10 text-xs">
            Current Plan
          </Badge>
        )}
        {isRecommended && (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-400/40 text-emerald-300 bg-emerald-400/10 text-xs"
          >
            Recommended
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
          {showTotalNexusNodes && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(nexusNodes)}</p>
              <p className="text-[#6b7280] text-xs">Nexus Nodes</p>
            </div>
          )}
          {enterpriseNodes !== undefined && enterpriseNodes > 0 && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(enterpriseNodes)}</p>
              <p className="text-[#6b7280] text-xs">Governed Nodes</p>
            </div>
          )}
          {enterpriseSeats !== undefined && enterpriseSeats > 0 && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(enterpriseSeats)}</p>
              <p className="text-[#6b7280] text-xs">Enterprise Seats</p>
            </div>
          )}
          {/* Tokens/mo removed — plans do not enforce token caps; usage is BYOK or managed credits. */}
          {storageLabel && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{storageLabel}</p>
              <p className="text-[#6b7280] text-xs">Storage</p>
            </div>
          )}
          {socialPosts !== undefined && socialPosts > 0 && (
            <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
              <p className="text-white font-semibold text-sm">{formatLimit(socialPosts)}</p>
              <p className="text-[#6b7280] text-xs">Social Posts</p>
            </div>
          )}
        </div>
      )}

      {/* Features */}
      <ul className="flex-1 space-y-2 mb-6">
        {plan.features.map(f => (
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
      ) : isCustomEnterprise ? (
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
          {isLoading ? 'Redirecting…' : 'Upgrade'}
        </Button>
      )}
    </div>
  );
}

// ─── Social Media Post Packs ──────────────────────────────────────────────────

const SOCIAL_PACKS = [
  { id: 'social_posts_100', label: '100 Posts', posts: 100, price: 500, perPost: '$0.05' },
  { id: 'social_posts_500', label: '500 Posts', posts: 500, price: 1900, perPost: '$0.038', popular: true },
  { id: 'social_posts_2000', label: '2,000 Posts', posts: 2000, price: 4900, perPost: '$0.025' },
];

const NEXUS_ENTERPRISE_ADDONS = [
  {
    id: 'nexus_enterprise_seats_5',
    label: '+5 Enterprise Seats',
    description: 'Add elastic or fixed helper capacity without changing the base deployment.',
    price: 39000,
  },
  {
    id: 'nexus_enterprise_node',
    label: 'Extra Enterprise Node',
    description: 'Add another governed enterprise node for a new client site or environment.',
    price: 50000,
  },
];

async function startAddonCheckout(addonId: string): Promise<string> {
  const res = await fetch('/api/v1/billing/addon-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      addonId,
      successUrl: window.location.href,
      cancelUrl: window.location.href,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const url = data.url || data.data?.url;
  if (!res.ok || !url) {
    throw new Error(data.error || 'Checkout failed');
  }
  return url;
}

function NexusEnterpriseAddons({ subscription }: { subscription: Subscription | null }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const addonSummary = subscription?.addons ?? null;
  const hasBasePlan = subscription?.planId === 'nexus_enterprise';
  const totalEnterpriseSeats = subscription?.limits?.nexus_enterprise_seats ?? 0;
  const totalEnterpriseNodes =
    subscription?.limits?.nexusEnterpriseNodes ?? subscription?.limits?.nexus_enterprise ?? 0;

  const handleAddonCheckout = async (addonId: string) => {
    if (!hasBasePlan) return;
    setLoadingId(addonId);
    setError('');
    try {
      const url = await startAddonCheckout(addonId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-white">Nexus Enterprise Add-ons</CardTitle>
            <p className="text-sm text-[#9ca3af] mt-1">
              Extend the base deployment with more seats or another governed node.
            </p>
          </div>
          {(addonSummary || totalEnterpriseSeats > 0 || totalEnterpriseNodes > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                {totalEnterpriseSeats} seats total
              </Badge>
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
                {totalEnterpriseNodes} governed nodes
              </Badge>
              {addonSummary && (
                <>
                  <Badge variant="outline" className="border-orange-500/30 text-orange-300 bg-orange-500/10">
                    +{addonSummary.enterpriseSeats} addon seats
                  </Badge>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-300 bg-blue-500/10">
                    +{addonSummary.enterpriseNodes} addon nodes
                  </Badge>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5 space-y-4">
        {!hasBasePlan && (
          <div className="p-3 rounded-lg bg-[#1f2028] border border-[rgba(255,255,255,0.08)] text-sm text-[#9ca3af]">
            Activate the Nexus Enterprise base plan first to self-serve seats and governed node add-ons.
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {NEXUS_ENTERPRISE_ADDONS.map(addon => (
            <div
              key={addon.id}
              className="rounded-xl border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)] p-5"
            >
              <p className="text-white font-semibold text-lg">{addon.label}</p>
              <p className="text-sm text-[#9ca3af] mt-2">{addon.description}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">${formatPrice(addon.price)}</span>
                <span className="text-[#6b7280] text-sm">/mo</span>
              </div>
              <Button
                onClick={() => handleAddonCheckout(addon.id)}
                disabled={!hasBasePlan || loadingId === addon.id}
                className="w-full mt-4 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60"
              >
                {loadingId === addon.id ? 'Redirecting…' : hasBasePlan ? 'Add to Subscription' : 'Requires Base Plan'}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6b7280]">
          Additional seats are enforced at enterprise deployment time and can be allocated across governed Nexus
          Enterprise nodes.
        </p>
      </CardContent>
    </Card>
  );
}

function SocialPostPacks() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleAddonCheckout = async (addonId: string) => {
    setLoadingId(addonId);
    setError('');
    try {
      const url = await startAddonCheckout(addonId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-white flex items-center gap-2">📱 Social Media Posts</CardTitle>
            <p className="text-sm text-[#9ca3af] mt-1">
              Purchase post packs to let your agents publish to LinkedIn, X, Instagram, and more via Post for Me.
            </p>
          </div>
          <Link href="/integrations" className="text-sm text-[#3b82f6] hover:underline shrink-0">
            Manage accounts →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SOCIAL_PACKS.map(pack => (
            <div
              key={pack.id}
              className={`relative rounded-xl border p-5 flex flex-col items-center text-center transition-all ${
                pack.popular
                  ? 'border-[#3b82f6]/40 bg-[#3b82f6]/5'
                  : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)]'
              }`}
            >
              {pack.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs px-3 py-0.5 rounded-full bg-[#3b82f6] text-white font-medium">
                  Best Value
                </span>
              )}
              <p className="text-white font-semibold text-lg mt-1">{pack.label}</p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-2xl font-bold text-white">${formatPrice(pack.price)}</span>
                <span className="text-[#6b7280] text-sm">/mo</span>
              </div>
              <p className="text-xs text-[#6b7280] mt-1">{pack.perPost}/post</p>
              <Button
                onClick={() => handleAddonCheckout(pack.id)}
                disabled={loadingId === pack.id}
                size="sm"
                className={`w-full mt-4 ${
                  pack.popular
                    ? 'bg-[#3b82f6] hover:bg-[#2563eb]'
                    : 'bg-[#1f2028] hover:bg-[#2a2d3a] text-white border border-[rgba(255,255,255,0.1)]'
                }`}
              >
                {loadingId === pack.id ? 'Redirecting…' : 'Buy Pack'}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6b7280] text-center">
          Post packs are billed monthly. Unused posts do not roll over. Includes all 9 platforms: LinkedIn, X,
          Instagram, Facebook, TikTok, YouTube, Threads, Bluesky, Pinterest.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Plan tabs ─────────────────────────────────────────────────────────────────

type TabKey = 'office' | 'agents' | 'full' | 'enterprise';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'office', label: 'Office' },
  { key: 'agents', label: 'Agents' },
  { key: 'full', label: 'Full Platform' },
  { key: 'enterprise', label: 'Enterprise' },
];

function getTabForPlanId(planId: string | null | undefined): TabKey {
  if (!planId) return 'office';
  if (planId === 'nexus_enterprise' || planId === 'enterprise') return 'enterprise';
  if (planId === 'full') return 'full';
  if (planId.startsWith('agents_')) return 'agents';
  return 'office';
}

interface CreditPack {
  id: string;
  label: string;
  tokens: number;
  price_display: string;
  price_cents: number;
}

function CreditPacks({ subscription }: { subscription: Subscription | null }) {
  const { data, isLoading } = useApi<{ data: CreditPack[] }>('/api/v1/billing/credits', async () => {
    const res = await fetch('/api/v1/billing/credits', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load LLM credit packs');
    return res.json();
  });

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const packs = data?.data ?? [];
  const ai = subscription?.ai ?? null;

  const handleCheckout = async (packId: string) => {
    setLoadingId(packId);
    setError('');
    try {
      const res = await fetch('/api/v1/billing/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pack_id: packId }),
      });
      const payload = await res.json().catch(() => ({}));
      const checkoutUrl = payload?.data?.checkout_url;
      if (!res.ok || !checkoutUrl) {
        throw new Error(payload?.error || 'Failed to start credits checkout');
      }
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start credits checkout');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-white">LLM Credits</CardTitle>
            <p className="text-sm text-[#9ca3af] mt-1">
              Buy managed Vutler credits if you do not want to bring your own provider key.
            </p>
          </div>
          <Link href="/providers" className="text-sm text-[#3b82f6] hover:underline shrink-0">
            Manage providers →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="border-t border-[rgba(255,255,255,0.06)] pt-5 space-y-4">
        {ai && (
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0f1119] p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-white font-medium">Current AI Balance</p>
                <p className="text-xs text-[#6b7280] mt-1">
                  Includes any remaining trial or legacy managed balance. BYOK usage never consumes this pool.
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{formatMetricValue(ai.balances?.total_remaining ?? 0)}</p>
                <p className="text-xs text-[#6b7280]">normalized managed balance</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent">
                Included / mo {formatMetricValue(ai.monthly_included_credits ?? 0)}
              </Badge>
              <Badge variant="outline" className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] bg-transparent">
                Used {formatMetricValue(ai.current_period?.credits_consumed ?? 0)}
              </Badge>
              {(ai.balances?.trial_remaining ?? 0) > 0 && (
                <Badge variant="outline" className="border-blue-500/30 text-blue-300 bg-blue-500/10">
                  Trial {formatMetricValue(ai.balances.trial_remaining)}
                </Badge>
              )}
              {(ai.balances?.plan_remaining ?? 0) > 0 && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                  Included {formatMetricValue(ai.balances.plan_remaining)}
                </Badge>
              )}
              {(ai.balances?.topup_remaining ?? 0) > 0 && (
                <Badge variant="outline" className="border-violet-500/30 text-violet-300 bg-violet-500/10">
                  Top-up {formatMetricValue(ai.balances.topup_remaining)}
                </Badge>
              )}
              {(ai.balances?.legacy_remaining ?? 0) > 0 && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/10">
                  Legacy {formatMetricValue(ai.balances.legacy_remaining)}
                </Badge>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-40 rounded-xl bg-[#1f2028]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="rounded-xl border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)] p-5 text-center"
              >
                <p className="text-white font-semibold text-lg">{pack.label}</p>
                <p className="text-[#9ca3af] text-sm mt-1">{pack.tokens.toLocaleString()} tokens</p>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-white">{pack.price_display}</span>
                </div>
                <Button
                  onClick={() => handleCheckout(pack.id)}
                  disabled={loadingId === pack.id}
                  className="w-full mt-4 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60"
                >
                  {loadingId === pack.id ? 'Redirecting…' : 'Buy Credits'}
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[#6b7280] leading-relaxed">
          Phase 1 keeps checkout packs on the existing token denomination while dashboard analytics now normalize
          managed usage by billing tier. Already have an API key?{' '}
          <Link href="/providers" className="text-[#3b82f6] hover:underline">
            Connect it in Providers
          </Link>{' '}
          — tokens are unlimited when you use your own key.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const {
    data: plans,
    isLoading: plansLoading,
    error: plansError,
  } = useApi<PlansResponse>('/api/v1/billing/plans', getPlans);

  const { data: subscription, isLoading: subLoading } = useApi<Subscription | null>(
    '/api/v1/billing/subscription',
    getSubscription
  );

  const [activeTab, setActiveTab] = useState<TabKey>('office');
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const isLoading = plansLoading || subLoading;
  const resolvedPlans: PlansResponse = plans ?? FALLBACK_PLANS;
  const currentPlans: Plan[] = resolvedPlans[activeTab] ?? [];
  const showEnterpriseAddons = activeTab === 'enterprise';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const plan = params.get('plan');
    if (tab === 'office' || tab === 'agents' || tab === 'full' || tab === 'enterprise') {
      setActiveTab(tab);
    } else if (plan) {
      setActiveTab(getTabForPlanId(plan));
    }
    if (plan) {
      setRecommendedPlanId(plan);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !subscription?.planId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab')) return;
    setActiveTab(current => (current === 'office' ? getTabForPlanId(subscription.planId) : current));
  }, [subscription?.planId]);

  const handleCheckout = useCallback(
    async (planId: string) => {
      setCheckoutLoadingId(planId);
      setActionError('');
      try {
        const res = await checkout(planId, interval);
        if (res.url) window.location.href = res.url;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
      } finally {
        setCheckoutLoadingId(null);
      }
    },
    [interval]
  );

  const handlePortal = useCallback(async () => {
    setPortalLoading(true);
    setActionError('');
    try {
      const res = await portal();
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-0">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Plans & Billing</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Manage your subscription, view usage, and upgrade your plan.</p>
      </div>

      {/* Errors */}
      {(plansError || actionError) && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {plansError?.message || actionError}
        </div>
      )}

      {/* Current Plan */}
      {!subLoading && (
        <CurrentPlanCard subscription={subscription ?? null} onManage={handlePortal} portalLoading={portalLoading} />
      )}

      <CreditPacks subscription={subscription ?? null} />

      {/* Social Media Post Packs */}
      <SocialPostPacks />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category tabs */}
        <div className="flex bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1 gap-1 w-full sm:w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'bg-[#3b82f6] text-white' : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Billing interval */}
        <div className="flex items-center gap-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              interval === 'monthly' ? 'bg-[#1e293b] text-white' : 'text-[#9ca3af] hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              interval === 'yearly' ? 'bg-[#1e293b] text-white' : 'text-[#9ca3af] hover:text-white'
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
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-80 rounded-2xl bg-[#14151f]" />
          ))}
        </div>
      ) : currentPlans.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {currentPlans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                interval={interval}
                currentPlanId={subscription?.planId ?? null}
                onCheckout={handleCheckout}
                loadingId={checkoutLoadingId}
                recommendedPlanId={recommendedPlanId}
              />
            ))}
          </div>
          {showEnterpriseAddons && <NexusEnterpriseAddons subscription={subscription ?? null} />}
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
          Need custom limits, SLAs, or white-labelling? See the{' '}
          <button onClick={() => setActiveTab('enterprise')} className="text-[#3b82f6] hover:underline">
            Enterprise tab
          </button>{' '}
          or{' '}
          <a href="mailto:enterprise@vutler.com" className="text-[#3b82f6] hover:underline">
            contact us for Enterprise
          </a>
          .
        </p>
      </div>
    </div>
  );
}
