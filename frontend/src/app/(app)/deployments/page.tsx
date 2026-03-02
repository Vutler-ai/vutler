'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

interface Deployment {
  id: string;
  agentId: string;
  agentName: string;
  clientCompany: string;
  status: 'online' | 'offline' | 'error' | 'syncing';
  lastHeartbeat?: string;
  tunnelUrl?: string;
  environment?: string;
  llmRouting?: string;
}

interface Agent {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  online: { color: '#22c55e', bg: 'bg-emerald-500/10', label: 'Online' },
  offline: { color: '#64748b', bg: 'bg-slate-500/10', label: 'Offline' },
  error: { color: '#ef4444', bg: 'bg-red-500/10', label: 'Error' },
  syncing: { color: '#3b82f6', bg: 'bg-blue-500/10', label: 'Syncing' },
};

/* ─── Deploy Wizard ─── */
function DeployWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [company, setCompany] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [env, setEnv] = useState<'local' | 'docker'>('docker');
  const [routing, setRouting] = useState<'cloud' | 'local'>('cloud');
  const [deploying, setDeploying] = useState(false);
  const [tunnelToken, setTunnelToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    authFetch('/api/v1/agents').then(r => r.json()).then(d => setAgents(d.agents || d || [])).catch(() => {});
  }, []);

  const handleDeploy = async () => {
    setDeploying(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/deployments', {
        method: 'POST',
        body: JSON.stringify({
          agentId: selectedAgent?.id,
          clientCompany: newCompany || company,
          environment: env,
          llmRouting: routing,
        }),
      });
      if (!res.ok) throw new Error('Deployment failed');
      const data = await res.json();
      setTunnelToken(data.tunnelToken || data.token || 'tok_' + Math.random().toString(36).slice(2, 14));
      setStep(5);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  };

  const copyTunnelToken = () => {
    navigator.clipboard.writeText(tunnelToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <h2 className="text-lg font-semibold text-white">Deploy Agent</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors cursor-pointer text-xl">✕</button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 pt-4">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${step >= s ? 'bg-[#3b82f6]' : 'bg-[#1e293b]'}`} />
          ))}
        </div>

        <div className="p-6">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

          {/* Step 1: Select Agent */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#9ca3af]">Step 1: Select an agent to deploy</h3>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer ${selectedAgent?.id === a.id ? 'bg-[#3b82f6]/20 border-[#3b82f6] border' : 'bg-[#0a0b14] border border-transparent hover:border-[rgba(255,255,255,0.1)]'}`}
                  >
                    <span className="text-sm text-white font-medium">{a.name}</span>
                  </button>
                ))}
                {agents.length === 0 && <p className="text-sm text-[#6b7280]">No agents found.</p>}
              </div>
              <div className="flex justify-end">
                <button onClick={() => selectedAgent && setStep(2)} disabled={!selectedAgent} className="px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm disabled:opacity-40 cursor-pointer">Next</button>
              </div>
            </div>
          )}

          {/* Step 2: Client Company */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#9ca3af]">Step 2: Select or create a client company</h3>
              <input
                type="text"
                value={company}
                onChange={e => { setCompany(e.target.value); setNewCompany(''); }}
                placeholder="Existing company name"
                className="w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]"
              />
              <div className="text-xs text-[#6b7280] text-center">— or create new —</div>
              <input
                type="text"
                value={newCompany}
                onChange={e => { setNewCompany(e.target.value); setCompany(''); }}
                placeholder="New company name"
                className="w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]"
              />
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-5 py-2 text-[#9ca3af] hover:text-white transition-colors cursor-pointer text-sm">Back</button>
                <button onClick={() => (company || newCompany) && setStep(3)} disabled={!company && !newCompany} className="px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm disabled:opacity-40 cursor-pointer">Next</button>
              </div>
            </div>
          )}

          {/* Step 3: Configure */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#9ca3af]">Step 3: Configure deployment</h3>
              <div>
                <label className="text-xs text-[#6b7280] uppercase tracking-wider mb-2 block">Environment</label>
                <div className="flex gap-3">
                  {(['local', 'docker'] as const).map(e => (
                    <button key={e} onClick={() => setEnv(e)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${env === e ? 'bg-[#3b82f6] text-white' : 'bg-[#0a0b14] text-[#9ca3af] border border-[rgba(255,255,255,0.1)] hover:text-white'}`}>{e === 'local' ? '💻 Local' : '🐳 Docker'}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6b7280] uppercase tracking-wider mb-2 block">LLM Routing</label>
                <div className="flex gap-3">
                  {(['cloud', 'local'] as const).map(r => (
                    <button key={r} onClick={() => setRouting(r)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${routing === r ? 'bg-[#3b82f6] text-white' : 'bg-[#0a0b14] text-[#9ca3af] border border-[rgba(255,255,255,0.1)] hover:text-white'}`}>{r === 'cloud' ? '☁️ Cloud' : '💻 Local'}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="px-5 py-2 text-[#9ca3af] hover:text-white transition-colors cursor-pointer text-sm">Back</button>
                <button onClick={() => setStep(4)} className="px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm cursor-pointer">Next</button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Deploy */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-[#9ca3af]">Step 4: Review & Deploy</h3>
              <div className="bg-[#0a0b14] rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-[#6b7280]">Agent</span><span className="text-white">{selectedAgent?.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b7280]">Company</span><span className="text-white">{newCompany || company}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b7280]">Environment</span><span className="text-white">{env}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#6b7280]">LLM Routing</span><span className="text-white">{routing}</span></div>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="px-5 py-2 text-[#9ca3af] hover:text-white transition-colors cursor-pointer text-sm">Back</button>
                <button onClick={handleDeploy} disabled={deploying} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50 cursor-pointer">{deploying ? 'Deploying...' : '🚀 Deploy'}</button>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">🎉</div>
              <h3 className="text-lg font-semibold text-white">Deployment Created!</h3>
              <p className="text-sm text-[#9ca3af]">Your tunnel token:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] text-emerald-400 px-4 py-2.5 rounded-lg font-mono text-sm break-all">{tunnelToken}</code>
                <button onClick={copyTunnelToken} className="px-4 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm cursor-pointer">{copied ? '✓' : 'Copy'}</button>
              </div>
              <button onClick={() => { onDone(); onClose(); }} className="px-6 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm cursor-pointer">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Deployment Detail ─── */
function DeploymentDetail({ deployment, onClose, onKill }: { deployment: Deployment; onClose: () => void; onKill: (id: string) => void }) {
  const [statusData, setStatusData] = useState<any>(null);

  useEffect(() => {
    authFetch(`/api/v1/deployments/${deployment.id}/status`)
      .then(r => r.json())
      .then(setStatusData)
      .catch(() => {});
  }, [deployment.id]);

  const sc = STATUS_CONFIG[deployment.status] || STATUS_CONFIG.offline;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <h2 className="text-lg font-semibold text-white">{deployment.agentName}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white cursor-pointer text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Status</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sc.color }} />
                <span className="text-sm text-white capitalize">{deployment.status}</span>
              </div>
            </div>
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Client</div>
              <div className="text-sm text-white">{deployment.clientCompany}</div>
            </div>
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Environment</div>
              <div className="text-sm text-white">{deployment.environment || 'docker'}</div>
            </div>
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Last Heartbeat</div>
              <div className="text-sm text-white">{deployment.lastHeartbeat ? new Date(deployment.lastHeartbeat).toLocaleString() : '—'}</div>
            </div>
          </div>
          {deployment.tunnelUrl && (
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Tunnel URL</div>
              <code className="text-sm text-[#67e8f9] font-mono break-all">{deployment.tunnelUrl}</code>
            </div>
          )}
          {statusData?.logs && (
            <div className="bg-[#0a0b14] rounded-lg p-3">
              <div className="text-xs text-[#6b7280] uppercase mb-1">Recent Logs</div>
              <pre className="text-xs text-[#9ca3af] font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">{statusData.logs}</pre>
            </div>
          )}
          <button
            onClick={() => onKill(deployment.id)}
            className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            ⛔ Kill Deployment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedDep, setSelectedDep] = useState<Deployment | null>(null);
  const [killConfirm, setKillConfirm] = useState<string | null>(null);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/deployments');
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments || data || []);
      }
    } catch {
      setError('Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeployments(); }, [fetchDeployments]);

  const handleKill = async (id: string) => {
    if (killConfirm !== id) {
      setKillConfirm(id);
      return;
    }
    try {
      await authFetch(`/api/v1/deployments/${id}`, { method: 'DELETE' });
      setDeployments(prev => prev.filter(d => d.id !== id));
      setSelectedDep(null);
      setKillConfirm(null);
    } catch {
      setError('Failed to kill deployment');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] animate-pulse font-mono">Loading deployments...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Deployments</h1>
          <p className="text-sm text-[#9ca3af] mt-1">Manage agent deployments across client companies.</p>
        </div>
        <button onClick={() => setShowWizard(true)} className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg font-medium text-sm transition-colors cursor-pointer">+ Deploy Agent</button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
        {deployments.length === 0 ? (
          <div className="text-center py-16 text-[#6b7280]">
            <p className="text-lg mb-2">No deployments yet</p>
            <p className="text-sm">Click &quot;Deploy Agent&quot; to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Agent</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Last Heartbeat</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map(dep => {
                  const sc = STATUS_CONFIG[dep.status] || STATUS_CONFIG.offline;
                  return (
                    <tr key={dep.id} onClick={() => setSelectedDep(dep)} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-medium">{dep.agentName}</td>
                      <td className="px-6 py-4 text-sm text-[#9ca3af]">{dep.clientCompany}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg}`} style={{ color: sc.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.color }} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6b7280] font-mono">{dep.lastHeartbeat ? new Date(dep.lastHeartbeat).toLocaleString() : '—'}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); handleKill(dep.id); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${killConfirm === dep.id ? 'bg-red-600 text-white' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'}`}
                        >
                          {killConfirm === dep.id ? 'Confirm Kill' : 'Kill'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showWizard && <DeployWizard onClose={() => setShowWizard(false)} onDone={fetchDeployments} />}
      {selectedDep && <DeploymentDetail deployment={selectedDep} onClose={() => { setSelectedDep(null); setKillConfirm(null); }} onKill={handleKill} />}
    </div>
  );
}
