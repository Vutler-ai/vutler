'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import {
  recallMemories,
  recallTemplateMemories,
  rememberMemory,
  deleteMemory,
  getAgentContext,
  promoteMemory,
  attachMemorySource,
  verifyMemory,
  invalidateMemory,
  supersedeMemory,
  getAgentProfileBrief,
  updateAgentProfileBrief,
  getAgentSessionBrief,
  updateAgentSessionBrief,
  getAgentJournal,
  updateAgentJournal,
  summarizeAgentJournal,
  getAgentGroupMemory,
} from '@/lib/api/endpoints/memory';
import type { Memory, AgentContext, ContinuityBrief, JournalState, AgentGroupMemoryResponse } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const MEMORY_TYPES = ['fact', 'learning', 'decision', 'preference'] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];
type LifecycleAction = 'attach_source' | 'verify' | 'invalidate' | 'supersede';
type MemoryView = 'active' | 'graveyard' | 'all';

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  learning: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  decision: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  preference: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  needs_verification: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  invalidated: 'bg-red-500/15 text-red-300 border-red-500/20',
  superseded: 'bg-slate-500/15 text-slate-200 border-slate-500/20',
  expired: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20',
};

const TIER_STYLES: Record<string, string> = {
  hot: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
  warm: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  cold: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  graveyard: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
};

const MEMORY_VIEW_OPTIONS: Array<{ value: MemoryView; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'graveyard', label: 'Graveyard' },
  { value: 'all', label: 'All' },
];

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type as MemoryType] ?? 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af]';
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cls = STATUS_STYLES[status] ?? 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af] border-[rgba(255,255,255,0.08)]';
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const cls = TIER_STYLES[tier] ?? 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af] border-[rgba(255,255,255,0.08)]';
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {tier}
    </span>
  );
}

function ImportanceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-[#374151]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[#6b7280]">{pct}%</span>
    </div>
  );
}

function MemoryCardSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-2 w-20" />
    </div>
  );
}

interface ContinuityEditorProps {
  cacheKey: string;
  title: string;
  subtitle: string;
  placeholder: string;
  load: () => Promise<ContinuityBrief>;
  save: (content: string) => Promise<ContinuityBrief>;
}

