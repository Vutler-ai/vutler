'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { getAgent } from '@/lib/api/endpoints/agents';
import type { Agent } from '@/lib/api/types';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Tab Config ───────────────────────────────────────────────────────────────

const TABS = [
  { label: 'Config', path: 'config' },
  { label: 'Executions', path: 'executions' },
  { label: 'Memory', path: 'memory' },
  { label: 'Integrations', path: 'integrations' },
  { label: 'Publish', path: 'publish' },
] as const;

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Agent['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-400 bg-green-500/15 border border-green-500/20 px-2 py-0.5 rounded-full">
        <span className="size-1.5 rounded-full bg-green-400 inline-block" />
        Online
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-500/15 border border-red-500/20 px-2 py-0.5 rounded-full">
        <span className="size-1.5 rounded-full bg-red-400 inline-block" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] px-2 py-0.5 rounded-full">
      <span className="size-1.5 rounded-full bg-[#6b7280] inline-block" />
      Offline
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AgentAvatar({ agent }: { agent: Pick<Agent, 'avatar' | 'name'> }) {
  if (agent.avatar) {
    return (
      <div className="size-10 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-xl shrink-0">
        {agent.avatar}
      </div>
    );
  }
  const initials = agent.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="size-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400 shrink-0">
      {initials || '?'}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AgentDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const agentId = params.id as string;

  const { data: agent, isLoading } = useApi<Agent>(
    `/api/v1/agents/${agentId}`,
    () => getAgent(agentId),
  );

  const activeTab = TABS.find(t => pathname.endsWith(`/${t.path}`))?.path ?? 'config';

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <div className="px-6 pt-4 pb-0 border-b border-[rgba(255,255,255,0.07)]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-4 text-[#6b7280]">
          <button
            onClick={() => router.push('/agents')}
            className="hover:text-white transition-colors"
          >
            Agents
          </button>
          <span className="text-[#4b5563]">/</span>
          {isLoading ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <span className="text-[#9ca3af]">{agent?.name ?? 'Agent'}</span>
          )}
        </div>

        {/* Agent identity */}
        <div className="flex items-center gap-4 mb-4">
          {isLoading ? (
            <>
              <Skeleton className="size-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            </>
          ) : agent ? (
            <>
              <AgentAvatar agent={agent} />
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-white leading-tight">{agent.name}</h1>
                  <StatusBadge status={agent.status} />
                </div>
                <p className="text-xs text-[#6b7280] mt-0.5">
                  {[agent.model, agent.provider].filter(Boolean).join(' · ') || 'No model configured'}
                </p>
              </div>
            </>
          ) : (
            <div>
              <h1 className="text-xl font-bold text-white">Agent</h1>
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <nav className="flex gap-1 -mb-px" role="tablist">
          {TABS.map(tab => {
            const isActive = activeTab === tab.path;
            return (
              <button
                key={tab.path}
                role="tab"
                aria-selected={isActive}
                onClick={() => router.push(`/agents/${agentId}/${tab.path}`)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-blue-400 border-blue-400'
                    : 'text-[#6b7280] border-transparent hover:text-white hover:border-[rgba(255,255,255,0.2)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
