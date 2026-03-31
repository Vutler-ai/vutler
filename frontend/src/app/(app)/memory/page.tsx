'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Search, ChevronRight, BookOpen, Users, Layers } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { getAgents } from '@/lib/api/endpoints/agents';
import {
  getWorkspaceKnowledge,
  updateWorkspaceKnowledge,
  getTemplateScopes,
  searchMemory,
  getAgentMemorySummary,
} from '@/lib/api/endpoints/memory';
import type {
  Agent,
  WorkspaceKnowledge,
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
  const { data, isLoading, mutate } = useApi<WorkspaceKnowledge>(
    '/api/v1/memory/workspace-knowledge',
    () => getWorkspaceKnowledge()
  );

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const content = draft ?? data?.content ?? '';

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await updateWorkspaceKnowledge(content);
      await mutate();
      setDraft(null);
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
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write global workspace instructions here..."
          className="bg-[#0e0f1a] border-[rgba(255,255,255,0.1)] text-white resize-none min-h-[200px] font-mono text-sm focus:border-blue-500/50"
        />
      )}

      <p className="mt-3 text-xs text-[#6b7280] leading-relaxed">
        This content is shared across agents in the workspace. Agent-specific soul/identity docs live inside each agent memory screen.
      </p>

      <div className="flex items-center justify-between mt-3">
        {data?.updatedAt && (
          <span className="text-xs text-[#4b5563]">
            Last updated: {formatDate(data.updatedAt)}
          </span>
        )}
        {!data?.updatedAt && <span />}

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
            disabled={saving || isLoading || draft === null || data?.readOnly}
            className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {data?.readOnly ? 'Read only' : saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
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
        <AgentMemoriesSection />
        <SharedKnowledgeSection />
        <SearchAllMemorySection />
      </div>
    </div>
  );
}
