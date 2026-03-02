'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

interface NexusStatus {
  registered: boolean;
  syncState?: 'cloud' | 'local' | 'hybrid';
  lastSync?: string;
  connectedAgents?: number;
}

export default function NexusPage() {
  const [status, setStatus] = useState<NexusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/nexus/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({ registered: false });
      }
    } catch {
      setStatus({ registered: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/nexus/register', { method: 'POST' });
      if (!res.ok) throw new Error('Registration failed');
      await fetchStatus();
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/v1/nexus/local-token', { method: 'POST' });
      if (!res.ok) throw new Error('Token generation failed');
      const data = await res.json();
      setToken(data.token || data.localToken || '');
    } catch (e: any) {
      setError(e.message || 'Token generation failed');
    } finally {
      setTokenLoading(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const syncIcon = (state?: string) => {
    switch (state) {
      case 'cloud': return '☁️';
      case 'local': return '💻';
      case 'hybrid': return '☁️💻';
      default: return '—';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280] animate-pulse font-mono">Loading Nexus status...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Nexus</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Manage your Nexus hub — sync, pairing, and local installation.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Status Card */}
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Nexus Status</h2>
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${status?.registered ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'}`}>
            <span className={`w-2 h-2 rounded-full ${status?.registered ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {status?.registered ? 'Registered' : 'Not Registered'}
          </span>
        </div>

        {status?.registered ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#0a0b14] rounded-lg p-4">
              <div className="text-xs text-[#6b7280] uppercase tracking-wider mb-1">Sync State</div>
              <div className="text-lg text-white font-mono">{syncIcon(status.syncState)} {status.syncState || 'N/A'}</div>
            </div>
            <div className="bg-[#0a0b14] rounded-lg p-4">
              <div className="text-xs text-[#6b7280] uppercase tracking-wider mb-1">Last Sync</div>
              <div className="text-lg text-white font-mono">{status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}</div>
            </div>
            <div className="bg-[#0a0b14] rounded-lg p-4">
              <div className="text-xs text-[#6b7280] uppercase tracking-wider mb-1">Connected Agents</div>
              <div className="text-lg text-white font-mono">{status.connectedAgents ?? 0}</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-[#9ca3af] mb-4">Your Nexus is not registered yet. Register to enable hybrid sync and local deployments.</p>
            <button
              onClick={handleRegister}
              disabled={registering}
              className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              {registering ? 'Registering...' : 'Register Nexus'}
            </button>
          </div>
        )}
      </div>

      {/* Pairing Token */}
      {status?.registered && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Pairing Token</h2>
          <p className="text-sm text-[#9ca3af] mb-4">Generate a token to pair a local Nexus instance with your cloud workspace.</p>

          {!token ? (
            <button
              onClick={handleGenerateToken}
              disabled={tokenLoading}
              className="px-5 py-2 bg-[#1e293b] hover:bg-[#334155] text-white border border-[rgba(255,255,255,0.1)] rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              {tokenLoading ? 'Generating...' : 'Generate Pairing Token'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0a0b14] text-emerald-400 px-4 py-2.5 rounded-lg font-mono text-sm break-all">{token}</code>
                <button
                  onClick={copyToken}
                  className="px-4 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <button
                onClick={() => setShowInstall(!showInstall)}
                className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors cursor-pointer"
              >
                {showInstall ? 'Hide' : 'Show'} installation instructions
              </button>
            </div>
          )}

          {showInstall && (
            <div className="mt-4 bg-[#0a0b14] rounded-lg p-4 space-y-3 border border-[rgba(255,255,255,0.05)]">
              <h3 className="text-sm font-semibold text-white">Installation</h3>
              <div className="space-y-2">
                <p className="text-xs text-[#9ca3af]">1. Install the Nexus package:</p>
                <code className="block bg-[#14151f] text-[#67e8f9] px-3 py-2 rounded text-sm font-mono">npm install @vutler/nexus</code>
                <p className="text-xs text-[#9ca3af]">2. Initialize with your pairing token:</p>
                <code className="block bg-[#14151f] text-[#67e8f9] px-3 py-2 rounded text-sm font-mono">npx vutler-nexus init --token YOUR_TOKEN</code>
                <p className="text-xs text-[#9ca3af]">3. Start the local Nexus:</p>
                <code className="block bg-[#14151f] text-[#67e8f9] px-3 py-2 rounded text-sm font-mono">npx vutler-nexus start</code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