function ContinuityEditor({ cacheKey, title, subtitle, placeholder, load, save }: ContinuityEditorProps) {
  const { data, isLoading, error, mutate } = useApi<ContinuityBrief>(cacheKey, load);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const content = draft ?? data?.content ?? '';

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const updated = await save(content);
      await mutate(updated, { revalidate: false });
      setDraft(updated.content);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-[#6b7280] mt-1">{subtitle}</p>
        </div>
        {data?.path && (
          <span className="text-[11px] text-[#4b5563] text-right">{data.path}</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
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
          placeholder={placeholder}
          className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[130px] text-sm focus:border-blue-500/50"
        />
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-[#4b5563]">
          {data?.updatedAt ? `Last updated: ${formatDate(data.updatedAt)}` : 'Not set yet'}
          {data?.updatedByEmail ? ` · ${data.updatedByEmail}` : ''}
        </div>
        <div className="flex items-center gap-2">
          {status === 'success' && <span className="text-xs text-emerald-400">Saved</span>}
          {status === 'error' && <span className="text-xs text-red-400">Save failed</span>}
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

function JournalEditor({ agentId }: { agentId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const { data, isLoading, error, mutate } = useApi<JournalState>(
    `/api/v1/memory/agents/${agentId}/journal?date=${selectedDate}`,
    () => getAgentJournal(agentId, selectedDate)
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'automated' | 'summarized' | 'error'>('idle');

  const content = draft ?? data?.content ?? '';

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const updated = await updateAgentJournal(agentId, selectedDate, content);
      await mutate(updated, { revalidate: false });
      setDraft(updated.content);
      setStatus(updated.automation?.triggered ? 'automated' : 'success');
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
      const result = await summarizeAgentJournal(agentId, selectedDate);
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
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Daily Journal</h3>
          <p className="text-xs text-[#6b7280] mt-1">
            Day-level operator or runtime notes that can be compacted into the agent session brief, with optional auto-refresh on save.
          </p>
        </div>
        <div className="w-[180px]">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value || today);
              setDraft(null);
              setStatus('idle');
            }}
            className="h-9 bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
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
          placeholder="Capture what changed today for this agent: task progress, blockers, corrections, and next moves."
          className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[140px] text-sm focus:border-blue-500/50"
        />
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-[#4b5563]">
          {data?.updatedAt ? `Last updated: ${formatDate(data.updatedAt)}` : 'Not set yet'}
          {data?.updatedByEmail ? ` · ${data.updatedByEmail}` : ''}
          {data?.automationPolicy?.enabled
            ? ` · Auto-refresh on save from ${data.automationPolicy.minimum_length} chars`
            : ' · Manual compaction only'}
        </div>
        <div className="flex items-center gap-2">
          {status === 'success' && <span className="text-xs text-emerald-400">Saved</span>}
          {status === 'automated' && <span className="text-xs text-emerald-400">Saved + session brief refreshed</span>}
          {status === 'summarized' && <span className="text-xs text-emerald-400">Session brief refreshed</span>}
          {status === 'error' && <span className="text-xs text-red-400">Action failed</span>}
          <Button
            size="sm"
            onClick={handleSummarize}
            disabled={summarizing || isLoading || error !== undefined || !content.trim() || data?.readOnly}
            className="bg-[#1f2937] hover:bg-[#111827] text-white disabled:opacity-40"
          >
            {summarizing ? 'Compacting...' : 'Summarize To Session Brief'}
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

function ApplicableGroupMemory({ agentId }: { agentId: string }) {
  const { data, isLoading, error } = useApi<AgentGroupMemoryResponse>(
    `/api/v1/memory/agents/${agentId}/group-memory`,
    () => getAgentGroupMemory(agentId)
  );
  const spaces = data?.spaces ?? [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-white">Applicable Group Memory</h3>
        <span className="text-xs text-[#6b7280]">runtime-visible shared context for this agent</span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => <MemoryCardSkeleton key={index} />)}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {error.message}
        </div>
      )}

      {!isLoading && !error && spaces.length === 0 && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-8 text-center">
          <p className="text-[#6b7280] text-sm">
            No governed group memory currently applies to this agent.
          </p>
        </div>
      )}

      {!isLoading && !error && spaces.length > 0 && (
        <div className="space-y-3">
          {spaces.map((space) => (
            <div key={space.id} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{space.name}</p>
                  <p className="text-[11px] text-[#6b7280] mt-1">
                    {space.scope_type === 'role' ? `Role: ${space.target_role}` : 'Workspace-wide'}
                    {space.runtime_enabled ? ' · Runtime enabled' : ''}
                  </p>
                </div>
                <span className="text-[11px] text-[#4b5563]">{space.path}</span>
              </div>
              {space.description && (
                <p className="mt-2 text-xs text-[#9ca3af]">{space.description}</p>
              )}
              <pre className="mt-3 text-xs text-[#cbd5e1] whitespace-pre-wrap leading-relaxed">
                {space.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface AddMemoryDialogProps {
  onClose: () => void;
  onSave: (text: string, type: MemoryType, importance: number) => Promise<void>;
}

function AddMemoryDialog({ onClose, onSave }: AddMemoryDialogProps) {
  const [text, setText] = useState('');
  const [type, setType] = useState<MemoryType>('fact');
  const [importance, setImportance] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!text.trim()) {
      setError('Memory text is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave(text.trim(), type, importance);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save memory.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <h2 className="text-base font-semibold text-white">Add Memory</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white text-2xl leading-none transition-colors">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Memory text</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe what the agent should remember..."
              className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[100px] focus:border-blue-500/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Type</label>
            <div className="flex gap-2 flex-wrap">
              {MEMORY_TYPES.map((option) => (
                <button
                  key={option}
                  onClick={() => setType(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    type === option
                      ? TYPE_COLORS[option]
                      : 'bg-transparent border-[rgba(255,255,255,0.1)] text-[#6b7280] hover:text-white'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">
              Importance — {Math.round(importance * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={importance}
              onChange={(e) => setImportance(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.07)]">
          <Button variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
            {saving ? 'Saving...' : 'Save Memory'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface LifecycleDialogProps {
  action: LifecycleAction;
  memory: Memory;
  onClose: () => void;
  onSubmit: (action: LifecycleAction, payload: Record<string, unknown>) => Promise<void>;
}

function LifecycleDialog({ action, memory, onClose, onSubmit }: LifecycleDialogProps) {
  const [sourceRef, setSourceRef] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [reason, setReason] = useState('');
  const [replacementHint, setReplacementHint] = useState('');
  const [newText, setNewText] = useState(memory.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const payload: Record<string, unknown> = {};

    if (action === 'attach_source') {
      if (!sourceRef.trim()) {
        setError('Source reference is required.');
        return;
      }
      payload.source_ref = sourceRef.trim();
      if (evidenceNote.trim()) payload.evidence_note = evidenceNote.trim();
    }

    if (action === 'verify') {
      if (evidenceNote.trim()) payload.evidence_note = evidenceNote.trim();
    }

    if (action === 'invalidate') {
      if (!reason.trim()) {
        setError('Reason is required.');
        return;
      }
      payload.reason = reason.trim();
      if (replacementHint.trim()) payload.replacement_hint = replacementHint.trim();
    }

    if (action === 'supersede') {
      if (!newText.trim()) {
        setError('Replacement text is required.');
        return;
      }
      if (!reason.trim()) {
        setError('Reason is required.');
        return;
      }
      payload.new_text = newText.trim();
      payload.reason = reason.trim();
      payload.type = memory.type;
      payload.importance = memory.importance;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit(action, payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const title = {
    attach_source: 'Attach Source',
    verify: 'Verify Memory',
    invalidate: 'Invalidate Memory',
    supersede: 'Supersede Memory',
  }[action];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <p className="text-xs text-[#6b7280] mt-1">Memory ID: {memory.id}</p>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white text-2xl leading-none transition-colors">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-[#0e0f1a] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-[11px] uppercase tracking-wider text-[#6b7280] mb-2">Current memory</p>
            <p className="text-sm text-white leading-relaxed">{memory.text}</p>
          </div>

          {action === 'attach_source' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Source reference</label>
                <Input
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="runbook.md#deploy or https://..."
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Evidence note</label>
                <Textarea
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="What confirms this memory?"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white min-h-[90px]"
                />
              </div>
            </>
          )}

          {action === 'verify' && (
            <div>
              <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Verification note</label>
              <Textarea
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="How did you verify this memory?"
                className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white min-h-[90px]"
                autoFocus
              />
            </div>
          )}

          {action === 'invalidate' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Reason</label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this memory no longer valid?"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white min-h-[90px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Replacement hint</label>
                <Input
                  value={replacementHint}
                  onChange={(e) => setReplacementHint(e.target.value)}
                  placeholder="Optional replacement pointer"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white"
                />
              </div>
            </>
          )}

          {action === 'supersede' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Replacement memory</label>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white min-h-[110px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Reason</label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this the new canonical memory?"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white min-h-[90px]"
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.07)]">
          <Button variant="outline" size="sm" onClick={onClose} className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={busy} className="bg-blue-600 hover:bg-blue-500 text-white">
            {busy ? 'Saving...' : title}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MemoryCardProps {
  memory: Memory;
  canPromote?: boolean;
  onDelete?: (id: string) => Promise<void>;
  onPromote?: (id: string) => Promise<void>;
  onLifecycle?: (memory: Memory, action: LifecycleAction, payload: Record<string, unknown>) => Promise<void>;
}

function MemoryCard({ memory, canPromote, onDelete, onPromote, onLifecycle }: MemoryCardProps) {
  const [busy, setBusy] = useState(false);
  const [dialogAction, setDialogAction] = useState<LifecycleAction | null>(null);

  async function handleAction(action: 'delete' | 'promote') {
    setBusy(true);
    try {
      if (action === 'delete') await onDelete?.(memory.id);
      if (action === 'promote') await onPromote?.(memory.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycleSubmit(action: LifecycleAction, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await onLifecycle?.(memory, action, payload);
    } finally {
      setBusy(false);
    }
  }

  const sources = Array.isArray(memory.sources) ? memory.sources.slice(0, 2) : [];

  return (
    <>
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-3 hover:border-[rgba(255,255,255,0.12)] transition-colors group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={memory.type} />
            <StatusBadge status={memory.status} />
            <TierBadge tier={memory.tier} />
            {memory.canonical_memory && (
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/20">
                canonical
              </span>
            )}
          </div>
          <span className="text-xs text-[#4b5563]">{formatDate(memory.created_at)}</span>
        </div>

        <p className="text-sm text-white leading-relaxed">{memory.text}</p>

        <div className="space-y-1.5 text-[11px] text-[#94a3b8]">
          {memory.contradiction_state && memory.contradiction_state !== 'none' && (
            <p>Contradiction: {memory.contradiction_state.replace(/_/g, ' ')}</p>
          )}
          {memory.resolution_state && memory.resolution_state !== 'none' && (
            <p>Resolution: {memory.resolution_state.replace(/_/g, ' ')}</p>
          )}
          {memory.canonical_memory && memory.supersedes_memory_id && (
            <p className="text-emerald-300">Canonical replacement for memory {memory.supersedes_memory_id}</p>
          )}
          {memory.verified_at && <p>Verified: {formatDate(memory.verified_at)}{memory.verification_note ? ` · ${memory.verification_note}` : ''}</p>}
          {memory.invalidated_at && <p className="text-red-300">Invalidated: {memory.invalidation_reason || formatDate(memory.invalidated_at)}</p>}
          {memory.superseded_at && <p className="text-slate-300">Superseded: {memory.superseded_by_text || formatDate(memory.superseded_at)}</p>}
          {memory.graveyard_reason && <p className="text-rose-300">Graveyard reason: {memory.graveyard_reason}</p>}
          {memory.replacement_hint && <p>Replacement hint: {memory.replacement_hint}</p>}
          {sources.length > 0 && (
            <div className="space-y-1">
              {sources.map((source, index) => (
                <p key={`${source.source_ref || 'source'}-${index}`}>
                  Source: {source.source_ref || 'reference'}{source.evidence_note ? ` · ${source.evidence_note}` : ''}
                </p>
              ))}
            </div>
          )}
          {memory.lifecycle_remote_synced === false && (
            <p className="text-amber-300">Snipara tool unavailable: state saved locally for review.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <ImportanceMeter value={memory.importance} />

          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap justify-end">
            {onLifecycle && (
              <>
                <button
                  disabled={busy}
                  onClick={() => setDialogAction('verify')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                >
                  Verify
                </button>
                <button
                  disabled={busy}
                  onClick={() => setDialogAction('attach_source')}
                  className="text-xs text-sky-400 hover:text-sky-300 px-2 py-1 rounded-lg hover:bg-sky-500/10 transition-colors disabled:opacity-50"
                >
                  Attach Source
                </button>
                <button
                  disabled={busy}
                  onClick={() => setDialogAction('invalidate')}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  Invalidate
                </button>
                <button
                  disabled={busy}
                  onClick={() => setDialogAction('supersede')}
                  className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-500/10 transition-colors disabled:opacity-50"
                >
                  Supersede
                </button>
              </>
            )}
            {canPromote && onPromote && (
              <button
                disabled={busy}
                onClick={() => handleAction('promote')}
                className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              >
                Promote
              </button>
            )}
            {onDelete && (
              <button
                disabled={busy}
                onClick={() => handleAction('delete')}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {dialogAction && onLifecycle && (
        <LifecycleDialog
          action={dialogAction}
          memory={memory}
          onClose={() => setDialogAction(null)}
          onSubmit={handleLifecycleSubmit}
        />
      )}
    </>
  );
}

function ContextPanel({ context }: { context: AgentContext | undefined; isLoading: boolean }) {
  const [soulExpanded, setSoulExpanded] = useState(false);

  function parseSoulDoc(value: string | undefined) {
    if (!value) return { title: 'Agent soul', content: '' };
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return { title: 'Agent soul', content: trimmed };

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.content === 'string') {
        return {
          title: parsed.path ? `Agent soul · ${parsed.path}` : 'Agent soul',
          content: parsed.content.trim(),
        };
      }
    } catch {
      return { title: 'Agent soul', content: trimmed };
    }

    return { title: 'Agent soul', content: trimmed };
  }

  if (!context) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)}
      </div>
    );
  }

  const soulDoc = parseSoulDoc(context.soul);

  return (
    <div className="space-y-4">
      <div className="bg-[#0e0f1a] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Personal memories</span>
            <span className="text-white font-medium">{context.instance_count}{context.instance_count_is_estimate ? '+' : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Template memories</span>
            <span className="text-white font-medium">{context.template_count}{context.template_count_is_estimate ? '+' : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Workspace memories</span>
            <span className="text-white font-medium">{context.global_count ?? 0}{context.global_count_is_estimate ? '+' : ''}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Hidden personal</span>
            <span className="text-white font-medium">{context.hidden_instance_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Hidden template</span>
            <span className="text-white font-medium">{context.hidden_template_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Hidden workspace</span>
            <span className="text-white font-medium">{context.hidden_global_count ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Expired memories</span>
            <span className="text-white font-medium">
              {(context.expired_instance_count ?? 0) + (context.expired_template_count ?? 0) + (context.expired_global_count ?? 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Graveyard memories</span>
            <span className="text-white font-medium">
              {(context.graveyard_instance_count ?? 0) + (context.graveyard_template_count ?? 0) + (context.graveyard_global_count ?? 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Role</span>
            <span className="text-white font-medium">{context.role}</span>
          </div>
        </div>
      </div>

      {context.context && (
        <div className="bg-[#0e0f1a] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">Agent context</h3>
          <p className="text-xs text-[#9ca3af] leading-relaxed">{context.context}</p>
          <p className="text-[11px] text-[#4b5563] mt-2">
            Workspace shared instructions live on the workspace memory screen. This panel shows the agent-specific soul / identity doc.
          </p>
        </div>
      )}

      {soulDoc.content && (
        <div className="bg-[#0e0f1a] rounded-xl p-4">
          <button onClick={() => setSoulExpanded((value) => !value)} className="flex items-center justify-between w-full">
            <div className="text-left">
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{soulDoc.title}</h3>
              <p className="text-[11px] text-[#4b5563] mt-1">Loaded from the agent&apos;s own Snipara doc, not the workspace shared instructions.</p>
            </div>
            <span className="text-[#4b5563] text-xs">{soulExpanded ? 'Hide' : 'Show'}</span>
          </button>
          {soulExpanded && (
            <pre className="mt-3 text-xs text-[#6b7280] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {soulDoc.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function MemoryPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [memoryView, setMemoryView] = useState<MemoryView>('active');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [actionError, setActionError] = useState('');

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 400);
  }

  const cacheKey = `/api/v1/agents/${agentId}/memories?view=${memoryView}${debouncedQuery ? `&q=${debouncedQuery}` : ''}`;
  const { data: instanceMemories, isLoading: loadingInstance, mutate: mutateInstance } = useApi<Memory[]>(
    cacheKey,
    () => recallMemories(agentId, { query: debouncedQuery || undefined, view: memoryView })
  );

  const { data: templateMemories, isLoading: loadingTemplate } = useApi<Memory[]>(
    `/api/v1/agents/${agentId}/memories/template`,
    () => recallTemplateMemories(agentId)
  );

  const { data: context, isLoading: loadingContext, mutate: mutateContext } = useApi<AgentContext>(
    `/api/v1/agents/${agentId}/memories/context`,
    () => getAgentContext(agentId)
  );
  const { mutate: mutateProfileBrief } = useApi<ContinuityBrief>(
    `/api/v1/memory/agents/${agentId}/profile-brief`,
    () => getAgentProfileBrief(agentId)
  );
  const { mutate: mutateSessionBrief } = useApi<ContinuityBrief>(
    `/api/v1/memory/agents/${agentId}/session-brief`,
    () => getAgentSessionBrief(agentId)
  );
  const contextRole = context?.role;

  const refreshAll = useCallback(async () => {
    await Promise.all([mutateInstance(), mutateContext(), mutateProfileBrief(), mutateSessionBrief()]);
  }, [mutateContext, mutateInstance, mutateProfileBrief, mutateSessionBrief]);

  const handleAddMemory = useCallback(async (text: string, type: MemoryType, importance: number) => {
    await rememberMemory(agentId, { text, type, importance });
    await refreshAll();
  }, [agentId, refreshAll]);

  const handleDelete = useCallback(async (memoryId: string) => {
    setActionError('');
    try {
      await deleteMemory(agentId, memoryId);
      await refreshAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }, [agentId, refreshAll]);

  const handlePromote = useCallback(async (memoryId: string) => {
    setActionError('');
    try {
      await promoteMemory(agentId, memoryId, contextRole);
      await refreshAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Promote failed.');
    }
  }, [agentId, contextRole, refreshAll]);

  const handleLifecycle = useCallback(async (memory: Memory, action: LifecycleAction, payload: Record<string, unknown>) => {
    setActionError('');
    try {
      if (action === 'attach_source') {
        await attachMemorySource(agentId, memory.id, payload as { source_ref: string; evidence_note?: string });
      }
      if (action === 'verify') {
        await verifyMemory(agentId, memory.id, payload as { evidence_note?: string });
      }
      if (action === 'invalidate') {
        await invalidateMemory(agentId, memory.id, payload as { reason: string; replacement_hint?: string });
      }
      if (action === 'supersede') {
        await supersedeMemory(
          agentId,
          memory.id,
          payload as { new_text: string; reason: string; type?: string; importance?: number }
        );
      }
      await refreshAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lifecycle action failed.');
      throw e;
    }
  }, [agentId, refreshAll]);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Memory</h2>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Agent knowledge stored in Snipara with lifecycle review and evidence.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)} className="bg-blue-600 hover:bg-blue-500 text-white">
          + Add Memory
        </Button>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-8">
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ContinuityEditor
              cacheKey={`/api/v1/memory/agents/${agentId}/profile-brief`}
              title="Agent Profile Brief"
              subtitle="Stable identity, operating style, and durable role expectations for this agent."
              placeholder="Summarize who this agent is, what it owns, and how it should operate."
              load={() => getAgentProfileBrief(agentId)}
              save={(content) => updateAgentProfileBrief(agentId, content)}
            />
            <ContinuityEditor
              cacheKey={`/api/v1/memory/agents/${agentId}/session-brief`}
              title="Agent Session Brief"
              subtitle="Short current-state handoff note for resets, retries, and autonomous resumption."
              placeholder="Capture the active task state, latest decisions, blockers, and next moves."
              load={() => getAgentSessionBrief(agentId)}
              save={(content) => updateAgentSessionBrief(agentId, content)}
            />
          </section>

          <JournalEditor agentId={agentId} />
          <ApplicableGroupMemory agentId={agentId} />

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Personal Memories
                <span className="text-xs text-[#6b7280] font-normal">scope: agent</span>
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0e0f1a] p-1">
                  {MEMORY_VIEW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setMemoryView(option.value)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                        memoryView === option.value
                          ? 'bg-white text-[#0f172a]'
                          : 'text-[#6b7280] hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="w-56">
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search memories..."
                    className="h-8 text-sm bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus:border-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {loadingInstance && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => <MemoryCardSkeleton key={index} />)}
              </div>
            )}

            {!loadingInstance && (!instanceMemories || instanceMemories.length === 0) && (
              <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-10 text-center">
                <p className="text-[#6b7280] text-sm">
                  {debouncedQuery
                    ? 'No memories matched your search.'
                    : memoryView === 'graveyard'
                      ? 'No graveyard memories for this agent.'
                      : memoryView === 'all'
                        ? 'No personal memories available yet.'
                        : 'No personal memories yet. Add one to get started.'}
                </p>
                {!debouncedQuery && memoryView !== 'graveyard' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddDialog(true)}
                    className="mt-3 border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]"
                  >
                    Add First Memory
                  </Button>
                )}
              </div>
            )}

            {!loadingInstance && instanceMemories && instanceMemories.length > 0 && (
              <div className="space-y-3">
                {instanceMemories.map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    memory={memory}
                    canPromote
                    onDelete={handleDelete}
                    onPromote={handlePromote}
                    onLifecycle={handleLifecycle}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-white">Template Memories</h3>
              <span className="text-xs text-[#6b7280]">scope: role-shared</span>
              {context?.role && (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                  {context.role}
                </Badge>
              )}
            </div>

            {loadingTemplate && (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => <MemoryCardSkeleton key={index} />)}
              </div>
            )}

            {!loadingTemplate && (!templateMemories || templateMemories.length === 0) && (
              <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-8 text-center">
                <p className="text-[#6b7280] text-sm">
                  No template memories for this role yet.
                  Promote a personal memory to share it with all agents in this role.
                </p>
              </div>
            )}

            {!loadingTemplate && templateMemories && templateMemories.length > 0 && (
              <div className="space-y-3">
                {templateMemories.map((memory) => (
                  <MemoryCard key={memory.id} memory={{ ...memory, scope: 'template' }} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="w-72 shrink-0 sticky top-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Context</h3>
            <button onClick={() => mutateContext()} className="text-xs text-[#6b7280] hover:text-white transition-colors">
              Refresh
            </button>
          </div>
          <ContextPanel context={context} isLoading={loadingContext} />
        </aside>
      </div>

      {showAddDialog && (
        <AddMemoryDialog onClose={() => setShowAddDialog(false)} onSave={handleAddMemory} />
      )}
    </div>
  );
}
