'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getNodes, deployLocal, deployEnterprise } from '@/lib/api/endpoints/nexus';
import { getClients, createClient, updateClient, deleteClient } from '@/lib/api/endpoints/clients';
import { getAgents } from '@/lib/api/endpoints/agents';
import type { NexusNode, NexusStats, Agent, Client, CreateClientPayload } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_DOT: Record<NexusNode['status'], string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  offline: 'bg-[#6b7280]',
};
const STATUS_RING: Record<NexusNode['status'], string> = {
  online: 'shadow-[0_0_0_3px_rgba(16,185,129,0.12)]',
  warning: 'shadow-[0_0_0_3px_rgba(245,158,11,0.12)]',
  offline: '',
};
const MODE_BADGE: Record<string, string> = {
  local: 'bg-blue-900/20 text-blue-400 border border-blue-500/30',
  enterprise: 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/30',
  standard: 'bg-[#374151]/40 text-[#9ca3af] border border-[rgba(255,255,255,0.1)]',
};

const inputCls =
  'w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors';

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, color = '#3b82f6' }: { on: boolean; onToggle: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ backgroundColor: on ? color : '#374151' }}
      className="relative w-10 h-5 rounded-full transition-colors shrink-0"
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Deploy Modal ─────────────────────────────────────────────────────────────

type DeployStep = 'select' | 'form' | 'token';
type DeployMode = 'local' | 'enterprise';

