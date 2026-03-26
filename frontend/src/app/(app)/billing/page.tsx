'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanLimits {
  agents?: number;
  tokens?: number;
  storage?: string;
  nexusNodes?: number;
}

interface Plan {
  id: string;
  label: string;
  price: { monthly: number; yearly: number };
  features: string[];
  limits: PlanLimits;
}

interface PlansResponse {
  office: Plan[];
  agents: Plan[];
  full: Plan[];
}

interface Subscription {
  planId: string | null;
  interval: 'monthly' | 'yearly';
}

type TabKey = 'office' | 'agents' | 'full';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'office', label: 'Office' },
  { key: 'agents', label: 'Agents' },
  { key: 'full', label: 'Full Platform' },
];

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  interval,
  currentPlanId,
  onCheckout,
  loading,
}: {
  plan: Plan;
  interval: 'monthly' | 'yearly';
  currentPlanId: string | null;
  onCheckout: (planId: string) => void;
  loading: string | null;
}) {
  const isCurrent = plan.id === currentPlanId;
  const price = interval === 'yearly' ? plan.price.yearly : plan.price.monthly;
  const displayPrice = (price / 100).toFixed(0);
  const isLoading = loading === plan.id;

  return (
    <div
      className={`flex flex-col bg-[#14151f] border rounded-2xl p-6 transition-all duration-200 ${
        isCurrent
          ? 'border-[#3b82f6] shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
          : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.14)]'
      }`}
    >
      {/* Plan header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-white font-semibold text-lg">{plan.label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-white">${displayPrice}</span>
            <span className="text-[#6b7280] text-sm">/{interval === 'yearly' ? 'yr' : 'mo'}</span>
          </div>
        </div>
        {isCurrent && (
          <span className="shrink-0 text-xs font-medium bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 px-2.5 py-1 rounded-full">
            Current Plan
          </span>
        )}
      </div>

      {/* Limits */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {plan.limits.agents !== undefined && (
          <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
            <p className="text-white font-semibold text-sm">{plan.limits.agents}</p>
            <p className="text-[#6b7280] text-xs">Agents</p>
          </div>
        )}
        {plan.limits.nexusNodes !== undefined && (
          <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
            <p className="text-white font-semibold text-sm">{plan.limits.nexusNodes}</p>
            <p className="text-[#6b7280] text-xs">Nexus Nodes</p>
          </div>
        )}
        {plan.limits.tokens !== undefined && (
          <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
            <p className="text-white font-semibold text-sm">
              {plan.limits.tokens >= 1_000_000
                ? `${plan.limits.tokens / 1_000_000}M`
                : `${plan.limits.tokens / 1_000}K`}
            </p>
            <p className="text-[#6b7280] text-xs">Tokens</p>
          </div>
        )}
        {plan.limits.storage && (
          <div className="bg-[#0a0b14] rounded-lg px-3 py-2 text-center">
            <p className="text-white font-semibold text-sm">{plan.limits.storage}</p>
            <p className="text-[#6b7280] text-xs">Storage</p>
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="flex-1 space-y-2 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[#9ca3af]">
            <svg className="w-4 h-4 text-[#3b82f6] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="py-2.5 text-center text-sm text-[#6b7280] border border-[rgba(255,255,255,0.07)] rounded-lg">
          Active
        </div>
      ) : (
        <button
          onClick={() => onCheckout(plan.id)}
          disabled={isLoading}
          className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Redirecting…' : 'Upgrade'}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('office');
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [plansRes, subRes] = await Promise.all([
        authFetch('/api/v1/billing/plans'),
        authFetch('/api/v1/billing/subscription'),
      ]);
      if (!plansRes.ok) throw new Error('Failed to load plans');
      const plansData: PlansResponse = await plansRes.json();
      setPlans(plansData);
      if (subRes.ok) {
        const subData: Subscription = await subRes.json();
        setSubscription(subData);
      }
    } catch {
      setError('Failed to load billing data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCheckout(planId: string) {
    setCheckoutLoading(planId);
    try {
      const res = await authFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          interval,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  }

  const currentPlans = plans?.[activeTab] ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Plans & Billing</h1>
        {subscription?.planId && (
          <span className="text-xs font-medium bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 px-2.5 py-1 rounded-full">
            {subscription.planId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Controls: tabs + interval toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1 gap-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Interval toggle */}
        <div className="flex items-center gap-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-1">
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

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl h-80 animate-pulse" />
          ))}
        </div>
      )}

      {/* Plan cards */}
      {!loading && currentPlans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={interval}
              currentPlanId={subscription?.planId ?? null}
              onCheckout={handleCheckout}
              loading={checkoutLoading}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && currentPlans.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <p className="text-white font-semibold">No plans available</p>
          <p className="text-[#6b7280] text-sm">Check back soon or contact us.</p>
        </div>
      )}

      {/* Enterprise footer */}
      <div className="border-t border-[rgba(255,255,255,0.07)] pt-6 text-center">
        <p className="text-[#6b7280] text-sm">
          Need more?{' '}
          <a
            href="mailto:enterprise@vutler.com"
            className="text-[#3b82f6] hover:underline"
          >
            Contact us for Enterprise
          </a>
        </p>
      </div>
    </div>
  );
}
