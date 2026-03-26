'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getNode, dispatch } from '@/lib/api/endpoints/nexus';

// ─── Types ─────────────────────────────────────────────────────────────────────
// NexusNode from types.ts is the list card type; the detail endpoint may return
// a richer shape. We extend locally to stay safe.

interface NodeAgent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  tasksDone: number;
}

interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
}

interface NodeDetail {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  ip?: string;
  connectedSince?: string;
  lastHeartbeat?: string;
  agents?: NodeAgent[];
  recentActivity?: ActivityEvent[];
  // nexus list shape fallback
  agentCount?: number;
  mode?: string;
  clientName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso?: string): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Status styles ────────────────────────────────────────────────────────────

const NODE_STATUS: Record<string, { dot: string; badge: string; label: string }> = {
  online: { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Online' },
  offline: { dot: 'bg-slate-400', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: 'Offline' },
  error: { dot: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Error' },
};

const AGENT_STATUS: Record<string, { dot: string; color: string; label: string }> = {
  active: { dot: 'bg-emerald-400', color: 'text-emerald-400', label: 'active' },
  idle: { dot: 'bg-amber-400', color: 'text-amber-400', label: 'idle' },
  error: { dot: 'bg-red-400', color: 'text-red-400', label: 'error' },
};

function StatusBadge({ status }: { status: string }) {
  const s = NODE_STATUS[status] ?? NODE_STATUS.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 bg-[#14151f] rounded w-32" />
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 space-y-3">
        <div className="h-4 bg-[#1e293b] rounded w-20" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-[#1e293b] rounded w-16" />
              <div className="h-4 bg-[#1e293b] rounded w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl h-40" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NexusNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [taskInput, setTaskInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const activityRef = useRef<HTMLDivElement>(null);

  const fetchNode = useCallback(async () => {
    setError('');
    try {
      const data = await getNode(id);
      // The API may return { node: ... } or the node directly
      setNode(((data as any).node ?? data) as NodeDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load node');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchNode(); }, [fetchNode]);

  const handleSendTask = async () => {
    if (!taskInput.trim()) return;
    setSending(true);
    setSendFeedback(null);
    try {
      const result = await dispatch(id, taskInput.trim());
      setSendFeedback({ ok: true, msg: `Task dispatched successfully` });
      setTaskInput('');
      // Refresh node to reflect new activity
      fetchNode();
    } catch (err) {
      setSendFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed to send task' });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Skeleton />;

  if (error || !node) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-4xl mb-4">🔌</p>
        <h2 className="text-lg font-semibold text-white mb-2">Node not found</h2>
        <p className="text-sm text-[#9ca3af] mb-6">{error || 'This node does not exist or is unreachable.'}</p>
        <Link href="/nexus" className="text-[#3b82f6] hover:underline text-sm">← Back to Nexus</Link>
      </div>
    );
  }

  const agents: NodeAgent[] = node.agents ?? [];
  const activity: ActivityEvent[] = node.recentActivity ?? [];

  const isEnterprise = node.mode === 'enterprise';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <Link href="/nexus" className="text-[#9ca3af] hover:text-white transition-colors">
            ← Nexus
          </Link>
          {isEnterprise && node.clientName && (
            <>
              <span className="text-[#374151]">/</span>
              <span className="text-[#6b7280]">{node.clientName}</span>
            </>
          )}
          <span className="text-[#374151]">/</span>
          <h1 className="text-white font-semibold">{node.name}</h1>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* Enterprise client info banner */}
      {isEnterprise && node.clientName && (
        <div className="flex items-center gap-3 bg-emerald-900/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <span className="text-emerald-400 text-lg shrink-0">🏢</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400/70 uppercase tracking-wide font-medium">Enterprise Deployment</p>
            <p className="text-sm text-white font-medium truncate">{node.clientName}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 shrink-0">
            Enterprise
          </span>
        </div>
      )}

      {/* Info card */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Node Info</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Node ID</dt>
            <dd className="text-sm text-white font-mono">{node.id}</dd>
          </div>
          {node.ip && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">IP Address</dt>
              <dd className="text-sm text-white font-mono">{node.ip}</dd>
            </div>
          )}
          {node.mode && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Mode</dt>
              <dd className="text-sm text-white capitalize">{node.mode}</dd>
            </div>
          )}
          {node.clientName && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Client</dt>
              <dd className="text-sm text-white">{node.clientName}</dd>
            </div>
          )}
          {node.connectedSince && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Connected since</dt>
              <dd className="text-sm text-white">{formatDate(node.connectedSince)}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Last heartbeat</dt>
            <dd className="text-sm text-white">{timeAgo(node.lastHeartbeat)}</dd>
          </div>
        </dl>
      </section>

      {/* Agents table */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Agents
            <span className="ml-2 text-xs font-normal text-[#6b7280]">({agents.length})</span>
          </h2>
        </div>

        {agents.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#6b7280]">
            No agents deployed to this node yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  <th className="text-left px-5 py-3 text-xs text-[#6b7280] uppercase tracking-wider">Agent</th>
                  <th className="text-left px-5 py-3 text-xs text-[#6b7280] uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs text-[#6b7280] uppercase tracking-wider">Tasks Done</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const s = AGENT_STATUS[agent.status] ?? AGENT_STATUS.idle;
                  return (
                    <tr
                      key={agent.id}
                      className="border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-white font-medium">{agent.name}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${s.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[#9ca3af]">{agent.tasksDone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Send task */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Send Task</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !sending && handleSendTask()}
            placeholder="Describe the task to dispatch to this node…"
            disabled={sending}
            className="flex-1 px-4 py-2.5 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] disabled:opacity-50"
          />
          <button
            onClick={handleSendTask}
            disabled={sending || !taskInput.trim()}
            className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#3b82f6]/40 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {sending && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {sendFeedback && (
          <p className={`mt-2 text-xs ${sendFeedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {sendFeedback.msg}
          </p>
        )}
      </section>

      {/* Recent activity */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No recent activity recorded.</p>
        ) : (
          <div
            ref={activityRef}
            className="space-y-3 max-h-64 overflow-y-auto pr-1"
          >
            {activity.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <span className="text-[#4b5563] mt-0.5 shrink-0">•</span>
                <span className="text-[#d1d5db] flex-1">{event.message}</span>
                <span className="text-xs text-[#6b7280] shrink-0 ml-2 whitespace-nowrap">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