function DeployModal({
  onClose,
  initialMode,
  initialClientName,
}: {
  onClose: () => void;
  initialMode?: DeployMode;
  initialClientName?: string;
}) {
  const [step, setStep] = useState<DeployStep>(initialMode ? 'form' : 'select');
  const [mode, setMode] = useState<DeployMode>(initialMode ?? 'local');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Local fields
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('');

  // Enterprise fields
  const [nodeName, setNodeName] = useState('');
  const [clientName, setClientName] = useState(initialClientName ?? '');
  const [role, setRole] = useState('general');
  const [fsRoot, setFsRoot] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    if (step === 'form' && mode === 'local') {
      getAgents().then(setAgents).catch(() => {});
    }
  }, [step, mode]);

  useEffect(() => {
    if (clientName && !fsRoot) {
      setFsRoot(`/opt/${clientName.toLowerCase().replace(/\s+/g, '-')}/`);
    }
  }, [clientName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    setError('');
    if (mode === 'local' && !selectedAgent) {
      setError('Please select an agent');
      return;
    }
    if (mode === 'enterprise' && (!nodeName.trim() || !clientName.trim())) {
      setError('Node name and client name are required');
      return;
    }
    setLoading(true);
    try {
      let result: { token: string };
      if (mode === 'local') {
        result = await deployLocal({
          agentId: selectedAgent,
          ollamaEndpoint: ollamaEnabled ? ollamaEndpoint : undefined,
        });
      } else {
        result = await deployEnterprise({
          name: nodeName.trim(),
          clientName: clientName.trim(),
          role,
          filesystemRoot: fsRoot,
          offlineMode,
        });
      }
      setToken(result.token);
      setStep('token');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cliInstructions = `npm install -g @vutler/nexus\nvutler-nexus init ${token || '<token>'}\nvutler-nexus start`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Deploy New Nexus</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none" aria-label="Close">×</button>
        </div>

        {/* Step 1 – Mode */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-[#9ca3af] text-sm">Choose a deployment type to get started.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  m: 'local' as DeployMode,
                  icon: '💻',
                  label: 'Clone Agent',
                  badge: 'Local',
                  desc: 'Run an existing agent on your local machine. Shared memory and personality.',
                  badgeCls: MODE_BADGE.local,
                  borderHover: 'hover:border-blue-500/50',
                  bgHover: 'hover:bg-blue-900/5',
                  textHover: 'group-hover:text-blue-400',
                },
                {
                  m: 'enterprise' as DeployMode,
                  icon: '🏢',
                  label: 'Enterprise Node',
                  badge: 'Enterprise',
                  desc: 'Deploy a new agent at a client site. Own memory, filesystem access.',
                  badgeCls: MODE_BADGE.enterprise,
                  borderHover: 'hover:border-emerald-500/50',
                  bgHover: 'hover:bg-emerald-900/5',
                  textHover: 'group-hover:text-emerald-400',
                },
              ] as const).map(({ m, icon, label, badge, desc, badgeCls, borderHover, bgHover, textHover }) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setStep('form'); }}
                  className={`flex flex-col items-start gap-2 p-4 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] ${borderHover} ${bgHover} rounded-xl text-left transition-all group`}
                >
                  <span className="text-2xl">{icon}</span>
                  <p className={`text-white font-semibold text-sm transition-colors ${textHover}`}>{label}</p>
                  <p className="text-[#6b7280] text-xs">{desc}</p>
                  <span className={`mt-1 text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 – Form */}
        {step === 'form' && (
          <div className="space-y-4">
            {!initialMode && (
              <button onClick={() => setStep('select')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            )}

            {mode === 'local' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Agent</label>
                  <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} className={inputCls}>
                    <option value="">Select an agent…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#9ca3af]">LLM Fallback (Ollama)</span>
                  <Toggle on={ollamaEnabled} onToggle={() => setOllamaEnabled(!ollamaEnabled)} />
                </div>
                {ollamaEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Ollama Endpoint</label>
                    <input
                      type="text"
                      value={ollamaEndpoint}
                      onChange={(e) => setOllamaEndpoint(e.target.value)}
                      placeholder="http://localhost:11434"
                      className={inputCls}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Node Name</label>
                    <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="e.g. Studio Paris" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Client Name</label>
                    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Corp" className={inputCls} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                    {['av-technician', 'engineer', 'support', 'general'].map((r) => (
                      <option key={r} value={r}>{r.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Filesystem Root</label>
                  <input type="text" value={fsRoot} onChange={(e) => setFsRoot(e.target.value)} placeholder="/opt/client/" className={inputCls} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#9ca3af]">Offline Mode</span>
                  <Toggle on={offlineMode} onToggle={() => setOfflineMode(!offlineMode)} color="#10b981" />
                </div>
              </>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{ backgroundColor: mode === 'local' ? '#3b82f6' : '#10b981' }}
              className="w-full py-2.5 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Generating…' : 'Generate Token'}
            </button>
          </div>
        )}

        {/* Step 3 – Token */}
        {step === 'token' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Token</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-emerald-400 text-xs font-mono truncate">
                  {token}
                </code>
                <button
                  onClick={() => copyText(token)}
                  className="shrink-0 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">CLI Instructions</label>
                <button
                  onClick={() => copyText(cliInstructions)}
                  className="text-xs text-[#6b7280] hover:text-white transition-colors"
                >
                  Copy all
                </button>
              </div>
              <pre className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-3 text-[#9ca3af] text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {cliInstructions}
              </pre>
            </div>
            <p className="text-xs text-amber-400">⚠ Token expires in 7 days. Store it securely.</p>
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

// ─── Client Form Modal ────────────────────────────────────────────────────────

function ClientFormModal({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client?.name ?? '');
  const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Client name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: CreateClientPayload = {
        name: name.trim(),
        contactEmail: contactEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (client) {
        await updateClient(client.id, payload);
      } else {
        await createClient(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Company Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@acme.com"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  label,
  onClose,
  onConfirm,
}: {
  label: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <h2 className="text-white font-semibold text-lg">Delete Client</h2>
        <p className="text-[#9ca3af] text-sm">
          Are you sure you want to delete <span className="text-white font-medium">{label}</span>? This action cannot be undone.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: NexusNode }) {
  const m = node.mode ?? 'standard';
  return (
    <Link
      href={`/nexus/${node.id}`}
      className={`group flex flex-col bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 hover:border-[rgba(255,255,255,0.14)] transition-all duration-200 ${STATUS_RING[node.status]}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-[#6b7280] capitalize">{node.status}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${MODE_BADGE[m] ?? MODE_BADGE.standard}`}>{m}</span>
      </div>
      <p className="text-white font-semibold text-base leading-snug mb-0.5 group-hover:text-[#3b82f6] transition-colors">
        {node.name}
      </p>
      {node.clientName && <p className="text-xs text-[#6b7280] mb-1">{node.clientName}</p>}
      <div className="mt-auto pt-4 space-y-1 text-xs text-[#6b7280]">
        <p>{node.agentCount === 0 ? 'No agents' : `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`}</p>
        <p>Last: {relativeTime(node.lastHeartbeat)}</p>
      </div>
      <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
        <span className="text-xs text-[#3b82f6] group-hover:underline">Manage →</span>
      </div>
    </Link>
  );
}

function NodeSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-44 animate-pulse" />
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: NexusStats }) {
  const items = [
    { label: 'nodes', value: stats.total, color: 'text-white' },
    { label: 'online', value: stats.online, color: 'text-emerald-400' },
    { label: `agent${stats.agents !== 1 ? 's' : ''}`, value: stats.agents, color: 'text-white' },
    { label: 'tasks done', value: stats.tasksCompleted.toLocaleString(), color: 'text-white' },
  ];
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#9ca3af]">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-x-6">
          {i > 0 && <span className="hidden sm:block text-[rgba(255,255,255,0.12)] mr-[-1rem]">•</span>}
          <span>
            <span className={`font-medium ${item.color}`}>{item.value}</span>{' '}{item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── My Nodes Tab ─────────────────────────────────────────────────────────────

function MyNodesTab({
  nodes,
  stats,
  loading,
  error,
  onRetry,
  onDeploy,
}: {
  nodes: NexusNode[];
  stats: NexusStats | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onDeploy: () => void;
}) {
  const localNodes = nodes.filter((n) => n.mode !== 'enterprise');

  return (
    <div className="space-y-6">
      {/* Stats */}
      {!loading && stats && <StatsBar stats={stats} />}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <span>{error}</span>
          <button onClick={onRetry} className="ml-auto text-red-300 hover:text-white underline text-xs">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <NodeSkeleton key={i} />)}
        </div>
      )}

      {/* Empty */}
      {!loading && localNodes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">
            🖥️
          </div>
          <p className="text-white font-semibold text-lg">No local nodes deployed yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">Deploy your first local Nexus node to run agents on your machine.</p>
          <button
            onClick={onDeploy}
            className="mt-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Deploy Local
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && localNodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {localNodes.map((node) => <NodeCard key={node.id} node={node} />)}
        </div>
      )}
    </div>
  );
}

