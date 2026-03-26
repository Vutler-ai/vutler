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
  { label: 'Integrations', path: 'integrations' },
  { label: 'Publish', path: 'publish' },
] as const;

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: Agent['status'] }) {
  const color =
    status === 'active'
      ? 'bg-green-400'
      : status === 'error'
        ? 'bg-red-400'
        : 'bg-[#6b7280]';
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
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
        <div className="flex items-center gap-2 text-sm mb-3">
          <button
            onClick={() => router.push('/agents')}
            className="text-[#6b7280] hover:text-white transition-colors"
          >
            Agents
          </button>
          <span className="text-[#4b5563]">/</span>
          {isLoading ? (
            <Skeleton className="h-4 w-28" />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{agent?.name ?? 'Agent'}</span>
              {agent && <StatusDot status={agent.status} />}
            </div>
          )}
        </div>

        {/* Agent name + status line */}
        {!isLoading && agent && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl">{agent.avatar || '🤖'}</span>
            <div>
              <h1 className="text-lg font-semibold text-white leading-tight">{agent.name}</h1>
              {agent.model && (
                <p className="text-xs text-[#6b7280]">{agent.model}{agent.provider ? ` · ${agent.provider}` : ''}</p>
              )}
            </div>
          </div>
        )}

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
