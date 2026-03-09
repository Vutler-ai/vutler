'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

interface NexusStatus {
  success?: boolean;
  registered: boolean;
  syncState?: 'cloud' | 'local' | 'hybrid';
  lastSync?: string;
  connectedAgents?: number;
  deploymentsTotal?: number;
  connected?: boolean;
}

interface Deployment {
  id: string;
  agentId: string;
  agentName: string;
  mode: 'local' | 'docker';
  status: 'planned' | 'online' | 'offline' | 'error';
  lastHeartbeat?: string;
  clientCompany?: string;
}

const STATUS_BADGE: Record<string, string> = {
  planned: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  online: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  offline: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export default function NexusPage() {
  const [status, setStatus] = useState<NexusStatus | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, depRes] = await Promise.all([
        authFetch('/api/v1/nexus/status'),
        authFetch('/api/v1/deployments'),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      } else {
        setStatus({ registered: false });
      }

      if (depRes.ok) {
        const depData = await depRes.json();
        setDeployments(depData.deployments || []);
      } else {
        setDeployments([]);
      }
    } catch {
      setError('Failed to load Nexus dashboard data');
      setStatus({ registered: false });
      setDeployments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return <div className="text-[#6b7280] animate-pulse font-mono">Loading Nexus dashboard...</div>;
  }

  const online = deployments.filter((d) => d.status === 'online').length;
  const unhealthy = deployments.filter((d) => d.status === 'error').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nexus Dashboard</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Real runtime heartbeat and deployment verification.</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#14151f] rounded-xl border border-[rgba(255,255,255,0.07)] p-4">
          <div className="text-xs text-[#6b7280] uppercase mb-1">Nexus</div>
          <div className="text-white font-semibold">{status?.connected ? 'Connected' : 'Not connected'}</div>
        </div>
        <div className="bg-[#14151f] rounded-xl border border-[rgba(255,255,255,0.07)] p-4">
          <div className="text-xs text-[#6b7280] uppercase mb-1">Sync State</div>
          <div className="text-white font-semibold">{status?.syncState || 'N/A'}</div>
        </div>
        <div className="bg-[#14151f] rounded-xl border border-[rgba(255,255,255,0.07)] p-4">
          <div className="text-xs text-[#6b7280] uppercase mb-1">Deployments Online</div>
          <div className="text-white font-semibold">{online} / {deployments.length}</div>
        </div>
        <div className="bg-[#14151f] rounded-xl border border-[rgba(255,255,255,0.07)] p-4">
          <div className="text-xs text-[#6b7280] uppercase mb-1">Runtime Alerts</div>
          <div className="text-white font-semibold">{unhealthy}</div>
        </div>
      </div>

      <div className="bg-[#14151f] rounded-xl border border-[rgba(255,255,255,0.07)] p-4">
        <h2 className="text-white font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={fetchAll} className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm">Deploy from Dashboard</button>
          <button onClick={fetchAll} className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm">Refresh Status</button>
          <Link href="/sandbox" className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm">Open Global Sandbox</Link>
        </div>
      </div>

      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between">
          <h2 className="text-white font-semibold">Deployments</h2>
          <span className="text-xs text-[#6b7280]">Status driven by heartbeat verify</span>
        </div>

        {deployments.length === 0 ? (
          <div className="p-10 text-center text-[#6b7280] text-sm">No deployments yet. Use Setup Wizard to create your first deployment.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  <th className="text-left px-6 py-3 text-xs text-[#6b7280] uppercase">Agent</th>
                  <th className="text-left px-6 py-3 text-xs text-[#6b7280] uppercase">Mode</th>
                  <th className="text-left px-6 py-3 text-xs text-[#6b7280] uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs text-[#6b7280] uppercase">Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} className="border-b border-[rgba(255,255,255,0.04)]">
                    <td className="px-6 py-3 text-sm text-white">{d.agentName || d.agentId}</td>
                    <td className="px-6 py-3 text-sm text-[#9ca3af]">{d.mode}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full border text-xs ${STATUS_BADGE[d.status] || STATUS_BADGE.offline}`}>{d.status}</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-[#9ca3af]">{d.lastHeartbeat ? new Date(d.lastHeartbeat).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
