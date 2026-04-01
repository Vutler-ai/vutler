'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useApi } from '@/hooks/use-api';
import { getAgents, createAgent } from '@/lib/api/endpoints/agents';
import { getTemplates } from '@/lib/api/endpoints/marketplace';
import { getTasks } from '@/lib/api/endpoints/tasks';
import type { Agent, Task, MarketplaceTemplate } from '@/lib/api/types';
import { getAvatarImageUrl, getStaticAvatarUrl } from '@/lib/avatar';
import { getTemplateLaunchHref, getTemplateLaunchLabel } from '@/lib/template-launch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Dashboard endpoint types ────────────────────────────────────────────────

interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  messagesToday: number;
  totalTokens: number;
}

interface DashboardResponse {
  success: boolean;
  agents: Agent[];
  stats: DashboardStats;
}

interface AuditLog {
  id: string;
  action: string;
  description: string;
  created_at: string;
  user_id?: string;
}

interface AuditLogsResponse {
  logs?: AuditLog[];
}

// ─── Avatar constants ─────────────────────────────────────────────────────────

const KNOWN_AVATAR_SLUGS = new Set([
  'accounting-assistant',
  'appointment-scheduler',
  'av-engineer',
  'bi-agent',
  'competitor-monitor',
  'compliance-monitor',
  'contract-manager',
  'customer-success',
  'document-processor',
  'ecommerce-manager',
  'feedback-analyzer',
  'hr-assistant',
  'inventory-optimizer',
  'invoice-manager',
  'knowledge-base',
  'lead-gen',
  'marketing-campaign',
  'personal-assistant',
  'pricing-optimizer',
  'procurement',
  'project-coordinator',
  'proposal-generator',
  'research-analyst',
  'social-media-manager',
  'translator',
  'workflow-automation',
]);

const FALLBACK_AVATAR = '/static/avatars/personal-assistant.png';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAgentAvatarUrl(agent: Agent): string | null {
  const directAvatarUrl = getAvatarImageUrl(agent.avatar, agent.name);
  if (directAvatarUrl) return directAvatarUrl;

  // 0. If avatar is a full path (e.g. /static/avatars/andrea.png), use directly
  if (agent.avatar && (agent.avatar.startsWith('/static/') || agent.avatar.startsWith('/sprites/') || /\.(png|svg|jpg)$/i.test(agent.avatar))) {
    return agent.avatar;
  }
  // 1. Direct avatar slug from DB (e.g. "lead-gen", "hr-assistant")
  if (agent.avatar && /^[a-z0-9-]+$/.test(agent.avatar)) {
    if (KNOWN_AVATAR_SLUGS.has(agent.avatar)) {
      return `/static/avatars/${agent.avatar}.png`;
    }
  }
  // 2. Derive slug from platform or name
  const source = agent.platform ?? agent.name ?? '';
  const slug = source
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  if (KNOWN_AVATAR_SLUGS.has(slug)) {
    return `/static/avatars/${slug}.png`;
  }
  // 3. Try agent name as slug
  const nameSlug = agent.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  if (KNOWN_AVATAR_SLUGS.has(nameSlug)) {
    return `/static/avatars/${nameSlug}.png`;
  }
  return null;
}

