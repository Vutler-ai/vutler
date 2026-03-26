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
} from '@/lib/api/endpoints/memory';
import type { Memory, AgentContext } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_TYPES = ['fact', 'learning', 'decision', 'preference'] as const;
type MemoryType = (typeof MEMORY_TYPES)[number];

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  learning: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  decision: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  preference: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type as MemoryType] ?? 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af]';
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {type}
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

// ─── Add Memory Dialog ────────────────────────────────────────────────────────

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
    if (!text.trim()) { setError('Memory text is required.'); return; }
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
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
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
              onChange={e => setText(e.target.value)}
              placeholder="Describe what the agent should remember..."
              className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[100px] focus:border-blue-500/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-1.5 uppercase tracking-wider">Type</label>
            <div className="flex gap-2 flex-wrap">
              {MEMORY_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    type === t
                      ? TYPE_COLORS[t]
                      : 'bg-transparent border-[rgba(255,255,255,0.1)] text-[#6b7280] hover:text-white'
                  }`}
                >
                  {t}
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
              onChange={e => setImportance(parseFloat(e.target.value))}
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

// ─── Memory Card ──────────────────────────────────────────────────────────────

interface MemoryCardProps {
  memory: Memory;
  canPromote?: boolean;
  agentRole?: string;
  onDelete?: (id: string) => Promise<void>;
  onPromote?: (id: string) => Promise<void>;
}

function MemoryCard({ memory, canPromote, onDelete, onPromote }: MemoryCardProps) {
  const [busy, setBusy] = useState(false);

  async function handleAction(action: 'delete' | 'promote') {
    setBusy(true);
    try {
      if (action === 'delete') await onDelete?.(memory.id);
      if (action === 'promote') await onPromote?.(memory.id);
    } finally {
      setBusy(false);
    }
  }

  const date = new Date(memory.created_at);
  const dateStr = isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 space-y-2.5 hover:border-[rgba(255,255,255,0.12)] transition-colors group">
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={memory.type} />
        <span className="text-xs text-[#4b5563]">{dateStr}</span>
      </div>

      <p className="text-sm text-white leading-relaxed">{memory.text}</p>

      <div className="flex items-center justify-between">
        <ImportanceMeter value={memory.importance} />

        {(onDelete || (canPromote && onPromote)) && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
        )}
      </div>
    </div>
  );
}

// ─── Context Panel ────────────────────────────────────────────────────────────

function ContextPanel({ context }: { context: AgentContext | undefined; isLoading: boolean }) {
  const [soulExpanded, setSoulExpanded] = useState(false);

  if (!context) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#0e0f1a] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Personal memories</span>
            <span className="text-white font-medium">{context.instance_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Template memories</span>
            <span className="text-white font-medium">{context.template_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Role</span>
            <span className="text-white font-medium">{context.role}</span>
          </div>
        </div>
      </div>

      {context.context && (
        <div className="bg-[#0e0f1a] rounded-xl p-4">
          <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">Context</h3>
          <p className="text-xs text-[#9ca3af] leading-relaxed">{context.context}</p>
        </div>
      )}

      {context.soul && (
        <div className="bg-[#0e0f1a] rounded-xl p-4">
          <button
            onClick={() => setSoulExpanded(x => !x)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Soul doc</h3>
            <span className="text-[#4b5563] text-xs">{soulExpanded ? 'Hide' : 'Show'}</span>
          </button>
          {soulExpanded && (
            <pre className="mt-3 text-xs text-[#6b7280] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {context.soul}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [actionError, setActionError] = useState('');

  // Debounce search
  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 400);
  }

  // SWR fetches
  const cacheKey = `/api/v1/agents/${agentId}/memories${debouncedQuery ? `?q=${debouncedQuery}` : ''}`;
  const { data: instanceMemories, isLoading: loadingInstance, mutate: mutateInstance } = useApi<Memory[]>(
    cacheKey,
    () => recallMemories(agentId, debouncedQuery || undefined)
  );

  const { data: templateMemories, isLoading: loadingTemplate } = useApi<Memory[]>(
    `/api/v1/agents/${agentId}/memories/template`,
    () => recallTemplateMemories(agentId)
  );

  const { data: context, isLoading: loadingContext, mutate: mutateContext } = useApi<AgentContext>(
    `/api/v1/agents/${agentId}/memories/context`,
    () => getAgentContext(agentId)
  );

  // Actions
  const handleAddMemory = useCallback(async (text: string, type: MemoryType, importance: number) => {
    await rememberMemory(agentId, { text, type, importance });
    await mutateInstance();
    await mutateContext();
  }, [agentId, mutateInstance, mutateContext]);

  const handleDelete = useCallback(async (memoryId: string) => {
    setActionError('');
    try {
      await deleteMemory(agentId, memoryId);
      await mutateInstance();
      await mutateContext();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }, [agentId, mutateInstance, mutateContext]);

  const handlePromote = useCallback(async (memoryId: string) => {
    setActionError('');
    try {
      await promoteMemory(agentId, memoryId, context?.role);
      await mutateContext();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Promote failed.');
    }
  }, [agentId, context?.role, mutateContext]);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Memory</h2>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Agent knowledge stored in Snipara — 3-level hierarchy
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          + Add Memory
        </Button>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {actionError}
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* Left — main content */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Personal Memories */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Personal Memories
                <span className="text-xs text-[#6b7280] font-normal">scope: agent</span>
              </h3>
              <div className="w-56">
                <Input
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search memories..."
                  className="h-8 text-sm bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus:border-blue-500/50"
                />
              </div>
            </div>

            {loadingInstance && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <MemoryCardSkeleton key={i} />)}
              </div>
            )}

            {!loadingInstance && (!instanceMemories || instanceMemories.length === 0) && (
              <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-10 text-center">
                <p className="text-[#6b7280] text-sm">
                  {debouncedQuery
                    ? 'No memories matched your search.'
                    : 'No personal memories yet. Add one to get started.'}
                </p>
                {!debouncedQuery && (
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
                {instanceMemories.map(m => (
                  <MemoryCard
                    key={m.id}
                    memory={m}
                    canPromote
                    agentRole={context?.role}
                    onDelete={handleDelete}
                    onPromote={handlePromote}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Template Memories */}
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
                {Array.from({ length: 2 }).map((_, i) => <MemoryCardSkeleton key={i} />)}
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
                {templateMemories.map(m => (
                  <MemoryCard key={m.id} memory={{ ...m, scope: 'template' }} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right — context panel */}
        <aside className="w-64 shrink-0 sticky top-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Context</h3>
            <button
              onClick={() => mutateContext()}
              className="text-xs text-[#6b7280] hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
          <ContextPanel context={context} isLoading={loadingContext} />
        </aside>
      </div>

      {showAddDialog && (
        <AddMemoryDialog
          onClose={() => setShowAddDialog(false)}
          onSave={handleAddMemory}
        />
      )}
    </div>
  );
}
