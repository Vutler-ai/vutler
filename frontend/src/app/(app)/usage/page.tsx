'use client';

import { useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageRecord {
  id?: string;
  agent?: string;
  agent_name?: string;
  model?: string;
  provider?: string;
  billing_source?: string | null;
  billing_tier?: string | null;
  credit_multiplier?: number | null;
  credits_debited?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  tokens?: number;
  requests?: number;
  latency_ms?: number;
  estimated_cost?: number;
  created_at?: string;
  timestamp?: string;
}

interface UsageResponse {
  success?: boolean;
  data: UsageRecord[];
  total_tokens?: number;
  total_requests?: number;
  total_cost?: number;
  avg_latency_ms?: number;
  billing_sources?: {
    byok_tokens?: number;
    managed_tokens?: number;
  };
  billing_tiers?: {
    standard?: number;
    advanced?: number;
    premium?: number;
  };
  credits_consumed?: number;
  credit_summary?: {
    total_remaining?: number;
    trial_remaining?: number;
    plan_remaining?: number;
    topup_remaining?: number;
    legacy_remaining?: number;
  };
  current_period?: {
    credits_consumed?: number;
    by_tier?: {
      standard?: number;
      advanced?: number;
      premium?: number;
    };
    by_source?: {
      byok_tokens?: number;
      managed_tokens?: number;
    };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (!n) return '$0.00';
  return `$${n.toFixed(4)}`;
}

function fmtDate(d: string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function exportCsv(data: UsageRecord[]): void {
  const headers = [
    'Agent',
    'Model',
    'Provider',
    'Billing Source',
    'Billing Tier',
    'Credits Debited',
    'Input Tokens',
    'Output Tokens',
    'Total Tokens',
    'Requests',
    'Est. Cost',
    'Timestamp',
  ];
  const rows = data.map(r => [
    r.agent_name ?? r.agent ?? '',
    r.model ?? '',
    r.provider ?? '',
    r.billing_source ?? '',
    r.billing_tier ?? '',
    r.credits_debited ?? '',
    r.input_tokens ?? '',
    r.output_tokens ?? '',
    r.tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    r.requests ?? '',
    r.estimated_cost ?? '',
    r.created_at ?? r.timestamp ?? '',
  ]);
  const csv = [headers, ...rows].map(row => row.map(String).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usage-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}
          />
          <div>
            <p className="text-xs text-[#9ca3af] uppercase tracking-wide font-medium">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Provider badge color ─────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string | undefined }) {
  const colors: Record<string, string> = {
    openai: 'bg-[#10a37f]/15 text-[#10a37f] border-[#10a37f]/30',
    anthropic: 'bg-[#d97757]/15 text-[#d97757] border-[#d97757]/30',
    groq: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30',
    mistral: 'bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30',
    openrouter: 'bg-[#7c3aed]/15 text-[#7c3aed] border-[#7c3aed]/30',
    ollama: 'bg-[#6b7280]/15 text-[#9ca3af] border-[#6b7280]/30',
  };
  const key = (provider ?? '').toLowerCase();
  const cls = colors[key] ?? 'bg-[#374151]/15 text-[#9ca3af] border-[#374151]/30';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>{provider ?? '—'}</span>
  );
}

function BillingBadge({ value, kind }: { value: string | null | undefined; kind: 'source' | 'tier' }) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .split(' ')[0];
  const sourceColors: Record<string, string> = {
    byok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    trial: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    included: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    legacy: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'top-up': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    managed_legacy: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    managed_plan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    managed_topup: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  };
  const tierColors: Record<string, string> = {
    standard: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
    advanced: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    premium: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
  const cls =
    kind === 'source'
      ? (sourceColors[normalized] ?? 'bg-[#374151]/15 text-[#9ca3af] border-[#374151]/30')
      : (tierColors[normalized] ?? 'bg-[#374151]/15 text-[#9ca3af] border-[#374151]/30');

  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>{value ?? '—'}</span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const { data, isLoading, error, mutate } = useApi<UsageResponse>('/api/v1/usage', () =>
    apiFetch<UsageResponse>('/api/v1/usage')
  );

  const records = data?.data ?? [];
  const totalTokens =
    data?.total_tokens ?? records.reduce((s, r) => s + (r.tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0)), 0);
  const totalRequests = data?.total_requests ?? records.reduce((s, r) => s + (r.requests ?? 1), 0);
  const totalCost = data?.total_cost ?? records.reduce((s, r) => s + (r.estimated_cost ?? 0), 0);
  const avgLatency =
    data?.avg_latency_ms ??
    (records.length > 0 ? Math.round(records.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / records.length) : 0);
  const billingSources = data?.billing_sources ?? { byok_tokens: 0, managed_tokens: 0 };
  const billingTiers = data?.billing_tiers ?? { standard: 0, advanced: 0, premium: 0 };
  const managedCreditsUsed = data?.current_period?.credits_consumed ?? data?.credits_consumed ?? 0;
  const remainingCredits = data?.credit_summary?.total_remaining ?? 0;

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Usage Analytics</h1>
          <p className="text-sm text-[#9ca3af] mt-1">
            Monitor token consumption and API calls across your agents, whether you run BYOK providers or Vutler-managed
            credits.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {records.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(records)}
              className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
            >
              Export CSV
            </Button>
          )}
          <Button size="sm" onClick={handleRefresh} className="bg-[#3b82f6] hover:bg-[#2563eb]">
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 rounded-xl bg-[#14151f]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Tokens Used" value={fmt(totalTokens)} color="from-blue-500 to-purple-600" />
            <StatCard label="Estimated Cost" value={fmtCost(totalCost)} color="from-green-500 to-emerald-600" />
            <StatCard label="API Calls" value={fmt(totalRequests)} color="from-yellow-500 to-orange-500" />
            <StatCard
              label="Avg Latency"
              value={avgLatency ? `${avgLatency}ms` : '—'}
              color="from-pink-500 to-rose-600"
            />
          </div>
          <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-[#9ca3af] uppercase tracking-wide font-medium">Billing Split</p>
                  <p className="text-sm text-[#6b7280] mt-1">
                    Managed runtime now records billable source and tier separately from BYOK traffic.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{fmtCompact(remainingCredits)}</p>
                  <p className="text-xs text-[#6b7280]">remaining managed balance</p>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg bg-[#0f1119] px-3 py-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Managed credits</p>
                  <p className="text-white font-semibold mt-1">{fmtCompact(managedCreditsUsed)}</p>
                </div>
                <div className="rounded-lg bg-[#0f1119] px-3 py-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">BYOK tokens</p>
                  <p className="text-white font-semibold mt-1">{fmtCompact(billingSources.byok_tokens ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-[#0f1119] px-3 py-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Managed tokens</p>
                  <p className="text-white font-semibold mt-1">{fmtCompact(billingSources.managed_tokens ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-[#0f1119] px-3 py-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wide">Premium credits</p>
                  <p className="text-white font-semibold mt-1">{fmtCompact(billingTiers.premium ?? 0)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <BillingBadge kind="tier" value={`standard ${fmtCompact(billingTiers.standard ?? 0)}`} />
                <BillingBadge kind="tier" value={`advanced ${fmtCompact(billingTiers.advanced ?? 0)}`} />
                <BillingBadge kind="tier" value={`premium ${fmtCompact(billingTiers.premium ?? 0)}`} />
                {(data?.credit_summary?.trial_remaining ?? 0) > 0 && (
                  <BillingBadge
                    kind="source"
                    value={`trial ${fmtCompact(data?.credit_summary?.trial_remaining ?? 0)}`}
                  />
                )}
                {(data?.credit_summary?.plan_remaining ?? 0) > 0 && (
                  <BillingBadge
                    kind="source"
                    value={`included ${fmtCompact(data?.credit_summary?.plan_remaining ?? 0)}`}
                  />
                )}
                {(data?.credit_summary?.topup_remaining ?? 0) > 0 && (
                  <BillingBadge
                    kind="source"
                    value={`top-up ${fmtCompact(data?.credit_summary?.topup_remaining ?? 0)}`}
                  />
                )}
                {(data?.credit_summary?.legacy_remaining ?? 0) > 0 && (
                  <BillingBadge
                    kind="source"
                    value={`legacy ${fmtCompact(data?.credit_summary?.legacy_remaining ?? 0)}`}
                  />
                )}
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-[#6b7280] mt-2">
            Usage includes both BYOK traffic and Vutler-managed runtime. Billing analytics now separate source and tier
            for new managed runs. Plans still do not enforce token caps by default.{' '}
            <a href="/billing" className="text-[#3b82f6] hover:underline">
              Purchase LLM Credits
            </a>{' '}
            if you need a managed runtime without your own key.
          </p>
        </>
      )}

      {/* Table */}
      <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)]">
        <CardHeader>
          <CardTitle className="text-white text-base">Usage Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-10 rounded-lg bg-[#1f2028]" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 mb-4 rounded-2xl bg-[#1f2028] flex items-center justify-center text-2xl">
                📊
              </div>
              <p className="text-white font-semibold mb-1">No usage data yet</p>
              <p className="text-[#9ca3af] text-sm max-w-sm">
                Start running your agents to see token consumption and API usage here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Agent</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Model</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Provider</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Source</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Tier</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium text-right">Input</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium text-right">Output</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium text-right">Total</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium text-right">Credits</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium text-right">Cost</TableHead>
                    <TableHead className="text-[#9ca3af] text-xs uppercase font-medium">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r, idx) => {
                    const total = r.tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
                    return (
                      <TableRow
                        key={r.id ?? idx}
                        className="border-[rgba(255,255,255,0.05)] hover:bg-[#1f2028]/50 transition-colors"
                      >
                        <TableCell className="text-white font-medium">{r.agent_name ?? r.agent ?? '—'}</TableCell>
                        <TableCell className="text-[#9ca3af] text-sm">{r.model ?? '—'}</TableCell>
                        <TableCell>
                          <ProviderBadge provider={r.provider} />
                        </TableCell>
                        <TableCell>
                          <BillingBadge kind="source" value={r.billing_source} />
                        </TableCell>
                        <TableCell>
                          <BillingBadge kind="tier" value={r.billing_tier} />
                        </TableCell>
                        <TableCell className="text-[#9ca3af] text-right text-sm">
                          {r.input_tokens != null ? fmt(r.input_tokens) : '—'}
                        </TableCell>
                        <TableCell className="text-[#9ca3af] text-right text-sm">
                          {r.output_tokens != null ? fmt(r.output_tokens) : '—'}
                        </TableCell>
                        <TableCell className="text-white text-right text-sm font-medium">{fmt(total)}</TableCell>
                        <TableCell className="text-white text-right text-sm font-medium">
                          {r.credits_debited ? fmtCompact(r.credits_debited) : '—'}
                        </TableCell>
                        <TableCell className="text-[#6b7280] text-right text-sm">
                          {r.estimated_cost != null ? fmtCost(r.estimated_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-[#6b7280] text-sm whitespace-nowrap">
                          {fmtDate(r.created_at ?? r.timestamp)}
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
    </div>
  );
}
