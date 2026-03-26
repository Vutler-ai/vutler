'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NexusNode {
  id: string;
  name: string;
  status: 'online' | 'warning' | 'offline';
  agentCount: number;
  lastHeartbeat?: string;
}

interface NexusStats {
  total: number;
  online: number;
  agents: number;
  tasksCompleted: number;
}

interface NexusStatusResponse {
  nodes: NexusNode[];
  stats: NexusStats;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const STATUS_DOT: Record<NexusNode['status'], string> = {
  online: 'bg-[#10b981]',
  warning: 'bg-[#f59e0b]',
  offline: 'bg-[#6b7280]',
};

const STATUS_RING: Record<NexusNode['status'], string> = {
  online: 'shadow-[0_0_0_3px_rgba(16,185,129,0.15)]',
  warning: 'shadow-[0_0_0_3px_rgba(245,158,11,0.15)]',
  offline: '',
};

// ─── Deploy Modal ─────────────────────────────────────────────────────────────

interface DeployModalProps {
  onClose: () => void;
}

function DeployModal({ onClose }: DeployModalProps) {
  const [nodeName, setNodeName] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'token' | 'cmd' | null>(null);

  const cliCommand = token
    ? `npx vutler-nexus start --token ${token}`
    : '';

  async function handleGenerate() {
    if (!nodeName.trim()) {
      setError('Node name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/nexus/cli/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to generate token');
      const data = await res.json();
      setToken(data.token);
    } catch {
      setError('Could not generate token. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, type: 'token' | 'cmd') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback: select the text
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md mx-4 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Deploy New Nexus</h2>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Name input */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#9ca3af] uppercase tracking-wide">
            Node Name
          </label>
          <input
            type="text"
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !token && handleGenerate()}
            placeholder="e.g. Studio Paris"
            disabled={!!token}
            className="w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] disabled:opacity-50 transition-colors"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        {/* Generate button */}
        {!token && (
          <button
            onClick={handleGenerate}
            disabled={loading || !nodeName.trim()}
            className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Generating…' : 'Generate Token'}
          </button>
        )}

        {/* Token + CLI command */}
        {token && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">
                API Token
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-[#10b981] text-xs font-mono truncate">
                  {token}
                </code>
                <button
                  onClick={() => copyToClipboard(token, 'token')}
                  className="shrink-0 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors"
                >
                  {copied === 'token' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">
                CLI Command
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-[#9ca3af] text-xs font-mono truncate">
                  {cliCommand}
                </code>
                <button
                  onClick={() => copyToClipboard(cliCommand, 'cmd')}
                  className="shrink-0 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors"
                >
                  {copied === 'cmd' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-xs text-[#6b7280]">
              Run the CLI command on your client machine to register this node.
            </p>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: NexusNode }) {
  return (
    <Link
      href={`/nexus/${node.id}`}
      className={`group flex flex-col bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 hover:border-[rgba(255,255,255,0.14)] transition-all duration-200 ${STATUS_RING[node.status]}`}
    >
      {/* Status row */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`}
        />
        <span className="text-xs text-[#6b7280] capitalize">{node.status}</span>
      </div>

      {/* Name */}
      <p className="text-white font-semibold text-base leading-snug mb-1 group-hover:text-[#3b82f6] transition-colors">
        {node.name}
      </p>

      {/* Meta */}
      <div className="mt-auto pt-4 space-y-1 text-xs text-[#6b7280]">
        <p>
          {node.agentCount === 0
            ? 'No agents'
            : `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`}
        </p>
        <p>Last: {relativeTime(node.lastHeartbeat)}</p>
      </div>

      {/* Manage link */}
      <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <span className="text-xs text-[#3b82f6] group-hover:underline">
          Manage →
        </span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NexusPage() {
  const [nodes, setNodes] = useState<NexusNode[]>([]);
  const [stats, setStats] = useState<NexusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/nexus/status');
      if (!res.ok) throw new Error('Failed to load');
      const data: NexusStatusResponse = await res.json();
      setNodes(data.nodes ?? []);
      setStats(data.stats ?? null);
    } catch {
      setError('Failed to load Nexus data. Please refresh.');
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch after closing deploy modal (node may have been created)
  function handleModalClose() {
    setDeployOpen(false);
    fetchData();
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Nexus Nodes</h1>
        <button
          onClick={() => setDeployOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <span className="text-base leading-none">+</span>
          Deploy New
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-44 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && nodes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">
            🖥️
          </div>
          <p className="text-white font-semibold text-lg">No Nexus nodes deployed yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">
            Deploy your first Nexus node to start managing AI agents at client sites.
          </p>
          <button
            onClick={() => setDeployOpen(true)}
            className="mt-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Deploy New
          </button>
        </div>
      )}

      {/* ── Node grid ── */}
      {!loading && nodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}

      {/* ── Quick stats bar ── */}
      {!loading && stats && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#9ca3af]">
          <span className="font-medium text-white">{stats.total} node{stats.total !== 1 ? 's' : ''}</span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span>
            <span className="text-[#10b981] font-medium">{stats.online}</span> online
          </span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span>
            <span className="text-white font-medium">{stats.agents}</span> agent{stats.agents !== 1 ? 's' : ''}
          </span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span>
            <span className="text-white font-medium">{stats.tasksCompleted.toLocaleString()}</span> tasks done
          </span>
        </div>
      )}

      {/* ── Deploy modal ── */}
      {deployOpen && <DeployModal onClose={handleModalClose} />}
    </div>
  );
}
