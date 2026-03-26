'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Plan data from featureGate.js ────────────────────────────────────────────

type PlanId = 'free' | 'office_starter' | 'office_team' | 'agents_starter' | 'agents_pro' | 'full' | 'enterprise' | 'beta';

interface Plan {
  id: PlanId;
  label: string;
  tier: string;
  price: { monthly: number; yearly: number };
  limits: {
    agents: number;
    tokens_month: number;
    storage_gb: number;
    nexus_nodes?: number;
    nexus_local?: number;
    nexus_enterprise?: number;
  };
  features: string[];
  highlight?: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    label: 'Free',
    tier: 'free',
    price: { monthly: 0, yearly: 0 },
    limits: { agents: 1, tokens_month: 50000, storage_gb: 1 },
    features: ['context'],
  },
  {
    id: 'office_starter',
    label: 'Office Starter',
    tier: 'office',
    price: { monthly: 2900, yearly: 29000 },
    limits: { agents: 0, tokens_month: 100000, storage_gb: 10 },
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'whatsapp', 'dashboard', 'goals', 'crm', 'pixel-office'],
  },
  {
    id: 'office_team',
    label: 'Office Team',
    tier: 'office',
    price: { monthly: 7900, yearly: 79000 },
    limits: { agents: 0, tokens_month: 500000, storage_gb: 100 },
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'whatsapp', 'dashboard', 'goals', 'crm', 'pixel-office'],
  },
  {
    id: 'agents_starter',
    label: 'Agents Starter',
    tier: 'agents',
    price: { monthly: 2900, yearly: 29000 },
    limits: { agents: 25, tokens_month: 250000, storage_gb: 10, nexus_nodes: 2, nexus_local: 2, nexus_enterprise: 0 },
    features: ['agents', 'nexus', 'marketplace', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
  },
  {
    id: 'agents_pro',
    label: 'Agents Pro',
    tier: 'agents',
    price: { monthly: 7900, yearly: 79000 },
    limits: { agents: 100, tokens_month: 1000000, storage_gb: 100, nexus_nodes: 10, nexus_local: 10, nexus_enterprise: 3 },
    features: ['agents', 'nexus', 'marketplace', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
    highlight: true,
    badge: 'Most Popular',
  },
  {
    id: 'full',
    label: 'Full Platform',
    tier: 'full',
    price: { monthly: 12900, yearly: 129000 },
    limits: { agents: 100, tokens_month: 1000000, storage_gb: 100, nexus_nodes: 10, nexus_local: 10, nexus_enterprise: 5 },
    features: ['*'],
    badge: 'Best Value',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    tier: 'enterprise',
    price: { monthly: 0, yearly: 0 },
    limits: { agents: -1, tokens_month: -1, storage_gb: -1, nexus_nodes: -1, nexus_local: -1, nexus_enterprise: -1 },
    features: ['*'],
  },
  {
    id: 'beta',
    label: 'Open Beta',
    tier: 'beta',
    price: { monthly: 0, yearly: 0 },
    limits: { agents: 50, tokens_month: 500000, storage_gb: 50, nexus_nodes: 5, nexus_local: 5, nexus_enterprise: 1 },
    features: ['*'],
    badge: 'Current',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(cents: number, yearly: boolean): string {
  if (cents === 0) return 'Free';
  const monthly = yearly ? Math.round(cents / 100 / 12) : cents / 100;
  return `$${monthly}`;
}

function fmtTokens(n: number): string {
  if (n === -1) return 'Unlimited';
  if (n >= 1000000) return `${n / 1000000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return String(n);
}

function fmtLimit(n: number): string {
  if (n === -1) return 'Unlimited';
  if (n === 0) return '—';
  return String(n);
}

// ─── Feature comparison data ──────────────────────────────────────────────────

interface ComparisonRow {
  label: string;
  key: string;
  type: 'feature' | 'limit' | 'custom';
  getValue?: (plan: Plan) => string | boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Max agents', key: 'agents', type: 'limit', getValue: (p) => fmtLimit(p.limits.agents) },
  { label: 'Tokens / month', key: 'tokens', type: 'limit', getValue: (p) => fmtTokens(p.limits.tokens_month) },
  { label: 'Storage', key: 'storage', type: 'limit', getValue: (p) => p.limits.storage_gb === -1 ? 'Unlimited' : `${p.limits.storage_gb}GB` },
  { label: 'Nexus nodes', key: 'nexus_nodes', type: 'limit', getValue: (p) => fmtLimit(p.limits.nexus_nodes ?? 0) },
  { label: 'Enterprise nodes', key: 'nexus_enterprise', type: 'limit', getValue: (p) => fmtLimit(p.limits.nexus_enterprise ?? 0) },
  { label: 'Chat', key: 'chat', type: 'feature' },
  { label: 'Email', key: 'email', type: 'feature' },
  { label: 'Drive', key: 'drive', type: 'feature' },
  { label: 'Tasks', key: 'tasks', type: 'feature' },
  { label: 'Calendar', key: 'calendar', type: 'feature' },
  { label: 'CRM', key: 'crm', type: 'feature' },
  { label: 'Agents', key: 'agents_feature', type: 'feature', getValue: (p) => p.features.includes('*') || p.features.includes('agents') },
  { label: 'Nexus CLI', key: 'nexus', type: 'feature' },
  { label: 'Builder', key: 'builder', type: 'feature' },
  { label: 'Sandbox', key: 'sandbox', type: 'feature' },
  { label: 'Marketplace', key: 'marketplace', type: 'feature' },
  { label: 'Swarm (multi-agent)', key: 'swarm', type: 'feature' },
  { label: 'Automations', key: 'automations', type: 'feature' },
  { label: 'Memory & context', key: 'memory', type: 'feature', getValue: (p) => p.features.includes('*') || (Array.isArray(p.features) && p.features.some((f) => f === 'context' || f === 'memory')) },
];

function hasFeature(plan: Plan, key: string): boolean {
  if (plan.features.includes('*' as never)) return true;
  return (plan.features as string[]).includes(key);
}

function getCellValue(plan: Plan, row: ComparisonRow): string | boolean {
  if (row.getValue) return row.getValue(plan);
  if (row.type === 'feature') return hasFeature(plan, row.key);
  return '—';
}

// ─── Check / X icons ─────────────────────────────────────────────────────────

function Check() {
  return (
    <svg className="w-5 h-5 text-green-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg className="w-5 h-5 text-white/15 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Tier color helpers ───────────────────────────────────────────────────────

function tierColor(tier: string) {
  switch (tier) {
    case 'free': return { text: 'text-white/60', border: 'border-white/10', bg: 'from-white/5', ring: '', badge: '' };
    case 'office': return { text: 'text-blue-400', border: 'border-blue-500/25', bg: 'from-blue-600/8', ring: '', badge: 'bg-blue-600/20 text-blue-400 border-blue-500/30' };
    case 'agents': return { text: 'text-purple-400', border: 'border-purple-500/25', bg: 'from-purple-600/8', ring: 'ring-1 ring-purple-500/30', badge: 'bg-purple-600/20 text-purple-400 border-purple-500/30' };
    case 'full': return { text: 'text-green-400', border: 'border-green-500/25', bg: 'from-green-600/8', ring: '', badge: 'bg-green-600/20 text-green-400 border-green-500/30' };
    case 'enterprise': return { text: 'text-orange-400', border: 'border-orange-500/25', bg: 'from-orange-600/8', ring: '', badge: 'bg-orange-600/20 text-orange-400 border-orange-500/30' };
    case 'beta': return { text: 'text-cyan-400', border: 'border-cyan-500/25', bg: 'from-cyan-600/8', ring: 'ring-1 ring-cyan-500/30', badge: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30' };
    default: return { text: 'text-white/60', border: 'border-white/10', bg: 'from-white/5', ring: '', badge: '' };
  }
}

// ─── Card plans (main grid) ───────────────────────────────────────────────────

const DISPLAY_PLANS: PlanId[] = ['free', 'office_starter', 'office_team', 'agents_starter', 'agents_pro', 'full', 'enterprise', 'beta'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);

  const displayPlans = PLANS.filter((p) => DISPLAY_PLANS.includes(p.id));

  return (
    <div className="min-h-screen bg-[#08090f] pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-blue-600/15 text-blue-400 border-blue-500/30 border">Pricing</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Pay for what you use
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-8">
            No per-seat fees. No surprise bills. Full access to all features during Open Beta.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 p-1 rounded-full border border-white/10 bg-[#0e0f1a]">
            <button
              onClick={() => setYearly(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${!yearly ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-white/50 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${yearly ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-white/50 hover:text-white'}`}
            >
              Yearly
              <Badge className="bg-green-600 text-white border-0 text-xs py-0 px-1.5">Save 17%</Badge>
            </button>
          </div>
        </div>

        {/* Plan cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
          {displayPlans.map((plan) => {
            const colors = tierColor(plan.tier);
            const price = fmtPrice(yearly ? plan.price.yearly : plan.price.monthly, yearly);
            const isCustom = plan.id === 'enterprise';
            const isBeta = plan.id === 'beta';

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border ${colors.border} bg-gradient-to-br ${colors.bg} to-transparent p-6 ${colors.ring}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <Badge className={`border ${colors.badge} shadow-lg text-xs`}>{plan.badge}</Badge>
                  </div>
                )}

                <div className="mb-5">
                  <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-1">
                    {plan.tier === 'full' ? 'Office + Agents' : plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)}
                  </div>
                  <h3 className="text-lg font-bold mb-3">{plan.label}</h3>

                  {isCustom ? (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold ${colors.text}`}>Custom</span>
                    </div>
                  ) : isBeta ? (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold ${colors.text}`}>Free</span>
                      <span className="text-white/30 text-sm">during beta</span>
                    </div>
                  ) : plan.price.monthly === 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold ${colors.text}`}>Free</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold ${colors.text}`}>{price}</span>
                        <span className="text-white/30 text-sm">/mo</span>
                      </div>
                      {yearly && plan.price.yearly > 0 && (
                        <div className="text-xs text-white/30 mt-0.5">
                          billed ${plan.price.yearly / 100}/yr
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Limits */}
                <div className="space-y-2 mb-5 flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Agents</span>
                    <span className={`font-medium ${colors.text}`}>{fmtLimit(plan.limits.agents)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Tokens/mo</span>
                    <span className={`font-medium ${colors.text}`}>{fmtTokens(plan.limits.tokens_month)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Storage</span>
                    <span className={`font-medium ${colors.text}`}>{plan.limits.storage_gb === -1 ? 'Unlimited' : `${plan.limits.storage_gb}GB`}</span>
                  </div>
                  {plan.limits.nexus_nodes !== undefined && (
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Nexus nodes</span>
                      <span className={`font-medium ${colors.text}`}>{fmtLimit(plan.limits.nexus_nodes)}</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                {isCustom ? (
                  <Button variant="outline" className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10" asChild>
                    <a href="mailto:sales@vutler.ai">Contact Sales</a>
                  </Button>
                ) : isBeta ? (
                  <Button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white" asChild>
                    <Link href="/register">Join Beta Free</Link>
                  </Button>
                ) : plan.price.monthly === 0 ? (
                  <Button variant="outline" className="w-full border-white/20 text-white/60 hover:text-white" asChild>
                    <Link href="/register">Get Started</Link>
                  </Button>
                ) : (
                  <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" asChild>
                    <Link href="/register">Start Free Trial</Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature comparison table */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold mb-8 text-center">Full feature comparison</h2>

          {/* Horizontal scroll wrapper for mobile */}
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-[#0e0f1a]">
                  <th className="text-left px-6 py-4 text-white/40 font-medium w-48">Feature</th>
                  {displayPlans.map((plan) => {
                    const colors = tierColor(plan.tier);
                    return (
                      <th key={plan.id} className="px-4 py-4 text-center">
                        <span className={`font-semibold text-xs uppercase tracking-wide ${colors.text}`}>{plan.label}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.key}
                    className={`border-t border-white/5 ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#0a0b12]/50'}`}
                  >
                    <td className="px-6 py-3 text-white/60 font-medium">{row.label}</td>
                    {displayPlans.map((plan) => {
                      const value = getCellValue(plan, row);
                      return (
                        <td key={plan.id} className="px-4 py-3 text-center">
                          {typeof value === 'boolean' ? (
                            value ? <Check /> : <Cross />
                          ) : (
                            <span className="text-white/60 text-xs">{value}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ / notes */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: '🔓',
              title: 'No per-seat pricing',
              desc: 'Your whole team uses Vutler for a single flat price. No per-user charges, ever.',
            },
            {
              icon: '🇨🇭',
              title: 'Swiss hosted',
              desc: 'All data stored in Geneva, Switzerland. GDPR compliant. Your data never leaves Europe.',
            },
            {
              icon: '🔀',
              title: '200+ AI models',
              desc: 'OpenRouter integration gives you access to Claude, GPT-4, Gemini, and 200+ other models.',
            },
            {
              icon: '📦',
              title: 'Open Source core',
              desc: 'Vutler Agents is AGPL-3.0. Self-host for free, or use our managed cloud.',
            },
            {
              icon: '⚡',
              title: 'Token-based billing',
              desc: 'Pay for the tokens you use, not the number of people using the platform.',
            },
            {
              icon: '🔒',
              title: 'Enterprise SLA',
              desc: 'Custom contracts, SLAs, SSO, and dedicated support for large organizations.',
            },
          ].map((item) => (
            <div key={item.title} className="p-6 rounded-xl border border-white/5 bg-[#14151f]">
              <span className="text-2xl mb-3 block">{item.icon}</span>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/5 to-purple-600/5 p-12">
          <h3 className="text-3xl font-bold mb-4">Start free during Open Beta</h3>
          <p className="text-white/50 mb-8 max-w-lg mx-auto">
            Full platform access. No credit card required. Upgrade when ready.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white h-12 px-8 text-base font-semibold shadow-xl shadow-blue-600/25" asChild>
              <Link href="/register">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/20 text-white/70 hover:text-white" asChild>
              <a href="mailto:sales@vutler.ai">Talk to Sales</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
