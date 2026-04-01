'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/layout/page-header';
import { useApi } from '@/hooks/use-api';
import { getAgents, deleteAgent, createAgent } from '@/lib/api/endpoints/agents';
import { getTemplates } from '@/lib/api/endpoints/marketplace';
import type { Agent, MarketplaceTemplate } from '@/lib/api/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Agent['status'] }) {
  if (status === 'active' || status === 'online') {
    return (
      <Badge className="bg-green-500/15 text-green-400 border-green-500/20 gap-1.5">
        <span className="size-1.5 rounded-full bg-green-400 inline-block" />
        Online
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge className="bg-red-500/15 text-red-400 border-red-500/20 gap-1.5">
        <span className="size-1.5 rounded-full bg-red-400 inline-block" />
        Error
      </Badge>
    );
  }
  return (
    <Badge className="bg-[rgba(255,255,255,0.05)] text-[#9ca3af] border-[rgba(255,255,255,0.1)] gap-1.5">
      <span className="size-1.5 rounded-full bg-[#6b7280] inline-block" />
      Offline
    </Badge>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

import { getAvatarImageUrl, getStaticAvatarUrl, isEmojiAvatar } from '@/lib/avatar';

function AgentAvatar({ agent }: { agent: Pick<Agent, 'avatar' | 'name'> }) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = !imgError ? getAvatarImageUrl(agent.avatar, agent.name) : null;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={agent.name}
        className="size-10 rounded-xl object-cover shrink-0 bg-[rgba(255,255,255,0.05)]"
        onError={() => setImgError(true)}
      />
    );
  }

  // Emoji avatar
  if (isEmojiAvatar(agent.avatar)) {
    return (
      <div className="size-10 rounded-xl bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-xl shrink-0">
        {agent.avatar}
      </div>
    );
  }

  // Initials fallback
  const initials = (agent.name || (agent as any).username || 'A')
    .split(' ')
    .map((w: string) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="size-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
      {initials || '?'}
    </div>
  );
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="border-[rgba(255,255,255,0.05)]">
          <TableCell className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </TableCell>
          <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

function DeleteAgentDialog({
  agent,
  onDeleted,
}: {
  agent: Agent;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAgent(agent.id);
      onDeleted();
    } catch {
      // ignore — row remains
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2 text-xs"
          onClick={e => e.stopPropagation()}
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.1)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete Agent</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong className="text-white">{agent.name}</strong>?
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Category definitions ──────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  { key: 'All', label: 'All' },
  { key: 'sales', label: 'Sales & Marketing' },
  { key: 'operations', label: 'Operations' },
  { key: 'technical', label: 'Technical' },
  { key: 'customer_success', label: 'Customer Success' },
  { key: 'finance', label: 'Finance' },
] as const;

type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]['key'];

// ─── Template Avatar ───────────────────────────────────────────────────────────

function TemplateAvatar({
  avatar,
  name,
}: {
  avatar?: string | null;
  name: string;
}) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = getStaticAvatarUrl(avatar || undefined);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="size-12 rounded-xl object-cover shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: initials
  const initials = (name || 'A')
    .split(' ')
    .map((w: string) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="size-12 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
      {initials || '?'}
    </div>
  );
}

