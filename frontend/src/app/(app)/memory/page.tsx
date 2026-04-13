'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Search, ChevronRight, BookOpen, Users, Layers } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { getAgents } from '@/lib/api/endpoints/agents';
import {
  getWorkspaceKnowledge,
  updateWorkspaceKnowledge,
  updateWorkspaceKnowledgePolicy,
  getWorkspaceSessionBrief,
  updateWorkspaceSessionBrief,
  getJournalAutomationPolicies,
  getJournalAutomationSweepStatus,
  getWorkspaceJournal,
  updateJournalAutomationPolicy,
  updateWorkspaceJournal,
  runJournalAutomationSweep,
  summarizeWorkspaceJournal,
  getGroupMemorySpaces,
  createGroupMemorySpace,
  updateGroupMemorySpace,
  deleteGroupMemorySpace,
  getTemplateScopes,
  searchMemory,
  getAgentMemorySummary,
} from '@/lib/api/endpoints/memory';
import type {
  Agent,
  WorkspaceKnowledge,
  ContinuityBrief,
  JournalAutomationPolicies,
  JournalAutomationPolicy,
  JournalAutomationSweepResult,
  JournalState,
  GroupMemorySpace,
  TemplateScope,
  MemorySearchResult,
  AgentMemoryListResponse,
} from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { getAvatarImageUrl, isEmojiAvatar } from '@/lib/avatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function getAgentInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-[rgba(59,130,246,0.12)] flex items-center justify-center text-blue-400 flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-[#6b7280] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Section 1: Workspace Knowledge ──────────────────────────────────────────

