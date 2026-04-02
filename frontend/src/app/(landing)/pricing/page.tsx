'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckIcon, XMarkIcon, StarIcon } from '@heroicons/react/24/solid';

// ─── Plan data from featureGate.js ────────────────────────────────────────────

type PlanId = 'free' | 'office_starter' | 'office_team' | 'agents_starter' | 'agents_pro' | 'nexus_enterprise' | 'full' | 'enterprise' | 'beta';

interface Plan {
  id: PlanId;
  label: string;
  tier: string;
  price: { monthly: number; yearly: number };
  limits: {
    agents: number;
    storage_gb: number;
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
    limits: { agents: 1, storage_gb: 0.5 },
    features: ['agents', 'chat', 'dashboard'],
  },
  {
    id: 'office_starter',
    label: 'Office Starter',
    tier: 'office',
    price: { monthly: 2900, yearly: 29000 },
    limits: { agents: 2, storage_gb: 5 },
    features: ['agents', 'chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'dashboard', 'memory', 'pixel-office'],
  },
  {
    id: 'office_team',
    label: 'Office Pro',
    tier: 'office',
    price: { monthly: 7900, yearly: 79000 },
    limits: { agents: 10, storage_gb: 50 },
    features: ['agents', 'chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'dashboard', 'memory', 'goals', 'crm', 'pixel-office'],
  },
  {
    id: 'agents_starter',
    label: 'Agents Starter',
    tier: 'agents',
    price: { monthly: 2900, yearly: 29000 },
    limits: { agents: 10, storage_gb: 5 },
    features: ['agents', 'memory', 'nexus', 'sandbox', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
  },
  {
    id: 'agents_pro',
    label: 'Agents Pro',
    tier: 'agents',
    price: { monthly: 7900, yearly: 79000 },
    limits: { agents: 50, storage_gb: 25 },
    features: ['agents', 'memory', 'nexus', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
    highlight: true,
    badge: 'Most Popular',
  },
  {
    id: 'nexus_enterprise',
    label: 'Nexus Enterprise',
    tier: 'enterprise',
    price: { monthly: 149000, yearly: 1490000 },
    limits: { agents: 100, storage_gb: 100 },
    features: ['agents', 'nexus', 'builder', 'sandbox', 'swarm', 'automations', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard', 'enterprise-node', 'enterprise-seats', 'governance'],
    badge: 'Dedicated Runtime',
  },
  {
    id: 'full',
    label: 'Full Platform',
    tier: 'full',
    price: { monthly: 12900, yearly: 129000 },
    limits: { agents: 50, storage_gb: 100 },
    features: ['*'],
    badge: 'Best Value',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    tier: 'enterprise',
    price: { monthly: 0, yearly: 0 },
    limits: { agents: -1, storage_gb: -1 },
    features: ['*'],
  },
  {
    id: 'beta',
    label: 'Open Beta',
    tier: 'beta',
    price: { monthly: 0, yearly: 0 },
    limits: { agents: 50, storage_gb: 50 },
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

function fmtLimit(n: number): string {
  if (n === -1) return 'Unlimited';
  if (n === 0) return '—';
  return String(n);
}

function planFootnote(plan: Plan): string | null {
  if (plan.id === 'nexus_enterprise') {
    return 'Includes 1 governed enterprise node and 5 seats. Add +5 seats for $390/mo or another governed node for $500/mo.';
  }
  if (plan.id === 'enterprise') {
    return 'Custom packaging for multi-node rollouts, SLAs, and partner-led deployments.';
  }
  return null;
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
  { label: 'LLM (Bring Your Own Key)', key: 'byok', type: 'custom', getValue: () => true },
  { label: 'Storage', key: 'storage', type: 'limit', getValue: (p) => p.limits.storage_gb < 1 ? `${p.limits.storage_gb * 1000}MB` : `${p.limits.storage_gb}GB` },
  { label: 'Chat', key: 'chat', type: 'feature' },
  { label: 'Email', key: 'email', type: 'feature' },
  { label: 'Drive', key: 'drive', type: 'feature' },
  { label: 'Tasks', key: 'tasks', type: 'feature' },
  { label: 'Calendar', key: 'calendar', type: 'feature' },
  { label: 'CRM', key: 'crm', type: 'feature' },
  { label: 'Goals', key: 'goals', type: 'feature' },
  { label: 'Integrations', key: 'integrations', type: 'feature' },
  { label: 'Agents', key: 'agents_feature', type: 'feature', getValue: (p) => p.features.includes('*') || p.features.includes('agents') },
  { label: 'Nexus CLI', key: 'nexus', type: 'feature' },
  { label: 'Builder', key: 'builder', type: 'feature' },
  { label: 'Sandbox', key: 'sandbox', type: 'feature' },
  { label: 'Swarm (multi-agent)', key: 'swarm', type: 'feature' },
  { label: 'Automations', key: 'automations', type: 'feature' },
  { label: 'Memory (3-level)', key: 'memory', type: 'feature', getValue: (p) => p.features.includes('*') || p.features.includes('memory') },
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
  return <CheckIcon className="w-5 h-5 text-green-400 mx-auto" />;
}

function Cross() {
  return <XMarkIcon className="w-5 h-5 text-white/15 mx-auto" />;
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

const DISPLAY_PLANS: PlanId[] = ['free', 'office_starter', 'office_team', 'agents_starter', 'agents_pro', 'nexus_enterprise', 'full', 'enterprise', 'beta'];

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
            Clear pricing for office, agent, and dedicated Nexus Enterprise deployments. Enterprise packaging stays custom above that.
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
                    <Badge className={`border ${colors.badge} shadow-lg text-xs flex items-center gap-1`}>
                      {plan.badge === 'Most Popular' && <StarIcon className="w-3 h-3" />}
                      {plan.badge}
                    </Badge>
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
                    <span className="text-white/40">LLM</span>
                    <span className={`font-medium ${colors.text}`}>Bring Your Own Key</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Storage</span>
                    <span className={`font-medium ${colors.text}`}>{plan.limits.storage_gb < 1 ? `${plan.limits.storage_gb * 1000}MB` : `${plan.limits.storage_gb}GB`}</span>
                  </div>
                </div>

                {planFootnote(plan) && (
                  <p className="mb-5 rounded-xl border border-white/8 bg-[#0b0c14] px-3 py-2 text-xs leading-relaxed text-white/45">
                    {planFootnote(plan)}
                  </p>
                )}

                {/* CTA */}
                {isCustom ? (
                  <Button variant="outline" className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10" asChild>
                    <a href="mailto:sales@vutler.ai">Contact Sales</a>
                  </Button>
                ) : isBeta ? (
                  <Button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white" asChild>
                    <a href="https://app.vutler.ai/register">Join Beta Free</a>
                  </Button>
                ) : plan.price.monthly === 0 ? (
                  <Button variant="outline" className="w-full border-white/20 text-white/60 hover:text-white" asChild>
                    <a href="https://app.vutler.ai/register">Get Started</a>
                  </Button>
                ) : (
                  <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" asChild>
                    <a href="https://app.vutler.ai/register">Start Free Trial</a>
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
          <div className="overflow-x-auto rounded-2xl border border-white/5 scrollbar-hide">
            <table className="w-full min-w-[640px] lg:min-w-0 text-sm">
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
              title: 'Flat pricing',
              desc: 'Users included in your plan. Extra users available on Office Pro, Full, and Enterprise at +$5/user/mo.',
            },
            {
              icon: '🇨🇭',
              title: 'Swiss hosted',
              desc: 'All data stored in Geneva, Switzerland. GDPR compliant. Your data never leaves Europe.',
            },
            {
              icon: '🔀',
              title: '300+ AI models',
              desc: 'OpenRouter integration gives you access to Claude, GPT-4, Gemini, and 300+ other models.',
            },
            {
              icon: '🔑',
              title: 'Bring Your Own Key (BYOK)',
              desc: 'Connect your own OpenRouter, Anthropic, or OpenAI key. No token limits on any plan — you pay your provider directly. Usage tracking is for monitoring only.',
            },
            {
              icon: '🧩',
              title: 'Nexus Enterprise scaling',
              desc: 'Nexus Enterprise starts at $1,490/mo with 1 governed node and 5 seats included. Add +5 seats for $390/mo or an extra governed client node for $500/mo.',
            },
            {
              icon: '📦',
              title: 'Open Source core',
              desc: 'Vutler Agents is AGPL-3.0. Self-host for free, or use our managed cloud.',
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
            Open Beta access. No credit card required. Plan limits still apply.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white h-12 px-8 text-base font-semibold shadow-xl shadow-blue-600/25" asChild>
              <a href="https://app.vutler.ai/register">Get Started Free</a>
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