/** Map a template category to the best matching avatar PNG. */
function getTemplateAvatarUrl(template: MarketplaceTemplate): string {
  const explicitAvatar = getStaticAvatarUrl(template.avatar || template.config.icon);
  if (explicitAvatar) return explicitAvatar;

  const category = template.category.toLowerCase();
  const name = template.name.toLowerCase();

  const CATEGORY_MAP: Record<string, string> = {
    marketing: 'marketing-campaign',
    sales: 'lead-gen',
    hr: 'hr-assistant',
    finance: 'accounting-assistant',
    accounting: 'accounting-assistant',
    legal: 'compliance-monitor',
    compliance: 'compliance-monitor',
    research: 'research-analyst',
    analytics: 'bi-agent',
    support: 'customer-success',
    customer: 'customer-success',
    social: 'social-media-manager',
    content: 'marketing-campaign',
    productivity: 'workflow-automation',
    automation: 'workflow-automation',
    scheduling: 'appointment-scheduler',
    procurement: 'procurement',
    inventory: 'inventory-optimizer',
    ecommerce: 'ecommerce-manager',
    documents: 'document-processor',
    translation: 'translator',
    project: 'project-coordinator',
    proposals: 'proposal-generator',
    knowledge: 'knowledge-base',
  };

  for (const [key, slug] of Object.entries(CATEGORY_MAP)) {
    if (category.includes(key) || name.includes(key)) {
      return `/static/avatars/${slug}.png`;
    }
  }
  return FALLBACK_AVATAR;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function statusDotClass(status: Agent['status']): string {
  const map: Record<string, string> = {
    active: 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]',
    inactive: 'bg-[#6b7280]',
    error: 'bg-[#ef4444]',
  };
  return map[status] ?? 'bg-[#6b7280]';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="bg-[#14151f] border-[rgba(255,255,255,0.07)] gap-3">
          <CardHeader className="pb-0">
            <Skeleton className="h-4 w-28 bg-[#1a1b2e]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20 bg-[#1a1b2e] mb-2" />
            <Skeleton className="h-3 w-36 bg-[#1a1b2e]" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

interface StatCardItemProps {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
}

function StatCardItem({ label, value, subtitle, icon, iconBg }: StatCardItemProps) {
  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-colors gap-2 sm:gap-3">
      <CardHeader className="pb-0 px-3 sm:px-6 pt-3 sm:pt-6">
        <div className="flex items-start justify-between">
          <CardTitle className="text-xs sm:text-sm font-medium text-[#9ca3af]">{label}</CardTitle>
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${iconBg}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
        <p className="text-xl sm:text-3xl font-bold text-white mb-1">{value}</p>
        <p className="text-[10px] sm:text-xs text-[#6b7280]">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── Agent Avatar (with image + initials fallback) ────────────────────────────

function AgentAvatarImage({ agent }: { agent: Agent }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = failed ? null : getAgentAvatarUrl(agent);

  if (avatarUrl) {
    return (
      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#0e0f1a]">
        <Image
          src={avatarUrl}
          alt={agent.name}
          width={56}
          height={56}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const initials = agent.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#a855f7] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
      {initials || '?'}
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 p-4 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl hover:border-[rgba(255,255,255,0.2)] hover:bg-[#1a1b2e] transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f] min-w-[180px] max-w-[200px] flex-shrink-0 group"
      aria-label={`Open agent ${agent.name}`}
    >
      <div className="relative">
        <AgentAvatarImage agent={agent} />
        <span
          className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-[#14151f] ${statusDotClass(agent.status)}`}
          aria-label={agent.status}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate group-hover:text-[#3b82f6] transition-colors">
          {agent.name}
        </p>
        {agent.platform && (
          <p className="text-xs text-[#6b7280] truncate mt-0.5">{agent.platform}</p>
        )}
        {agent.lastActive && (
          <p className="text-[10px] text-[#4b5563] mt-1">
            {formatRelativeTime(agent.lastActive)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Agent Cards Section ──────────────────────────────────────────────────────

function AgentCardsSection({
  agents,
  isLoading,
  isError,
  onNewAgent,
  onViewAll,
  onAgentClick,
}: {
  agents: Agent[];
  isLoading: boolean;
  isError: boolean;
  onNewAgent: () => void;
  onViewAll: () => void;
  onAgentClick: (agent: Agent) => void;
}) {
  return (
    <section aria-labelledby="agents-heading" className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 id="agents-heading" className="text-lg font-semibold text-white">
          My Agents
        </h2>
        <button
          onClick={onViewAll}
          className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-2 py-1"
        >
          View all →
        </button>
      </div>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="min-w-[180px] max-w-[200px] flex-shrink-0 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col gap-3"
            >
              <Skeleton className="w-14 h-14 rounded-xl bg-[#1a1b2e]" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28 bg-[#1a1b2e]" />
                <Skeleton className="h-3 w-20 bg-[#1a1b2e]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 text-center text-sm text-[#ef4444]">
          Failed to load agents.
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-10 text-center">
          <svg className="w-12 h-12 mx-auto text-[#6b7280] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-[#9ca3af] mb-4">No agents yet</p>
          <button
            onClick={onNewAgent}
            className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors"
          >
            Create your first agent →
          </button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[#1a1b2e] scrollbar-track-transparent">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => onAgentClick(agent)}
            />
          ))}
          {/* Add agent CTA card */}
          <button
            onClick={onNewAgent}
            className="flex flex-col items-center justify-center gap-2 p-4 bg-[#0e0f1a] border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl hover:border-[#3b82f6] hover:bg-[#14151f] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f] min-w-[180px] max-w-[200px] flex-shrink-0"
            aria-label="Create new agent"
          >
            <div className="w-14 h-14 rounded-xl bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-[#6b7280] hover:text-[#3b82f6] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-xs text-[#6b7280] font-medium">New Agent</span>
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Template Avatar Image ────────────────────────────────────────────────────

function TemplateAvatarImage({ template }: { template: MarketplaceTemplate }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = failed ? FALLBACK_AVATAR : getTemplateAvatarUrl(template);

  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#0e0f1a]">
      <Image
        src={avatarUrl}
        alt={template.name}
        width={48}
        height={48}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ─── Popular Templates Section ────────────────────────────────────────────────

function PopularTemplatesSection({
  onViewAll,
}: {
  onViewAll: () => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const router = useRouter();

  const { data, isLoading, error } = useApi(
    '/api/v1/marketplace/templates?limit=6',
    () => getTemplates({ limit: 6 }),
  );

  const templates = data?.templates ?? [];

  const handleUseTemplate = async (template: MarketplaceTemplate) => {
    const launchHref = getTemplateLaunchHref(template);
    if (launchHref) {
      router.push(launchHref);
      return;
    }

    setInstalling(template.id);
    try {
      const agent = await createAgent({
        name: template.name,
        platform: 'cloud',
        config: {
          model: template.config.model,
          temperature: template.config.temperature,
          system_prompt: template.config.system_prompt,
          avatar: template.config.icon,
        },
      } as Parameters<typeof createAgent>[0]);
      router.push(`/agents/${agent.id}/config`);
    } catch {
      // silently ignore, user stays on dashboard
    } finally {
      setInstalling(null);
    }
  };

  return (
    <section aria-labelledby="templates-heading" className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 id="templates-heading" className="text-lg font-semibold text-white">
          Popular Templates
        </h2>
        <button
          onClick={onViewAll}
          className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-2 py-1"
        >
          View all →
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex items-start gap-3"
            >
              <Skeleton className="w-12 h-12 rounded-xl bg-[#1a1b2e] flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-[#1a1b2e]" />
                <Skeleton className="h-3 w-1/2 bg-[#1a1b2e]" />
                <Skeleton className="h-3 w-full bg-[#1a1b2e]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 text-center text-sm text-[#ef4444]">
          Failed to load templates.
        </div>
      )}

      {!isLoading && !error && templates.length === 0 && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 text-center text-sm text-[#6b7280]">
          No templates available.
        </div>
      )}

      {!isLoading && !error && templates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col hover:border-[rgba(255,255,255,0.15)] transition-colors"
            >
              <div className="flex items-start gap-3 mb-3">
                <TemplateAvatarImage template={template} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {template.name}
                  </h3>
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[rgba(59,130,246,0.12)] text-[#60a5fa] border border-[rgba(59,130,246,0.2)] mt-1">
                    {template.category}
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#9ca3af] line-clamp-2 flex-1 mb-4">
                {template.description}
              </p>

              <button
                onClick={() => handleUseTemplate(template)}
                disabled={installing === template.id}
                className="w-full h-8 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 text-white text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f] flex items-center justify-center gap-2"
              >
                {installing === template.id ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-b border-white animate-spin" aria-hidden="true" />
                    Creating...
                  </>
                ) : (
                  getTemplateLaunchLabel(template) || 'Use Template'
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const {
    data: dashboardData,
    isLoading: dashLoading,
    error: dashError,
  } = useApi<DashboardResponse>('/api/v1/dashboard');

  const {
    data: agentsData,
    isLoading: agentsLoading,
    error: agentsError,
  } = useApi<Agent[]>('/api/v1/agents', () => getAgents());

  const {
    data: tasksData,
    isLoading: tasksLoading,
  } = useApi<Task[]>('/api/v1/tasks', () => getTasks());

  const {
    data: auditData,
    isLoading: auditLoading,
  } = useApi<AuditLogsResponse>('/api/v1/audit-logs?limit=10');

  // Resolve stats
  const stats = dashboardData?.stats;
  const agents = agentsData ?? dashboardData?.agents ?? [];
  const tasks = tasksData ?? [];
  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const auditLogs: AuditLog[] = auditData?.logs ?? [];

  const totalAgents = stats?.totalAgents ?? agents.length;
  const activeAgents = stats?.activeAgents ?? agents.filter((a) => a.status === 'active' || a.status === 'online').length;
  const messagesToday = stats?.messagesToday ?? 0;
  const totalTokens = stats?.totalTokens ?? 0;

  const statsLoading = dashLoading && agentsLoading;
  const statsError = dashError && agentsError;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-xs sm:text-sm text-[#9ca3af]">
            Monitor your agents and system performance
          </p>
        </div>
        <button
          onClick={() => router.push('/builder')}
          className="flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New Agent</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {statsLoading ? (
          <StatsSkeleton />
        ) : statsError ? (
          <div className="col-span-4 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 text-center text-sm text-[#ef4444]">
            Failed to load stats. Please refresh.
          </div>
        ) : (
          <>
            <StatCardItem
              label="Total Agents"
              value={totalAgents.toLocaleString()}
              subtitle={`${activeAgents} currently active`}
              iconBg="bg-gradient-to-br from-[#3b82f6] to-[#2563eb]"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
            />
            <StatCardItem
              label="Active Tasks"
              value={tasksLoading ? '…' : activeTasks.toLocaleString()}
              subtitle={`${tasks.length} total tasks`}
              iconBg="bg-gradient-to-br from-[#a855f7] to-[#9333ea]"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              }
            />
            <StatCardItem
              label="Messages Today"
              value={messagesToday.toLocaleString()}
              subtitle="Across all channels"
              iconBg="bg-gradient-to-br from-[#22c55e] to-[#16a34a]"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
            />
            <StatCardItem
              label="Token Usage"
              value={totalTokens.toLocaleString()}
              subtitle="Total tokens consumed"
              iconBg="bg-gradient-to-br from-[#f59e0b] to-[#d97706]"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* My Agents - horizontal card row */}
      <AgentCardsSection
        agents={agents}
        isLoading={agentsLoading}
        isError={!!agentsError}
        onNewAgent={() => router.push('/builder')}
        onViewAll={() => router.push('/agents')}
        onAgentClick={(agent) => router.push(`/agents/${agent.id}/config`)}
      />

      {/* Popular Templates */}
      <PopularTemplatesSection
        onViewAll={() => router.push('/agents?tab=templates')}
      />

      {/* Bottom grid: activity feed + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <section className="lg:col-span-2" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="activity-heading" className="text-lg font-semibold text-white">
              Recent Activity
            </h2>
          </div>

          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            {auditLoading ? (
              <div className="space-y-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-start space-x-3">
                    <Skeleton className="w-2 h-2 rounded-full bg-[#1a1b2e] mt-1.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-full bg-[#1a1b2e]" />
                      <Skeleton className="h-3 w-16 bg-[#1a1b2e]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
                <svg className="w-10 h-10 text-[#6b7280] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-[#9ca3af]">No recent activity</p>
              </div>
            ) : (
              <ol className="space-y-5">
                {auditLogs.map((log, idx) => (
                  <li key={log.id} className="flex items-start space-x-3">
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${idx === 0 ? 'bg-[#3b82f6]' : 'bg-[#374151]'}`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-snug break-words">
                        {log.description || log.action}
                      </p>
                      <time
                        dateTime={log.created_at}
                        className="text-xs text-[#6b7280] mt-0.5 block"
                      >
                        {formatRelativeTime(log.created_at)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <section aria-labelledby="quick-actions-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="quick-actions-heading" className="text-lg font-semibold text-white">
              Quick Actions
            </h2>
          </div>

          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 flex flex-col gap-3">
            <button
              onClick={() => router.push('/builder')}
              className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-white group-hover:text-[#3b82f6] transition-colors">
                New Agent
              </span>
            </button>

            <button
              onClick={() => router.push('/tasks')}
              className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#a855f7] to-[#9333ea] flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="text-sm font-medium text-white group-hover:text-[#a855f7] transition-colors">
                Create Task
              </span>
            </button>

            <button
              onClick={() => router.push('/channel/general')}
              className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-white group-hover:text-[#22c55e] transition-colors">
                Send Message
              </span>
            </button>

            <button
              onClick={() => router.push('/agents?tab=templates')}
              className="flex items-center space-x-3 p-4 rounded-lg bg-[#0e0f1a] hover:bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#14151f]"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-white flex-shrink-0" aria-hidden="true">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-white group-hover:text-[#f59e0b] transition-colors">
                Browse Templates
              </span>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
