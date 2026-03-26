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
  mode?: 'local' | 'enterprise' | 'standard';
  clientName?: string;
}
interface NexusStats { total: number; online: number; agents: number; tasksCompleted: number; }
interface NexusStatusResponse { nodes: NexusNode[]; stats: NexusStats; }
interface Agent { id: string; name: string; }
type DeployMode = 'local' | 'enterprise';
type Step = 'select' | 'form' | 'token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_DOT: Record<NexusNode['status'], string> = { online: 'bg-[#10b981]', warning: 'bg-[#f59e0b]', offline: 'bg-[#6b7280]' };
const STATUS_RING: Record<NexusNode['status'], string> = { online: 'shadow-[0_0_0_3px_rgba(16,185,129,0.15)]', warning: 'shadow-[0_0_0_3px_rgba(245,158,11,0.15)]', offline: '' };
const MODE_BADGE = { local: 'bg-[#1d4ed8]/20 text-[#3b82f6] border border-[#3b82f6]/30', enterprise: 'bg-[#065f46]/20 text-[#10b981] border border-[#10b981]/30', standard: 'bg-[#374151]/40 text-[#9ca3af] border border-[rgba(255,255,255,0.1)]' };
const inputCls = 'w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors';

function Toggle({ on, onToggle, color = '#3b82f6' }: { on: boolean; onToggle: () => void; color?: string }) {
  return (
    <button onClick={onToggle} style={{ backgroundColor: on ? color : '#374151' }} className="relative w-10 h-5 rounded-full transition-colors">
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Deploy Modal ─────────────────────────────────────────────────────────────

function DeployModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('select');
  const [mode, setMode] = useState<DeployMode>('local');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  // Local
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('');
  // Enterprise
  const [nodeName, setNodeName] = useState('');
  const [clientName, setClientName] = useState('');
  const [role, setRole] = useState('general');
  const [fsRoot, setFsRoot] = useState('');
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    if (step === 'form' && mode === 'local')
      authFetch('/api/v1/agents').then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : (d.agents ?? []))).catch(() => {});
  }, [step, mode]);

  useEffect(() => {
    if (clientName && !fsRoot) setFsRoot(`/opt/${clientName.toLowerCase().replace(/\s+/g, '-')}/`);
  }, [clientName]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    setError('');
    if (mode === 'local' && !selectedAgent) { setError('Please select an agent'); return; }
    if (mode === 'enterprise' && (!nodeName.trim() || !clientName.trim())) { setError('Node name and client name are required'); return; }
    setLoading(true);
    try {
      const res = await authFetch(mode === 'local' ? '/api/v1/nexus/tokens/local' : '/api/v1/nexus/tokens/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'local'
          ? { agentId: selectedAgent, ollamaEndpoint: ollamaEnabled ? ollamaEndpoint : undefined }
          : { name: nodeName.trim(), clientName: clientName.trim(), role, filesystemRoot: fsRoot, offlineMode }),
      });
      if (!res.ok) throw new Error();
      setToken((await res.json()).token);
      setStep('token');
    } catch { setError('Could not generate token. Please try again.'); }
    finally { setLoading(false); }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const cliInstructions = `npm install -g @vutler/nexus\nvutler-nexus init ${token || '<token>'}\nvutler-nexus start`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Deploy New Nexus</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-xl leading-none" aria-label="Close">×</button>
        </div>

        {/* Step 1 – Mode selection */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-[#9ca3af] text-sm">Choose a deployment type to get started.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { m: 'local' as DeployMode, icon: '💻', label: 'Clone Agent', badge: 'Local', desc: 'Run an existing agent on your local machine. Shared memory and personality.', accent: '#3b82f6', badgeCls: MODE_BADGE.local, hoverBorder: 'hover:border-[#3b82f6]/50', hoverBg: 'hover:bg-[#1d4ed8]/5', hoverText: 'group-hover:text-[#3b82f6]' },
                { m: 'enterprise' as DeployMode, icon: '🏢', label: 'Enterprise Node', badge: 'Enterprise', desc: 'Deploy a new agent at a client site. Own memory, filesystem access.', accent: '#10b981', badgeCls: MODE_BADGE.enterprise, hoverBorder: 'hover:border-[#10b981]/50', hoverBg: 'hover:bg-[#065f46]/5', hoverText: 'group-hover:text-[#10b981]' },
              ] as const).map(({ m, icon, label, badge, desc, badgeCls, hoverBorder, hoverBg, hoverText }) => (
                <button key={m} onClick={() => { setMode(m); setStep('form'); }} className={`flex flex-col items-start gap-2 p-4 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] ${hoverBorder} ${hoverBg} rounded-xl text-left transition-all group`}>
                  <span className="text-2xl">{icon}</span>
                  <p className={`text-white font-semibold text-sm transition-colors ${hoverText}`}>{label}</p>
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
            <button onClick={() => setStep('select')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>

            {mode === 'local' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Agent</label>
                  <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className={inputCls}>
                    <option value="">Select an agent…</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#9ca3af]">LLM Fallback (Ollama)</span>
                  <Toggle on={ollamaEnabled} onToggle={() => setOllamaEnabled(!ollamaEnabled)} />
                </div>
                {ollamaEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Ollama Endpoint</label>
                    <input type="text" value={ollamaEndpoint} onChange={e => setOllamaEndpoint(e.target.value)} placeholder="http://localhost:11434" className={inputCls} />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[['Node Name', nodeName, setNodeName, 'e.g. Studio Paris'], ['Client Name', clientName, setClientName, 'e.g. Acme Corp']].map(([lbl, val, setter, ph]) => (
                    <div key={lbl as string} className="space-y-1.5">
                      <label className="text-xs text-[#9ca3af] uppercase tracking-wide">{lbl as string}</label>
                      <input type="text" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Role</label>
                  <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                    {['av-technician', 'engineer', 'support', 'general'].map(r => <option key={r} value={r}>{r.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Filesystem Root</label>
                  <input type="text" value={fsRoot} onChange={e => setFsRoot(e.target.value)} placeholder="/opt/client/" className={inputCls} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#9ca3af]">Offline Mode</span>
                  <Toggle on={offlineMode} onToggle={() => setOfflineMode(!offlineMode)} color="#10b981" />
                </div>
              </>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleGenerate} disabled={loading} style={{ backgroundColor: mode === 'local' ? '#3b82f6' : '#10b981' }} className="w-full py-2.5 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90">
              {loading ? 'Generating…' : 'Generate Token'}
            </button>
          </div>
        )}

        {/* Step 3 – Token display */}
        {step === 'token' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Token</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-[#10b981] text-xs font-mono truncate">{token}</code>
                <button onClick={() => copyText(token)} className="shrink-0 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors">{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">CLI Instructions</label>
              <pre className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-3 text-[#9ca3af] text-xs font-mono whitespace-pre-wrap leading-relaxed">{cliInstructions}</pre>
            </div>
            <p className="text-xs text-[#f59e0b]">⚠ Token expires in 7 days. Store it securely.</p>
            <button onClick={onClose} className="w-full py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: NexusNode }) {
  const m = node.mode ?? 'standard';
  return (
    <Link href={`/nexus/${node.id}`} className={`group flex flex-col bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 hover:border-[rgba(255,255,255,0.14)] transition-all duration-200 ${STATUS_RING[node.status]}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-[#6b7280] capitalize">{node.status}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${MODE_BADGE[m]}`}>{m}</span>
      </div>
      <p className="text-white font-semibold text-base leading-snug mb-0.5 group-hover:text-[#3b82f6] transition-colors">{node.name}</p>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NexusPage() {
  const [nodes, setNodes] = useState<NexusNode[]>([]);
  const [stats, setStats] = useState<NexusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deployOpen, setDeployOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await authFetch('/api/v1/nexus/status');
      if (!res.ok) throw new Error();
      const data: NexusStatusResponse = await res.json();
      setNodes(data.nodes ?? []); setStats(data.stats ?? null);
    } catch { setError('Failed to load Nexus data. Please refresh.'); setNodes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Nexus Nodes</h1>
        <button onClick={() => setDeployOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors shrink-0">
          <span className="text-base leading-none">+</span> Deploy New
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-44 animate-pulse" />)}
        </div>
      )}

      {!loading && nodes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">🖥️</div>
          <p className="text-white font-semibold text-lg">No Nexus nodes deployed yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">Deploy your first Nexus node to start managing AI agents at client sites.</p>
          <button onClick={() => setDeployOpen(true)} className="mt-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors">+ Deploy New</button>
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map(node => <NodeCard key={node.id} node={node} />)}
        </div>
      )}

      {!loading && stats && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#9ca3af]">
          <span className="font-medium text-white">{stats.total} node{stats.total !== 1 ? 's' : ''}</span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span><span className="text-[#10b981] font-medium">{stats.online}</span> online</span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span><span className="text-white font-medium">{stats.agents}</span> agent{stats.agents !== 1 ? 's' : ''}</span>
          <span className="hidden sm:block text-[rgba(255,255,255,0.15)]">•</span>
          <span><span className="text-white font-medium">{stats.tasksCompleted.toLocaleString()}</span> tasks done</span>
        </div>
      )}

      {deployOpen && <DeployModal onClose={() => { setDeployOpen(false); fetchData(); }} />}
    </div>
  );
}
