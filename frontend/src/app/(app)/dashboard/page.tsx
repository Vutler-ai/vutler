'use client';

import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { getAgents } from '@/lib/api/endpoints/agents';
import { getTasks } from '@/lib/api/endpoints/tasks';
import type { Agent, Task } from '@/lib/api/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function statusDot(status: Agent['status']) {
  const map: Record<string, string> = {
    active: 'bg-[#22c55e]',
    inactive: 'bg-[#6b7280]',
    error: 'bg-[#ef4444]',
  };
  return map[status] ?? 'bg-[#6b7280]';
}

function statusLabel(status: Agent['status']) {
  const map: Record<string, string> = {
    active: 'Active',
    inactive: 'Inactive',
    error: 'Error',
  };
  return map[status] ?? status;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <Card
          key={i}
          className="bg-[#14151f] border-[rgba(255,255,255,0.07)] gap-3"
        >
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
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] transition-colors gap-3">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium text-[#9ca3af]">
            {label}
          </CardTitle>
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${iconBg}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-white mb-1">{value}</p>
        <p className="text-xs text-[#6b7280]">{subtitle}</p>
      </CardContent>
    </Card>
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

  // Resolve stats — prefer dashboard endpoint, fall back to derived counts
  const stats = dashboardData?.stats;
  const agents = agentsData ?? dashboardData?.agents ?? [];
  const tasks = tasksData ?? [];
  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const auditLogs: AuditLog[] = auditData?.logs ?? [];

  const totalAgents = stats?.totalAgents ?? agents.length;
  const activeAgents = stats?.activeAgents ?? agents.filter((a) => a.status === 'active').length;
  const messagesToday = stats?.messagesToday ?? 0;
  const totalTokens = stats?.totalTokens ?? 0;

  const statsLoading = dashLoading && agentsLoading;
  const statsError = dashError && agentsError;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#9ca3af]">
            Monitor your agents and system performance
          </p>
        </div>
        <button
          onClick={() => router.push('/builder')}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#08090f]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Agent</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

      {/* Quick Actions */}
      <section
        className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 mb-8"
        aria-labelledby="quick-actions-heading"
      >
        <h2 id="quick-actions-heading" className="text-lg font-semibold text-white mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        </div>
      </section>

      {/* Main content grid: Agents table + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Agents Overview */}
        <section className="lg:col-span-2" aria-labelledby="agents-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="agents-heading" className="text-lg font-semibold text-white">
              Agents Overview
            </h2>
            <a
              href="/agents"
              className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#3b82f6] rounded px-2 py-1"
            >
              View all →
            </a>
          </div>

          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            {agentsLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="w-10 h-10 rounded-lg bg-[#1a1b2e]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32 bg-[#1a1b2e]" />
                      <Skeleton className="h-3 w-20 bg-[#1a1b2e]" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full bg-[#1a1b2e]" />
                  </div>
                ))}
              </div>
            ) : agentsError ? (
              <div className="p-8 text-center text-sm text-[#ef4444]">
                Failed to load agents.
              </div>
            ) : agents.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-12 h-12 mx-auto text-[#6b7280] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm text-[#9ca3af] mb-4">No agents yet</p>
                <button
                  onClick={() => router.push('/builder')}
                  className="text-sm text-[#3b82f6] hover:text-[#2563eb] font-medium transition-colors"
                >
                  Create your first agent →
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[#0e0f1a] [&_tr]:border-b-[rgba(255,255,255,0.07)]">
                  <TableRow className="border-b-[rgba(255,255,255,0.07)] hover:bg-transparent">
                    <TableHead className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wider px-6 py-4">
                      Name
                    </TableHead>
                    <TableHead className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden sm:table-cell">
                      Platform
                    </TableHead>
                    <TableHead className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wider px-6 py-4">
                      Status
                    </TableHead>
                    <TableHead className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wider px-6 py-4 hidden md:table-cell">
                      Last Active
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:last-child]:border-0 [&_tr]:border-b-[rgba(255,255,255,0.07)]">
                  {agents.slice(0, 8).map((agent) => (
                    <TableRow
                      key={agent.id}
                      className="border-b-[rgba(255,255,255,0.07)] hover:bg-[#0e0f1a] cursor-pointer transition-colors"
                      onClick={() => router.push(`/agents/${agent.id}`)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/agents/${agent.id}`)}
                      aria-label={`View agent ${agent.name}`}
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#a855f7] flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
                            aria-hidden="true"
                          >
                            {agent.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white truncate max-w-[120px]">
                            {agent.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 hidden sm:table-cell">
                        <span className="text-sm text-[#9ca3af]">
                          {agent.platform ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(agent.status)}`}
                            aria-hidden="true"
                          />
                          <Badge
                            variant="outline"
                            className="text-xs border-[rgba(255,255,255,0.1)] text-[#9ca3af]"
                          >
                            {statusLabel(agent.status)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 hidden md:table-cell">
                        <span className="text-sm text-[#6b7280]">
                          {agent.lastActive
                            ? formatRelativeTime(agent.lastActive)
                            : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>

        {/* Activity Feed */}
        <section aria-labelledby="activity-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="activity-heading" className="text-lg font-semibold text-white">
              Recent Activity
            </h2>
          </div>

          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 h-full">
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
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
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
      </div>
    </>
  );
}