function WorkspaceKnowledgeSection() {
  const { data, error, isLoading, mutate } = useApi<WorkspaceKnowledge>(
    '/api/v1/memory/workspace-knowledge',
    () => getWorkspaceKnowledge()
  );

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [policyStatus, setPolicyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [readAccess, setReadAccess] = useState<'workspace' | 'admin'>('workspace');
  const [writeAccess, setWriteAccess] = useState<'workspace' | 'admin'>('admin');

  const content = draft ?? data?.content ?? '';
  const policy = data?.policy ?? {
    read_access: 'workspace' as const,
    write_access: 'admin' as const,
  };

  useEffect(() => {
    setReadAccess(policy.read_access);
    setWriteAccess(policy.write_access);
  }, [policy.read_access, policy.write_access]);

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const updated = await updateWorkspaceKnowledge(content);
      await mutate(updated, { revalidate: false });
      setDraft(updated.content);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePolicy() {
    setSavingPolicy(true);
    setPolicyStatus('idle');
    try {
      const updated = await updateWorkspaceKnowledgePolicy({
        read_access: readAccess,
        write_access: writeAccess,
      });
      await mutate(updated, { revalidate: false });
      setPolicyStatus('success');
      setTimeout(() => setPolicyStatus('idle'), 2500);
    } catch {
      setPolicyStatus('error');
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<BookOpen className="w-4 h-4" />}
        title="Workspace Shared Instructions"
        subtitle="Shared system instructions loaded into every agent. This is the workspace-level SOUL.md."
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error.message}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-[#6b7280]">Read Access</label>
              <select
                value={readAccess}
                onChange={(e) => setReadAccess(e.target.value as 'workspace' | 'admin')}
                disabled={data?.readOnly}
                className="w-full h-10 px-3 rounded-md bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white text-sm disabled:opacity-50"
              >
                <option value="workspace">Workspace members</option>
                <option value="admin">Admins only</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-[#6b7280]">Write Access</label>
              <select
                value={writeAccess}
                onChange={(e) => setWriteAccess(e.target.value as 'workspace' | 'admin')}
                disabled={data?.readOnly}
                className="w-full h-10 px-3 rounded-md bg-[#0e0f1a] border border-[rgba(255,255,255,0.1)] text-white text-sm disabled:opacity-50"
              >
                <option value="admin">Admins only</option>
                <option value="workspace">Workspace members</option>
              </select>
            </div>
          </div>

          <Textarea
            value={content}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write global workspace instructions here..."
            className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[200px] font-mono text-sm focus:border-blue-500/50"
          />
        </div>
      )}

      <p className="mt-3 text-xs text-[#6b7280] leading-relaxed">
        This content is shared across agents in the workspace. Agent-specific soul/identity docs live inside each agent memory screen.
        Governance is workspace-scoped and persisted with the shared-memory policy.
      </p>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-[#4b5563]">
          {data?.updatedAt ? `Last updated: ${formatDate(data.updatedAt)}` : 'No shared instructions saved yet'}
          {data?.updatedByEmail ? ` · ${data.updatedByEmail}` : ''}
        </div>

        <div className="flex items-center gap-2">
          {policyStatus === 'success' && (
            <span className="text-xs text-emerald-400">Policy saved</span>
          )}
          {policyStatus === 'error' && (
            <span className="text-xs text-red-400">Policy save failed</span>
          )}
          {saveStatus === 'success' && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">Save failed</span>
          )}
          <Button
            size="sm"
            onClick={handleSavePolicy}
            disabled={
              savingPolicy
              || isLoading
              || error !== undefined
              || data?.readOnly
              || (readAccess === policy.read_access && writeAccess === policy.write_access)
            }
            className="bg-[#1f2937] hover:bg-[#111827] text-white disabled:opacity-40"
          >
            {savingPolicy ? 'Saving policy...' : 'Save Policy'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || isLoading || error !== undefined || draft === null || data?.readOnly}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {data?.readOnly ? 'Read only' : saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function WorkspaceSessionBriefSection() {
  const { data, error, isLoading, mutate } = useApi<ContinuityBrief>(
    '/api/v1/memory/session-brief',
    () => getWorkspaceSessionBrief()
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const content = draft ?? data?.content ?? '';

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const updated = await updateWorkspaceSessionBrief(content);
      await mutate(updated, { revalidate: false });
      setDraft(updated.content);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<Brain className="w-4 h-4" />}
        title="Workspace Session Brief"
        subtitle="Short continuity note injected at runtime for handoffs, resets, and autonomous retries."
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error.message}
        </div>
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Summarize the current workspace operating state, recent decisions, and active constraints."
          className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[180px] text-sm focus:border-blue-500/50"
        />
      )}

      <p className="mt-3 text-xs text-[#6b7280] leading-relaxed">
        This brief is stored as a governed Snipara summary and mirrored as a workspace continuity doc. Keep it compact and current.
      </p>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-[#4b5563]">
          {data?.updatedAt ? `Last updated: ${formatDate(data.updatedAt)}` : 'No continuity brief saved yet'}
          {data?.updatedByEmail ? ` · ${data.updatedByEmail}` : ''}
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === 'success' && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">Save failed</span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || isLoading || error !== undefined || !content.trim() || data?.readOnly}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {data?.readOnly ? 'Read only' : saving ? 'Saving...' : 'Save Brief'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function WorkspaceJournalSection() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const { data, error, isLoading, mutate } = useApi<JournalState>(
    `/api/v1/memory/journal/workspace?date=${selectedDate}`,
    () => getWorkspaceJournal(selectedDate)
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'automated' | 'summarized' | 'error'>('idle');

  useEffect(() => {
    setDraft(null);
    setStatus('idle');
  }, [selectedDate]);

  const content = draft ?? data?.content ?? '';

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const updated = await updateWorkspaceJournal(selectedDate, content);
      await mutate(updated, { revalidate: false });
      setDraft(updated.content);
      setStatus(updated.automation?.triggered ? 'automated' : 'saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    setStatus('idle');
    try {
      const result = await summarizeWorkspaceJournal(selectedDate);
      await mutate(result.journal, { revalidate: false });
      setDraft(result.journal.content);
      setStatus('summarized');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<Brain className="w-4 h-4" />}
        title="Workspace Daily Journal"
        subtitle="Operational notes for the day. Manual compaction remains available, and automation can now refresh the workspace brief on save."
      />

      <div className="mb-4 max-w-[220px]">
        <label className="text-xs uppercase tracking-wide text-[#6b7280]">Journal Date</label>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value || today)}
          className="mt-1 bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error.message}
        </div>
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Capture the important events, decisions, failures, and operator notes for this day."
          className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[180px] text-sm focus:border-blue-500/50"
        />
      )}

      <div className="flex items-center justify-between mt-3 gap-3">
        <div className="text-xs text-[#4b5563]">
          {data?.updatedAt ? `Last updated: ${formatDate(data.updatedAt)}` : 'No journal saved for this date'}
          {data?.updatedByEmail ? ` · ${data.updatedByEmail}` : ''}
          {data?.automationPolicy?.enabled
            ? ` · Auto-refresh on save from ${data.automationPolicy.minimum_length} chars`
            : ' · Manual compaction only'}
        </div>
        <div className="flex items-center gap-2">
          {status === 'saved' && <span className="text-xs text-emerald-400">Saved</span>}
          {status === 'automated' && <span className="text-xs text-emerald-400">Saved + brief refreshed</span>}
          {status === 'summarized' && <span className="text-xs text-emerald-400">Brief refreshed</span>}
          {status === 'error' && <span className="text-xs text-red-400">Action failed</span>}
          <Button
            size="sm"
            onClick={handleSummarize}
            disabled={summarizing || isLoading || error !== undefined || !content.trim() || data?.readOnly}
            className="bg-[#1f2937] hover:bg-[#111827] text-white disabled:opacity-40"
          >
            {summarizing ? 'Compacting...' : 'Summarize To Brief'}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || isLoading || error !== undefined || !content.trim() || data?.readOnly}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {data?.readOnly ? 'Read only' : saving ? 'Saving...' : 'Save Journal'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function JournalAutomationPolicyCard({
  label,
  description,
  policy,
  onSave,
}: {
  label: string;
  description: string;
  policy: JournalAutomationPolicy;
  onSave: (next: { mode: 'manual' | 'on_save'; minimum_length: number; sweep_enabled: boolean }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'manual' | 'on_save'>(policy.mode === 'on_save' ? 'on_save' : 'manual');
  const [minimumLength, setMinimumLength] = useState(String(policy.minimum_length || 120));
  const [sweepEnabled, setSweepEnabled] = useState(policy.sweep_enabled === true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setMode(policy.mode === 'on_save' ? 'on_save' : 'manual');
    setMinimumLength(String(policy.minimum_length || 120));
    setSweepEnabled(policy.sweep_enabled === true);
  }, [policy.mode, policy.minimum_length, policy.sweep_enabled]);

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      await onSave({
        mode,
        minimum_length: Math.max(1, Number.parseInt(minimumLength, 10) || policy.minimum_length || 120),
        sweep_enabled: sweepEnabled,
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0e0f1a] p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <p className="text-xs text-[#6b7280] mt-1">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
        <label className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-wide text-[#6b7280]">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode((e.target.value as 'manual' | 'on_save') || 'manual')}
            className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.1)] bg-[#14151f] px-3 text-sm text-white outline-none"
          >
            <option value="manual">Manual only</option>
            <option value="on_save">Auto refresh on save</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-wide text-[#6b7280]">Min Chars</span>
          <Input
            type="number"
            min={1}
            value={minimumLength}
            onChange={(e) => setMinimumLength(e.target.value)}
            className="bg-[#14151f] border-[rgba(255,255,255,0.1)] text-white"
          />
        </label>

        <div className="flex items-end gap-2">
          {status === 'success' && <span className="text-xs text-emerald-400">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-400">Failed</span>}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save Policy'}
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm text-white">
        <input
          type="checkbox"
          checked={sweepEnabled}
          onChange={(e) => setSweepEnabled(e.target.checked)}
          className="accent-blue-500"
        />
        Allow scheduled sweep automation to refresh this brief when the journal is newer than the current summary
      </label>

      <div className="text-xs text-[#4b5563]">
        {policy.enabled
          ? `Active. Journals above ${policy.minimum_length} chars refresh the target brief on save.`
          : 'Inactive. Operators keep full manual control over compaction.'}
        {policy.sweep_enabled ? ' Scheduled sweep is enabled.' : ' Scheduled sweep is disabled.'}
        {policy.updatedAt ? ` Last policy update: ${formatDate(policy.updatedAt)}` : ''}
        {policy.updatedByEmail ? ` · ${policy.updatedByEmail}` : ''}
      </div>
    </div>
  );
}

function JournalAutomationSection() {
  const { data, error, isLoading, mutate } = useApi<JournalAutomationPolicies>(
    '/api/v1/memory/journal-automation',
    () => getJournalAutomationPolicies()
  );
  const { data: sweepStatus, mutate: mutateSweepStatus } = useApi<JournalAutomationSweepResult>(
    '/api/v1/memory/journal-automation/sweep-status',
    () => getJournalAutomationSweepStatus()
  );
  const [runningSweep, setRunningSweep] = useState(false);
  const [sweepActionStatus, setSweepActionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  async function handleSave(scope: 'workspace' | 'agent', next: { mode: 'manual' | 'on_save'; minimum_length: number; sweep_enabled: boolean }) {
    if (!data) return;
    const updated = await updateJournalAutomationPolicy(scope, next);
    await mutate({
      workspace: scope === 'workspace' ? updated : data.workspace,
      agent: scope === 'agent' ? updated : data.agent,
    }, { revalidate: false });
  }

  async function handleRunSweep() {
    setRunningSweep(true);
    setSweepActionStatus('idle');
    try {
      const result = await runJournalAutomationSweep({ scope: 'all', force: true });
      await mutateSweepStatus(result, { revalidate: false });
      setSweepActionStatus('success');
      setTimeout(() => setSweepActionStatus('idle'), 3000);
    } catch {
      setSweepActionStatus('error');
    } finally {
      setRunningSweep(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<Layers className="w-4 h-4" />}
        title="Journal Automation"
        subtitle="Move beyond manual compaction by auto-refreshing continuity briefs when a saved journal is substantive enough."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error.message}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <JournalAutomationPolicyCard
            label="Workspace Journal"
            description="Refresh the workspace session brief automatically after a journal save when the note is long enough to be worth compacting."
            policy={data.workspace}
            onSave={(next) => handleSave('workspace', next)}
          />
          <JournalAutomationPolicyCard
            label="Agent Journals"
            description="Refresh each agent session brief automatically after journal saves, while still keeping the manual summarize action available."
            policy={data.agent}
            onSave={(next) => handleSave('agent', next)}
          />

          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0e0f1a] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Sweep Automation</h3>
                <p className="text-xs text-[#6b7280] mt-1">
                  Cron-friendly catch-up pass that refreshes workspace and agent session briefs when a saved journal is newer than the current summary.
                </p>
                <p className="mt-2 text-xs text-[#4b5563]">
                  {sweepStatus?.completed_at
                    ? `Last sweep: ${formatDate(sweepStatus.completed_at)} · ${sweepStatus.totals.refreshed}/${sweepStatus.totals.checked} refreshed`
                    : 'No sweep has run yet.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {sweepActionStatus === 'success' && <span className="text-xs text-emerald-400">Sweep complete</span>}
                {sweepActionStatus === 'error' && <span className="text-xs text-red-400">Sweep failed</span>}
                <Button
                  size="sm"
                  onClick={handleRunSweep}
                  disabled={runningSweep}
                  className="bg-[#1f2937] hover:bg-[#111827] text-white disabled:opacity-40"
                >
                  {runningSweep ? 'Sweeping...' : 'Run Sweep Now'}
                </Button>
              </div>
            </div>

            {sweepStatus && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#14151f] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Workspace</p>
                  <p className="mt-1 text-sm text-white">{sweepStatus.workspace.refreshed}/{sweepStatus.workspace.checked} refreshed</p>
                </div>
                <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#14151f] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Agents</p>
                  <p className="mt-1 text-sm text-white">{sweepStatus.agents.refreshed}/{sweepStatus.agents.checked} refreshed</p>
                </div>
                <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#14151f] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Skipped</p>
                  <p className="mt-1 text-sm text-white">{sweepStatus.totals.skipped}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildEmptyGroupMemoryDraft(): GroupMemorySpace {
  return {
    id: '',
    name: '',
    description: '',
    scope_type: 'workspace',
    target_role: 'general',
    read_access: 'workspace',
    write_access: 'admin',
    runtime_enabled: true,
    auto_promote_enabled: false,
    minimum_importance: 0.78,
    path: '',
    content: '',
    runtime_content: '',
    auto_entries: [],
    updatedAt: '',
  };
}

const EMPTY_GROUP_MEMORY_SPACES: GroupMemorySpace[] = [];

function GroupMemorySection() {
  const { data, error, isLoading, mutate } = useApi<GroupMemorySpace[]>(
    '/api/v1/memory/group-memory',
    () => getGroupMemorySpaces()
  );
  const spaces = data ?? EMPTY_GROUP_MEMORY_SPACES;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupMemorySpace>(buildEmptyGroupMemoryDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'deleted' | 'error'>('idle');

  useEffect(() => {
    if (!selectedId && spaces.length > 0) {
      setSelectedId(spaces[0].id);
      return;
    }
    if (selectedId && !spaces.find((space) => space.id === selectedId)) {
      setSelectedId(spaces[0]?.id ?? null);
    }
  }, [selectedId, spaces]);

  useEffect(() => {
    const selected = spaces.find((space) => space.id === selectedId);
    if (selected) {
      setDraft(selected);
    } else if (!selectedId) {
      setDraft(buildEmptyGroupMemoryDraft());
    }
  }, [selectedId, spaces]);

  const selected = spaces.find((space) => space.id === selectedId) ?? null;
  const isNew = !selected;

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      if (isNew) {
        const created = await createGroupMemorySpace({
          name: draft.name,
          description: draft.description,
          scope_type: draft.scope_type,
          target_role: draft.scope_type === 'role' ? draft.target_role : null,
          read_access: draft.read_access,
          write_access: draft.write_access,
          runtime_enabled: draft.runtime_enabled,
          auto_promote_enabled: draft.auto_promote_enabled,
          minimum_importance: draft.minimum_importance,
          content: draft.content,
        });
        await mutate([...spaces, created], { revalidate: true });
        setSelectedId(created.id);
      } else {
        const updated = await updateGroupMemorySpace(selected.id, {
          name: draft.name,
          description: draft.description,
          scope_type: draft.scope_type,
          target_role: draft.scope_type === 'role' ? draft.target_role : null,
          read_access: draft.read_access,
          write_access: draft.write_access,
          runtime_enabled: draft.runtime_enabled,
          auto_promote_enabled: draft.auto_promote_enabled,
          minimum_importance: draft.minimum_importance,
          content: draft.content,
        });
        await mutate(
          spaces.map((space) => (space.id === updated.id ? updated : space)),
          { revalidate: true }
        );
        setSelectedId(updated.id);
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setStatus('idle');
    try {
      await deleteGroupMemorySpace(selected.id);
      const remaining = spaces.filter((space) => space.id !== selected.id);
      await mutate(remaining, { revalidate: true });
      setSelectedId(remaining[0]?.id ?? null);
      if (remaining.length === 0) {
        setDraft(buildEmptyGroupMemoryDraft());
      }
      setStatus('deleted');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <SectionHeader
          icon={<Users className="w-4 h-4" />}
          title="Group Memory"
          subtitle="Governed cohort memory shared across matching agents and operators."
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedId(null);
            setDraft(buildEmptyGroupMemoryDraft());
            setStatus('idle');
          }}
          className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]"
        >
          + New Space
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
          {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-4">
          <div className="space-y-2">
            {spaces.length === 0 && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#0e0f1a] p-4 text-sm text-[#9ca3af]">
                No group spaces yet. Create one to share governed memory across teams or roles.
              </div>
            )}
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => setSelectedId(space.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  selectedId === space.id
                    ? 'border-blue-500/40 bg-[#101524]'
                    : 'border-[rgba(255,255,255,0.07)] bg-[#0e0f1a] hover:border-[rgba(255,255,255,0.14)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{space.name}</p>
                  <span className="text-[11px] text-[#6b7280]">
                    {space.runtime_enabled ? 'runtime' : 'manual'}
                    {space.auto_promote_enabled ? ' + auto' : ''}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#9ca3af]">
                  {space.scope_type === 'role' ? `Role: ${space.target_role}` : 'Workspace-wide'}
                </p>
                {space.description && (
                  <p className="mt-1 text-[11px] text-[#4b5563] line-clamp-2">{space.description}</p>
                )}
                {!!space.analytics && (
                  <p className="mt-1 text-[11px] text-[#4b5563]">
                    {space.analytics.runtime_injections} runtime injects · {space.analytics.promoted_count} auto-promoted
                  </p>
                )}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#0e0f1a] p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-[#6b7280]">Space Name</label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                  placeholder="Operations, Sales, Platform..."
                  className="bg-[#090b14] border-[rgba(255,255,255,0.1)] text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-[#6b7280]">Audience</label>
                <select
                  value={draft.scope_type}
                  onChange={(e) => setDraft((current) => ({ ...current, scope_type: e.target.value as 'workspace' | 'role' }))}
                  className="w-full h-10 px-3 rounded-md bg-[#090b14] border border-[rgba(255,255,255,0.1)] text-white text-sm"
                >
                  <option value="workspace">Workspace</option>
                  <option value="role">Role-specific</option>
                </select>
              </div>
              {draft.scope_type === 'role' && (
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-[#6b7280]">Target Role</label>
                  <Input
                    value={draft.target_role ?? ''}
                    onChange={(e) => setDraft((current) => ({ ...current, target_role: e.target.value }))}
                    placeholder="operations"
                    className="bg-[#090b14] border-[rgba(255,255,255,0.1)] text-white"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-[#6b7280]">Read Access</label>
                <select
                  value={draft.read_access}
                  onChange={(e) => setDraft((current) => ({ ...current, read_access: e.target.value as 'workspace' | 'admin' }))}
                  className="w-full h-10 px-3 rounded-md bg-[#090b14] border border-[rgba(255,255,255,0.1)] text-white text-sm"
                >
                  <option value="workspace">Workspace members</option>
                  <option value="admin">Admins only</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-[#6b7280]">Write Access</label>
                <select
                  value={draft.write_access}
                  onChange={(e) => setDraft((current) => ({ ...current, write_access: e.target.value as 'workspace' | 'admin' }))}
                  className="w-full h-10 px-3 rounded-md bg-[#090b14] border border-[rgba(255,255,255,0.1)] text-white text-sm"
                >
                  <option value="admin">Admins only</option>
                  <option value="workspace">Workspace members</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-[#6b7280]">Description</label>
              <Input
                value={draft.description ?? ''}
                onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                placeholder="What durable knowledge belongs in this group space?"
                className="bg-[#090b14] border-[rgba(255,255,255,0.1)] text-white"
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-white">
              <input
                type="checkbox"
                checked={draft.runtime_enabled}
                onChange={(e) => setDraft((current) => ({ ...current, runtime_enabled: e.target.checked }))}
                className="accent-blue-500"
              />
              Inject into runtime when the audience matches
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-4">
              <label className="flex items-center gap-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={draft.auto_promote_enabled === true}
                  onChange={(e) => setDraft((current) => ({ ...current, auto_promote_enabled: e.target.checked }))}
                  className="accent-blue-500"
                />
                Auto-promote verified discoveries that match this audience
              </label>

              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wide text-[#6b7280]">Min Importance</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.minimum_importance ?? 0.78}
                  onChange={(e) => setDraft((current) => ({
                    ...current,
                    minimum_importance: Number.parseFloat(e.target.value) || 0,
                  }))}
                  className="bg-[#090b14] border-[rgba(255,255,255,0.1)] text-white"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-[#6b7280]">Memory Content</label>
              <Textarea
                value={draft.content}
                onChange={(e) => setDraft((current) => ({ ...current, content: e.target.value }))}
                placeholder="Store durable group conventions, handoff knowledge, and shared learnings here..."
                className="bg-[#090b14] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[220px] text-sm focus:border-blue-500/50"
              />
            </div>

            {selected?.analytics && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#090b14] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Reuse Analytics</p>
                    <p className="text-xs text-[#6b7280] mt-1">
                      Runtime injection frequency and automatic promotion telemetry for this governed space.
                    </p>
                  </div>
                  <div className="text-right text-xs text-[#9ca3af]">
                    <p>{selected.analytics.runtime_injections} runtime injects</p>
                    <p>{selected.analytics.promoted_count} auto-promoted</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] px-3 py-2 text-[#9ca3af]">
                    Chat
                    <div className="mt-1 text-sm text-white">{selected.analytics.usage_by_runtime.chat}</div>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] px-3 py-2 text-[#9ca3af]">
                    Task
                    <div className="mt-1 text-sm text-white">{selected.analytics.usage_by_runtime.task}</div>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] px-3 py-2 text-[#9ca3af]">
                    Last runtime
                    <div className="mt-1 text-sm text-white">{selected.analytics.last_runtime_at ? formatDate(selected.analytics.last_runtime_at) : '—'}</div>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] px-3 py-2 text-[#9ca3af]">
                    Last promoted
                    <div className="mt-1 text-sm text-white">{selected.analytics.last_promoted_at ? formatDate(selected.analytics.last_promoted_at) : '—'}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[#4b5563]">
                  {selected.analytics.last_runtime_agent_ref
                    ? `Last runtime injection for ${selected.analytics.last_runtime_agent_ref}`
                    : 'No runtime injection recorded yet'}
                  {selected.analytics.last_promoted_by_agent_ref
                    ? ` · Last auto-promotion from ${selected.analytics.last_promoted_by_agent_ref}`
                    : ''}
                </div>
              </div>
            )}

            {!!selected?.auto_entries?.length && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#090b14] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Auto-Promoted Discoveries</p>
                    <p className="text-xs text-[#6b7280] mt-1">
                      Verified memories promoted automatically into this governed group space.
                    </p>
                  </div>
                  <span className="text-xs text-[#9ca3af]">{selected.auto_entries.length} entries</span>
                </div>
                <div className="mt-3 space-y-3">
                  {selected.auto_entries.slice(0, 6).map((entry) => (
                    <div key={entry.id + entry.promoted_at} className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#0c0f18] p-3">
                      <div className="flex items-center justify-between gap-3 text-[11px] text-[#6b7280]">
                        <span>{entry.type} · {entry.source_agent_ref || 'agent'}</span>
                        <span>{entry.promoted_at ? formatDate(entry.promoted_at) : '—'}</span>
                      </div>
                      <p className="mt-2 text-sm text-white leading-relaxed">{entry.text}</p>
                      <p className="mt-2 text-[11px] text-[#4b5563]">
                        Importance {formatPercent(entry.importance)}
                        {entry.verification_note ? ` · ${entry.verification_note}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-[#4b5563]">
                {selected?.updatedAt ? `Last updated: ${formatDate(selected.updatedAt)}` : 'Unsaved space'}
                {selected?.updatedByEmail ? ` · ${selected.updatedByEmail}` : ''}
              </div>
              <div className="flex items-center gap-2">
                {status === 'saved' && <span className="text-xs text-emerald-400">Saved</span>}
                {status === 'deleted' && <span className="text-xs text-emerald-400">Deleted</span>}
                {status === 'error' && <span className="text-xs text-red-400">Action failed</span>}
                {!isNew && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="border-red-500/20 bg-transparent text-red-300 hover:bg-red-500/10"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !draft.name.trim() || !draft.content.trim() || selected?.readOnly === true}
                  className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
                >
                  {selected?.readOnly ? 'Read only' : saving ? 'Saving...' : isNew ? 'Create Space' : 'Save Space'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Agent Memory Card ────────────────────────────────────────────────────────

interface AgentMemoryCardProps {
  agent: Agent;
}

function AgentAvatarDisplay({ agent }: { agent: Pick<Agent, 'avatar' | 'name'> }) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = !imgError ? getAvatarImageUrl(agent.avatar, agent.name) : null;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={agent.name}
        onError={() => setImgError(true)}
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    );
  }

  // Emoji avatar
  if (isEmojiAvatar(agent.avatar)) {
    return (
      <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-lg shrink-0">
        {agent.avatar}
      </div>
    );
  }

  // Initials fallback
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#a855f7] to-[#3b82f6] flex items-center justify-center text-white font-semibold text-xs shrink-0">
      {getAgentInitials(agent.name)}
    </div>
  );
}

function AgentMemoryCard({ agent }: AgentMemoryCardProps) {
  const router = useRouter();
  const { data: summary, isLoading } = useApi<AgentMemoryListResponse>(
    '/api/v1/agents/' + agent.id + '/memories?countOnly=true&limit=200',
    () => getAgentMemorySummary(agent.id)
  );

  const count = summary?.count ?? 0;
  const countLabel = summary?.has_more || summary?.count_is_estimate ?     `${count}+` : `${count}`;
  const hiddenLabel = summary?.hidden_count ? `, ${summary.hidden_count} hidden` : '';
  const expiredLabel = summary?.expired_count ? `, ${summary.expired_count} expired` : '';

  return (
    <button
      onClick={() => router.push(`/agents/${agent.id}/memory`)}
      className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-left hover:border-[rgba(255,255,255,0.14)] hover:bg-[#111221] transition-all group"
    >
      <div className="flex items-center gap-3 mb-3">
        <AgentAvatarDisplay agent={agent} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{agent.name}</p>
          {agent.platform && (
            <p className="text-xs text-[#6b7280] truncate">{agent.platform}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-[#4b5563] group-hover:text-[#9ca3af] transition-colors flex-shrink-0" />
      </div>

      {isLoading ? (
        <Skeleton className="h-3 w-20" />
      ) : (
        <p className="text-xs text-[#6b7280]">
          <span className="text-white font-medium">{countLabel}</span> {count === 1 ? 'memory' : 'memories'}{hiddenLabel}{expiredLabel}
        </p>
      )}
    </button>
  );
}

// ─── Section 2: Agent Memories ────────────────────────────────────────────────

function AgentMemoriesSection() {
  const { data: agents, isLoading } = useApi<Agent[]>(
    '/api/v1/agents',
    () => getAgents()
  );

  const agentList = agents ?? [];

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <SectionHeader
          icon={<Users className="w-4 h-4" />}
          title="Agent Memories"
          subtitle="Per-agent knowledge stored in Snipara — click an agent to manage memories"
        />
        {!isLoading && agentList.length > 0 && (
          <span className="text-xs text-[#6b7280] mt-1 flex-shrink-0">
            {agentList.length} {agentList.length === 1 ? 'agent' : 'agents'}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && agentList.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-[#6b7280]">No agents found. Create an agent to start building memories.</p>
        </div>
      )}

      {!isLoading && agentList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agentList.map((agent) => (
            <AgentMemoryCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Shared Knowledge (Template Scopes) ───────────────────────────

function SharedKnowledgeSection() {
  const { data: templates, isLoading } = useApi<TemplateScope[]>(
    '/api/v1/memory/templates',
    () => getTemplateScopes()
  );

  const templateList = templates ?? [];

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<Layers className="w-4 h-4" />}
        title="Role-Specific Knowledge"
        subtitle="Template-scoped memories shared across agents with the same role"
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.05)]">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && templateList.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-[#6b7280]">
            No template scopes yet. Promote an agent memory to share it across roles.
          </p>
        </div>
      )}

      {!isLoading && templateList.length > 0 && (
        <div className="divide-y divide-[rgba(255,255,255,0.05)]">
          {templateList.map((tmpl) => (
            <div key={tmpl.scope} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-white">{tmpl.role}</p>
                <p className="text-xs text-[#6b7280] mt-0.5">scope: {tmpl.scope}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">{tmpl.docCount} docs</p>
                <p className="text-xs text-[#4b5563] mt-0.5">{formatDate(tmpl.lastUpdated)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Search Result Item ───────────────────────────────────────────────────────

interface SearchResultItemProps {
  result: MemorySearchResult;
}

function SearchResultItem({ result }: SearchResultItemProps) {
  const router = useRouter();
  const importancePct = Math.round(Math.min(1, Math.max(0, result.importance)) * 100);

  const scopeColors: Record<string, string> = {
    agent: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    template: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    global: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  };
  const scopeCls = scopeColors[result.scope] ?? 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af] border-[rgba(255,255,255,0.1)]';

  return (
    <div
      className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-2 hover:border-[rgba(255,255,255,0.12)] transition-colors cursor-pointer"
      onClick={() => {
        if (result.scope === 'agent' && result.agentName) {
          // Try to navigate — we don't have agentId in the result, so use agentName lookup
          router.push('/agents');
        }
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${scopeCls}`}>
          {result.scope}
        </span>
        {result.agentName && (
          <span className="text-xs text-[#6b7280]">{result.agentName}</span>
        )}
        <span className="text-xs text-[#4b5563] ml-auto">{formatDate(result.createdAt)}</span>
      </div>

      <p className="text-sm text-white leading-relaxed line-clamp-3">{result.content}</p>

      <div className="flex items-center gap-3">
        <div className="w-16 h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
          <div
            className={`h-full rounded-full ${importancePct >= 70 ? 'bg-emerald-500' : importancePct >= 40 ? 'bg-amber-500' : 'bg-[#374151]'}`}
            style={{ width: `${importancePct}%` }}
          />
        </div>
        <span className="text-xs text-[#6b7280]">{importancePct}% importance</span>
        {result.type && (
          <span className="text-xs text-[#6b7280] ml-auto">{result.type}</span>
        )}
      </div>
    </div>
  );
}

// ─── Section 4: Search All Memory ────────────────────────────────────────────

function SearchAllMemorySection() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MemorySearchResult[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setDebouncedQuery('');
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedQuery(value.trim()), 500);
  }, []);

  // Trigger search when debouncedQuery changes
  const runSearch = useCallback(async (q: string) => {
    if (!q) return;
    setSearching(true);
    setSearchError('');
    try {
      const res = await searchMemory(q);
      setResults(res);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Effect via useRef to avoid stale closures
  const lastQueried = useRef('');
  if (debouncedQuery && debouncedQuery !== lastQueried.current) {
    lastQueried.current = debouncedQuery;
    runSearch(debouncedQuery);
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-4 sm:p-6">
      <SectionHeader
        icon={<Search className="w-4 h-4" />}
        title="Search All Memory"
        subtitle="Semantic cross-scope search via Snipara"
      />

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4b5563] pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search across all agent memories..."
          className="pl-10 bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus:border-blue-500/50"
        />
      </div>

      {searching && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      )}

      {searchError && !searching && (
        <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {searchError}
        </div>
      )}

      {!searching && !searchError && results !== null && results.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-[#6b7280]">No memories matched &ldquo;{debouncedQuery}&rdquo;.</p>
        </div>
      )}

      {!searching && results && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-[#6b7280] mb-1">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{debouncedQuery}&rdquo;
          </p>
          {results.map((r) => (
            <SearchResultItem key={r.id} result={r} />
          ))}
        </div>
      )}

      {!searching && results === null && !debouncedQuery && (
        <div className="py-6 text-center">
          <p className="text-sm text-[#4b5563]">Type to search across all memory scopes.</p>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[rgba(59,130,246,0.12)] flex items-center justify-center text-blue-400 shrink-0">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white">Memory & Context</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Workspace memory powered by Snipara — three-level hierarchy
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <WorkspaceKnowledgeSection />
        <WorkspaceSessionBriefSection />
        <JournalAutomationSection />
        <WorkspaceJournalSection />
        <GroupMemorySection />
        <AgentMemoriesSection />
        <SharedKnowledgeSection />
        <SearchAllMemorySection />
      </div>
    </div>
  );
}