// ─── Client Card ──────────────────────────────────────────────────────────────

function ClientCard({
  client,
  enterpriseNodes,
  onEdit,
  onDelete,
  onDeploy,
}: {
  client: Client;
  enterpriseNodes: NexusNode[];
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  onDeploy: (clientName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clientNodes = enterpriseNodes.filter(
    (n) => n.clientName?.toLowerCase() === client.name.toLowerCase()
  );
  const onlineCount = clientNodes.filter((n) => n.status === 'online').length;

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl overflow-hidden transition-all duration-200 hover:border-[rgba(255,255,255,0.12)]">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-white font-semibold text-base truncate">{client.name}</h3>
            </div>
            {client.contactEmail && (
              <p className="text-xs text-[#6b7280] truncate">{client.contactEmail}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(client)}
              className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors text-xs"
              title="Edit"
            >
              ✎
            </button>
            <button
              onClick={() => onDelete(client)}
              className="p-1.5 text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs"
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-[#6b7280]">
          <span>
            <span className="text-white font-medium">{clientNodes.length}</span> node{clientNodes.length !== 1 ? 's' : ''}
          </span>
          {clientNodes.length > 0 && (
            <>
              <span className="text-[rgba(255,255,255,0.1)]">•</span>
              <span className="text-emerald-400 font-medium">{onlineCount} online</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onDeploy(client.name)}
            className="flex-1 py-1.5 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            + Deploy Node
          </button>
          {clientNodes.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 py-1.5 bg-[#0a0b14] hover:bg-[rgba(255,255,255,0.03)] text-[#9ca3af] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs font-medium transition-colors"
            >
              {expanded ? 'Hide Nodes ▲' : `View Nodes ▼`}
            </button>
          )}
        </div>
      </div>

      {/* Expanded nodes */}
      {expanded && clientNodes.length > 0 && (
        <div className="border-t border-[rgba(255,255,255,0.07)] bg-[#0e0f1a]">
          {clientNodes.map((node, idx) => (
            <Link
              key={node.id}
              href={`/nexus/${node.id}`}
              className={`flex items-center justify-between px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors group ${
                idx < clientNodes.length - 1 ? 'border-b border-[rgba(255,255,255,0.05)]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate group-hover:text-[#3b82f6] transition-colors">{node.name}</p>
                  <p className="text-xs text-[#6b7280]">
                    {node.agentCount === 0 ? 'No agents' : `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`} · {relativeTime(node.lastHeartbeat)}
                  </p>
                </div>
              </div>
              <span className="text-xs text-[#4b5563] group-hover:text-[#3b82f6] transition-colors shrink-0 ml-2">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-52 animate-pulse" />
  );
}

// ─── Enterprise Tab ───────────────────────────────────────────────────────────

function EnterpriseTab({
  clients,
  enterpriseNodes,
  loading,
  error,
  onRetry,
  onNewClient,
  onEditClient,
  onDeleteClient,
  onDeployEnterprise,
}: {
  clients: Client[];
  enterpriseNodes: NexusNode[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNewClient: () => void;
  onEditClient: (c: Client) => void;
  onDeleteClient: (c: Client) => void;
  onDeployEnterprise: (clientName?: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#6b7280]">
          {clients.length > 0
            ? `${clients.length} client${clients.length !== 1 ? 's' : ''} · ${enterpriseNodes.length} node${enterpriseNodes.length !== 1 ? 's' : ''} deployed`
            : 'Manage enterprise clients and their deployed nodes'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onNewClient}
            className="flex items-center gap-2 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Client
          </button>
          <button
            onClick={() => onDeployEnterprise()}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Enterprise Deployment
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <span>{error}</span>
          <button onClick={onRetry} className="ml-auto text-red-300 hover:text-white underline text-xs">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <ClientSkeleton key={i} />)}
        </div>
      )}

      {/* Empty */}
      {!loading && clients.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">
            🏢
          </div>
          <p className="text-white font-semibold text-lg">No enterprise clients yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">Add your first client to start deploying Nexus nodes to enterprise sites.</p>
          <button
            onClick={onNewClient}
            className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Client
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              enterpriseNodes={enterpriseNodes}
              onEdit={onEditClient}
              onDelete={onDeleteClient}
              onDeploy={(clientName) => onDeployEnterprise(clientName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'my-nodes' | 'enterprise';

export default function NexusPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-nodes');

  // Nodes state
  const [nodes, setNodes] = useState<NexusNode[]>([]);
  const [stats, setStats] = useState<NexusStats | null>(null);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodesError, setNodesError] = useState('');

  // Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');

  // Modals
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployMode, setDeployMode] = useState<'local' | 'enterprise' | undefined>(undefined);
  const [deployClientName, setDeployClientName] = useState<string | undefined>(undefined);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
  const [deletingClient, setDeletingClient] = useState<Client | undefined>(undefined);

  const fetchNodes = useCallback(async () => {
    setNodesLoading(true);
    setNodesError('');
    try {
      const data = await getNodes();
      setNodes(data.nodes ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      setNodesError(err instanceof Error ? err.message : 'Failed to load Nexus data. Please refresh.');
      setNodes([]);
    } finally {
      setNodesLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError('');
    try {
      const data = await getClients();
      setClients(data);
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Failed to load clients. Please refresh.');
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Lazy-load clients when enterprise tab is first visited
  useEffect(() => {
    if (activeTab === 'enterprise' && clients.length === 0 && !clientsLoading) {
      fetchClients();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterpriseNodes = nodes.filter((n) => n.mode === 'enterprise');

  const openDeployLocal = () => {
    setDeployMode('local');
    setDeployClientName(undefined);
    setDeployOpen(true);
  };

  const openDeployEnterprise = (clientName?: string) => {
    setDeployMode('enterprise');
    setDeployClientName(clientName);
    setDeployOpen(true);
  };

  const handleDeployClose = () => {
    setDeployOpen(false);
    setDeployMode(undefined);
    setDeployClientName(undefined);
    fetchNodes();
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setClientFormOpen(true);
  };

  const handleDeleteClient = (client: Client) => {
    setDeletingClient(client);
  };

  const handleClientSaved = () => {
    setClientFormOpen(false);
    setEditingClient(undefined);
    fetchClients();
  };

  const handleClientDeleted = async () => {
    if (!deletingClient) return;
    await deleteClient(deletingClient.id);
    setDeletingClient(undefined);
    fetchClients();
  };

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'my-nodes', label: 'My Nodes' },
    { id: 'enterprise', label: 'Enterprise' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Nexus</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage distributed agent deployments</p>
        </div>
        {activeTab === 'my-nodes' && (
          <button
            onClick={openDeployLocal}
            className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <span className="text-base leading-none">+</span> Deploy Local
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[rgba(255,255,255,0.07)] pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-[#6b7280] hover:text-[#9ca3af]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3b82f6] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'my-nodes' && (
        <MyNodesTab
          nodes={nodes}
          stats={stats}
          loading={nodesLoading}
          error={nodesError}
          onRetry={fetchNodes}
          onDeploy={openDeployLocal}
        />
      )}

      {activeTab === 'enterprise' && (
        <EnterpriseTab
          clients={clients}
          enterpriseNodes={enterpriseNodes}
          loading={clientsLoading || nodesLoading}
          error={clientsError || nodesError}
          onRetry={() => { fetchClients(); fetchNodes(); }}
          onNewClient={() => { setEditingClient(undefined); setClientFormOpen(true); }}
          onEditClient={handleEditClient}
          onDeleteClient={handleDeleteClient}
          onDeployEnterprise={openDeployEnterprise}
        />
      )}

      {/* Deploy modal */}
      {deployOpen && (
        <DeployModal
          initialMode={deployMode}
          initialClientName={deployClientName}
          onClose={handleDeployClose}
        />
      )}

      {/* Client form modal */}
      {clientFormOpen && (
        <ClientFormModal
          client={editingClient}
          onClose={() => { setClientFormOpen(false); setEditingClient(undefined); }}
          onSaved={handleClientSaved}
        />
      )}

      {/* Delete confirm */}
      {deletingClient && (
        <DeleteConfirmModal
          label={deletingClient.name}
          onClose={() => setDeletingClient(undefined)}
          onConfirm={handleClientDeleted}
        />
      )}
    </div>
  );
}
