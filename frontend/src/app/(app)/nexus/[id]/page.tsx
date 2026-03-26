'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';

// ─── Types ─────────────────────────────────────────────────────────────────

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

interface NexusNode {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  connectedSince: string;
  lastHeartbeat: string;
  ip: string;
  agents: NodeAgent[];
  recentActivity: ActivityEvent[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const NODE_STATUS: Record<string, { dot: string; label: string; badge: string }> = {
  online: {
    dot: 'bg-emerald-400',
    label: 'Online',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  offline: {
    dot: 'bg-slate-400',
    label: 'Offline',
    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  },
  error: {
    dot: 'bg-red-400',
    label: 'Error',
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
};

const AGENT_STATUS: Record<string, { dot: string; label: string; color: string }> = {
  active: { dot: 'bg-emerald-400', label: 'active', color: 'text-emerald-400' },
  idle: { dot: 'bg-amber-400', label: 'idle', color: 'text-amber-400' },
  error: { dot: 'bg-red-400', label: 'error', color: 'text-red-400' },
};

function StatusBadge({ status }: { status: NexusNode['status'] }) {
  const s = NODE_STATUS[status] ?? NODE_STATUS.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NexusNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [node, setNode] = useState<NexusNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Send-task form
  const [taskInput, setTaskInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const activityRef = useRef<HTMLDivElement>(null);

  const fetchNode = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch(`/api/v1/nexus/${id}`);
      if (!res.ok) throw new Error(`Failed to load node (${res.status})`);
      const data = await res.json();
      setNode(data.node ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load node');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchNode();
  }, [fetchNode]);

  const handleSendTask = async () => {
    if (!taskInput.trim()) return;
    setSending(true);
    setSendFeedback(null);
    try {
      const res = await authFetch(`/api/v1/nexus/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: taskInput.trim() }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      const data = await res.json();
      setSendFeedback({ ok: true, msg: `Task queued — ID: ${data.taskId ?? 'N/A'}` });
      setTaskInput('');
    } catch (err) {
      setSendFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed to send task' });
    } finally {
      setSending(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3b82f6]" />
      </div>
    );
  }

  // ── Node not found ─────────────────────────────────────────────────────────

  if (error || !node) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-4xl mb-4">🔌</p>
        <h2 className="text-lg font-semibold text-white mb-2">Node not found</h2>
        <p className="text-sm text-[#9ca3af] mb-6">{error || 'This node does not exist or is unreachable.'}</p>
        <Link href="/nexus" className="text-[#3b82f6] hover:underline text-sm">
          ← Back to Nexus
        </Link>
      </div>
    );
  }

  const nodeStatus = NODE_STATUS[node.status] ?? NODE_STATUS.offline;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/nexus"
            className="text-sm text-[#9ca3af] hover:text-white transition-colors flex items-center gap-1"
          >
            ← Back to Nexus
          </Link>
          <span className="text-[#374151]">/</span>
          <h1 className="text-lg font-semibold text-white">{node.name}</h1>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* ── Info card ──────────────────────────────────────────────────────── */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Info</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Node ID</dt>
            <dd className="text-sm text-white font-mono">{node.id}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">IP Address</dt>
            <dd className="text-sm text-white font-mono">{node.ip}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Connected since</dt>
            <dd className="text-sm text-white">{formatDate(node.connectedSince)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Last heartbeat</dt>
            <dd className="text-sm text-white">{timeAgo(node.lastHeartbeat)}</dd>
          </div>
        </dl>
      </section>

      {/* ── Agents table ───────────────────────────────────────────────────── */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Agents
            <span className="ml-2 text-xs font-normal text-[#6b7280]">({node.agents.length})</span>
          </h2>
          <button
            className="px-3 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-xs font-medium transition-colors"
            onClick={() => alert('Add agent — not yet implemented')}
          >
            + Add
          </button>
        </div>

        {node.agents.length === 0 ? (
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
                  <th className="text-left px-5 py-3 text-xs text-[#6b7280] uppercase tracking-wider">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {node.agents.map((agent) => {
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
                      <td className="px-5 py-3 text-sm text-[#9ca3af]">{agent.tasksDone} done</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Send task ──────────────────────────────────────────────────────── */}
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
            {sending && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {sendFeedback && (
          <p className={`mt-2 text-xs ${sendFeedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {sendFeedback.msg}
          </p>
        )}
      </section>

      {/* ── Recent activity ────────────────────────────────────────────────── */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
        {node.recentActivity.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No recent activity recorded.</p>
        ) : (
          <div
            ref={activityRef}
            className="space-y-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[rgba(255,255,255,0.1)]"
          >
            {node.recentActivity.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <span className="text-[#4b5563] mt-0.5 flex-shrink-0">•</span>
                <span className="text-[#d1d5db] flex-1">{event.message}</span>
                <span className="text-xs text-[#6b7280] flex-shrink-0 ml-2 whitespace-nowrap">
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