// ─── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    sales: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    operations: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    technical: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    customer_success: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    finance: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  };
  const colors = colorMap[category] ?? 'bg-[rgba(255,255,255,0.05)] text-[#9ca3af] border-[rgba(255,255,255,0.1)]';
  const labelMap: Record<string, string> = {
    sales: 'Sales',
    operations: 'Operations',
    technical: 'Technical',
    customer_success: 'Customer Success',
    finance: 'Finance',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors}`}>
      {labelMap[category] ?? category}
    </span>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({ onCreated }: { onCreated: (agentId: string) => void }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('All');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const { data, isLoading, error } = useApi(
    '/api/v1/marketplace/templates',
    () => getTemplates({ limit: 50 }),
  );

  const templates = data?.templates ?? [];

  const filtered = useMemo(() => {
    let result = templates;

    // Category filter
    if (activeCategory !== 'All') {
      result = result.filter(t => t.category === activeCategory);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.tags ?? []).some(tag => tag.toLowerCase().includes(q)) ||
          (t.skills ?? []).some(s => s.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [templates, search, activeCategory]);

  const handleUseTemplate = async (template: MarketplaceTemplate) => {
    setInstalling(template.id);
    setInstallError(null);
    try {
      const agent = await createAgent({
        name: template.name,
        platform: 'cloud',
        config: {
          model: template.config.model,
          temperature: template.config.temperature,
          system_prompt: template.config.system_prompt,
          avatar: template.avatar ?? template.config.icon,
        },
      } as any);
      onCreated(agent.id);
    } catch (err: any) {
      setInstallError(err.message || 'Failed to create agent from template');
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div>
      {/* Search + category filters */}
      <div className="mb-5 space-y-3">
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280]"
        />

        <div className="flex items-center gap-1 flex-wrap">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                activeCategory === cat.key
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                  : 'bg-transparent border-[rgba(255,255,255,0.07)] text-[#6b7280] hover:text-white hover:border-[rgba(255,255,255,0.15)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {installError && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
          {installError}
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-6 text-center text-red-400">
          Failed to load templates.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <Skeleton className="size-12 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-4/5 mb-3" />
              <div className="flex gap-1.5 mb-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-[#6b7280]">
              {search || activeCategory !== 'All'
                ? 'No templates match your filters.'
                : 'No templates available.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(template => (
                <div
                  key={template.id}
                  className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 flex flex-col hover:border-[rgba(255,255,255,0.15)] transition-colors"
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 mb-3">
                    <TemplateAvatar avatar={template.avatar} name={template.name} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate leading-tight mb-1">
                        {template.name}
                      </h3>
                      <CategoryBadge category={template.category} />
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#9ca3af] line-clamp-2 flex-1 mb-3">
                    {template.description}
                  </p>

                  {/* Skills pills */}
                  {(template.skills ?? []).length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      {(template.skills ?? []).slice(0, 3).map(skill => (
                        <span
                          key={skill}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        >
                          {skill.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {(template.skills ?? []).length > 3 && (
                        <span className="text-[10px] text-[#6b7280]">
                          +{(template.skills ?? []).length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Model info */}
                  <p className="text-xs text-[#6b7280] mb-4 truncate">
                    Model: {template.config.model || '—'}
                  </p>

                  {/* Action */}
                  <Button
                    onClick={() => handleUseTemplate(template)}
                    disabled={installing === template.id}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-8"
                  >
                    {installing === template.id ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin rounded-full size-3 border-b border-white" />
                        Creating...
                      </span>
                    ) : (
                      'Use Template'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'agents' | 'templates';

export default function AgentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('agents');

  const { data: agents, isLoading, error, mutate } = useApi<Agent[]>(
    '/api/v1/agents',
    () => getAgents(),
  );

  const filtered = useMemo(() => {
    if (!agents) return [];
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      a =>
        a.name.toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q) ||
        (a.platform || '').toLowerCase().includes(q) ||
        (a.provider || '').toLowerCase().includes(q),
    );
  }, [agents, search]);

  const formatLastActive = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  return (
    <>
      <PageHeader title="Agents" description="Manage your AI agents">
        <Button
          variant="outline"
          className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]"
          onClick={() => router.push('/browser-operator')}
        >
          Browser Operator
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => router.push('/agents/new')}
        >
          + Create Agent
        </Button>
      </PageHeader>

      <div className="flex-1 px-6 pb-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-[rgba(255,255,255,0.07)] -mx-6 px-6">
          {(['agents', 'templates'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap capitalize ${
                activeTab === tab
                  ? 'text-blue-400 border-blue-400'
                  : 'text-[#6b7280] border-transparent hover:text-white hover:border-[rgba(255,255,255,0.2)]'
              }`}
            >
              {tab === 'agents' ? 'My Agents' : 'Templates'}
            </button>
          ))}
        </div>

        {/* ── My Agents tab ── */}
        {activeTab === 'agents' && (
          <>
            {/* Search bar */}
            <div className="mb-4">
              <Input
                placeholder="Search agents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full lg:max-w-sm bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280]"
              />
            </div>

            {/* Error state */}
            {error && !isLoading && (
              <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-6 text-center text-red-400">
                Failed to load agents.{' '}
                <button onClick={() => mutate()} className="underline ml-1">
                  Retry
                </button>
              </div>
            )}

            {/* Agents list */}
            {!error && (
              <>
                {/* Loading state */}
                {isLoading && <TableSkeleton />}

                {/* Empty state */}
                {!isLoading && filtered.length === 0 && (
                  <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-16 text-center text-[#6b7280]">
                    {search
                      ? 'No agents match your search.'
                      : 'No agents yet. Create your first agent or use a template.'}
                  </div>
                )}

                {/* Mobile card view */}
                {!isLoading && filtered.length > 0 && (
                  <div className="lg:hidden space-y-3">
                    {filtered.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => router.push(`/agents/${agent.id}/config`)}
                        className="w-full bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex items-center gap-3 hover:border-[rgba(255,255,255,0.15)] transition-colors text-left"
                      >
                        <AgentAvatar agent={agent} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white truncate">{agent.name}</span>
                            <StatusBadge status={agent.status} />
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-[#6b7280]">
                            {agent.model && <span>{agent.model}</span>}
                            {agent.model && agent.provider && <span>·</span>}
                            {agent.provider && <span>{agent.provider}</span>}
                          </div>
                          {agent.lastActive && (
                            <p className="text-[10px] text-[#4b5563] mt-0.5">{formatLastActive(agent.lastActive)}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Desktop table view */}
                {!isLoading && filtered.length > 0 && (
                  <div className="hidden lg:block bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[rgba(255,255,255,0.07)] hover:bg-transparent">
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Agent
                          </TableHead>
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Model
                          </TableHead>
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Status
                          </TableHead>
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Last Active
                          </TableHead>
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Provider
                          </TableHead>
                          <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(agent => (
                          <TableRow
                            key={agent.id}
                            className="border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
                            onClick={() => router.push(`/agents/${agent.id}/config`)}
                          >
                            <TableCell className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <AgentAvatar agent={agent} />
                                <div>
                                  <div className="text-lg font-semibold text-white leading-tight">
                                    {agent.name}
                                  </div>
                                  {(agent.username || agent.platform) && (
                                    <div className="text-xs text-[#6b7280] mt-0.5">
                                      {agent.username
                                        ? `@${agent.username}`
                                        : agent.platform}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-3.5 text-sm text-[#9ca3af]">
                              {agent.model || '—'}
                            </TableCell>

                            <TableCell className="px-4 py-3.5">
                              <StatusBadge status={agent.status} />
                            </TableCell>

                            <TableCell className="px-4 py-3.5 text-sm text-[#9ca3af] whitespace-nowrap">
                              {formatLastActive(agent.lastActive)}
                            </TableCell>

                            <TableCell className="px-4 py-3.5 text-sm text-[#9ca3af]">
                              {agent.provider || '—'}
                            </TableCell>

                            <TableCell
                              className="px-4 py-3.5"
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[#9ca3af] hover:text-white hover:bg-[rgba(255,255,255,0.07)] h-8 px-2 text-xs"
                                  onClick={() => router.push(`/agents/${agent.id}/config`)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[#9ca3af] hover:text-white hover:bg-[rgba(255,255,255,0.07)] h-8 px-2 text-xs"
                                  onClick={() => router.push(`/agents/${agent.id}/executions`)}
                                >
                                  Executions
                                </Button>
                                <DeleteAgentDialog
                                  agent={agent}
                                  onDeleted={() => mutate()}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Templates tab ── */}
        {activeTab === 'templates' && (
          <TemplatesTab
            onCreated={agentId => router.push(`/agents/${agentId}/config`)}
          />
        )}
      </div>
    </>
  );
}
