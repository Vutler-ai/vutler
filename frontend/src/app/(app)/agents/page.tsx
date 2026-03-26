'use client';

import { useState, useEffect, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';
import { getAuthToken } from '@/lib/api';
import PageHeader from '@/components/layout/page-header';
import AgentsTable from '@/components/agents-table';

interface ExecuteState {
  agentId: string;
  agentName: string;
  input: string;
  response: string;
  loading: boolean;
  usage: { input: number; output: number; total: number } | null;
  latency: number | null;
  model: string;
  provider: string;
  tab: 'execute' | 'history';
  history: any[];
  historyLoading: boolean;
  autoApproveEmail: boolean;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [exec, setExec] = useState<ExecuteState | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  const fetchAgents = () => {
    authFetch('/api/v1/agents')
      .then(r => r.json())
      .then(data => setAgents(data.agents || data || []))
      .catch(err => console.error('Failed to fetch agents:', err));
  };

  useEffect(() => { fetchAgents(); }, []);

  const openExecute = (agent: any) => {
    setExec({
      agentId: agent.id,
      agentName: agent.name,
      input: '',
      response: '',
      loading: false,
      usage: null,
      latency: null,
      model: agent.model || '',
      provider: agent.provider || '',
      tab: 'execute',
      history: [],
      historyLoading: false,
      autoApproveEmail: !!agent.autoApproveEmail,
    });
  };

  const fetchHistory = async (agentId: string) => {
    setExec(prev => prev ? { ...prev, historyLoading: true } : null);
    try {
      const res = await authFetch(`/api/v1/agents/${agentId}/executions`);
      const data = await res.json();
      setExec(prev => prev ? { ...prev, history: data.executions || [], historyLoading: false } : null);
    } catch {
      setExec(prev => prev ? { ...prev, historyLoading: false } : null);
    }
  };

  const runExecuteStream = async () => {
    if (!exec || !exec.input.trim()) return;
    setExec(prev => prev ? { ...prev, loading: true, response: '', usage: null, latency: null } : null);

    try {
      const token = getAuthToken();
      const url = `/api/v1/agents/${exec.agentId}/execute/stream?message=${encodeURIComponent(exec.input)}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta') {
              setExec(prev => prev ? { ...prev, response: prev.response + evt.text } : null);
              // Auto-scroll
              if (responseRef.current) {
                responseRef.current.scrollTop = responseRef.current.scrollHeight;
              }
            } else if (evt.type === 'done') {
              setExec(prev => prev ? {
                ...prev,
                loading: false,
                usage: evt.usage,
                latency: evt.latency_ms,
                model: evt.model || prev.model,
                provider: evt.provider || prev.provider,
              } : null);
            } else if (evt.type === 'error') {
              setExec(prev => prev ? { ...prev, loading: false, response: `Error: ${evt.error}` } : null);
            }
          } catch {}
        }
      }

      // If we exit loop without done event
      setExec(prev => prev && prev.loading ? { ...prev, loading: false } : prev);
    } catch (err: any) {
      setExec(prev => prev ? { ...prev, loading: false, response: `Error: ${err.message}` } : null);
    }
  };


  const toggleAutoApprove = async (enabled: boolean) => {
    if (!exec) return;
    const prev = exec.autoApproveEmail;
    setExec(curr => curr ? { ...curr, autoApproveEmail: enabled } : null);
    try {
      const res = await authFetch(`/api/v1/agents/${exec.agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_approve_email: enabled })
      });
      if (!res.ok) throw new Error('Failed to update auto-approval');
      setAgents(list => list.map(a => a.id === exec.agentId ? { ...a, autoApproveEmail: enabled } : a));
    } catch (e) {
      setExec(curr => curr ? { ...curr, autoApproveEmail: prev } : null);
      console.error(e);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <PageHeader title="Agents" description="Manage your AI agents">
        <div className="flex gap-2">
          <button
            onClick={() => (window.location.href = '/marketplace')}
            className="flex items-center px-4 py-2 rounded-lg font-medium text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          >
            + Deploy from Marketplace
          </button>
          <button
            onClick={() => (window.location.href = '/agents/new')}
            className="flex items-center px-4 py-2 rounded-lg font-medium text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
          >
            + New Agent
          </button>
        </div>
      </PageHeader>
      <main className="flex-1 p-6">
        <AgentsTable agents={agents} onAgentClick={(agent) => openExecute(agent)} />

        {/* Execute Modal */}
        {exec && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setExec(null)}>
            <div
              className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
                <div>
                  <h2 className="text-lg font-semibold text-white">Agent: {exec.agentName}</h2>
                  <p className="text-xs text-[#9ca3af] mt-1">
                    {exec.model} • {exec.provider}
                  </p>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-[#d1d5db]">
                    <input
                      type="checkbox"
                      checked={exec.autoApproveEmail}
                      onChange={(e) => toggleAutoApprove(e.target.checked)}
                    />
                    Auto-approve agent emails
                  </label>
                </div>
                <button onClick={() => setExec(null)} className="text-[#6b7280] hover:text-white text-2xl leading-none">&times;</button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[rgba(255,255,255,0.07)]">
                <button
                  onClick={() => setExec(prev => prev ? { ...prev, tab: 'execute' } : null)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    exec.tab === 'execute'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-[#6b7280] hover:text-white'
                  }`}
                >
                  ▶ Execute
                </button>
                <button
                  onClick={() => {
                    setExec(prev => prev ? { ...prev, tab: 'history' } : null);
                    if (exec.history.length === 0) fetchHistory(exec.agentId);
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    exec.tab === 'history'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-[#6b7280] hover:text-white'
                  }`}
                >
                  📜 History
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
                {exec.tab === 'execute' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-[#9ca3af] mb-2">Message / Prompt</label>
                      <textarea
                        value={exec.input}
                        onChange={e => setExec(prev => prev ? { ...prev, input: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runExecuteStream(); }}
                        placeholder="Type your message to the agent..."
                        rows={3}
                        className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        autoFocus
                      />
                      <p className="text-xs text-[#6b7280] mt-1">Ctrl+Enter to send • Streaming enabled</p>
                    </div>

                    <button
                      onClick={runExecuteStream}
                      disabled={exec.loading || !exec.input.trim()}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {exec.loading ? (
                        <>
                          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          Streaming...
                        </>
                      ) : (
                        <>▶ Execute (Stream)</>
                      )}
                    </button>

                    {/* Response */}
                    {exec.response && (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-[#9ca3af]">Response</label>
                        <div
                          ref={responseRef}
                          className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 text-sm text-white whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto"
                        >
                          {exec.response}
                          {exec.loading && <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />}
                        </div>

                        {/* Stats */}
                        {exec.usage && (
                          <div className="flex flex-wrap gap-3 text-xs text-[#6b7280]">
                            <span className="px-2 py-1 bg-[#0e0f1a] rounded">Tokens: {exec.usage.total} ({exec.usage.input}↑ {exec.usage.output}↓)</span>
                            {exec.latency && <span className="px-2 py-1 bg-[#0e0f1a] rounded">Latency: {exec.latency}ms</span>}
                            <span className="px-2 py-1 bg-[#0e0f1a] rounded">{exec.model}</span>
                            <span className="px-2 py-1 bg-[#0e0f1a] rounded">{exec.provider}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* History Tab */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[#9ca3af]">Execution History</label>
                      <button
                        onClick={() => fetchHistory(exec.agentId)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Refresh
                      </button>
                    </div>
                    {exec.historyLoading ? (
                      <div className="flex justify-center py-8">
                        <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                      </div>
                    ) : exec.history.length === 0 ? (
                      <div className="text-center py-8 text-[#6b7280]">
                        No executions yet
                      </div>
                    ) : (
                      exec.history.map((h: any, i: number) => (
                        <div key={h.id || i} className="bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-[#6b7280]">
                            <span>{formatDate(h.created_at)}</span>
                            <div className="flex gap-2">
                              <span>{h.model}</span>
                              <span>{h.tokens_used} tokens</span>
                              <span>{h.latency_ms}ms</span>
                            </div>
                          </div>
                          <div className="text-xs text-blue-300 font-medium">Input:</div>
                          <div className="text-sm text-white/80 line-clamp-2">{h.input}</div>
                          <div className="text-xs text-green-300 font-medium">Output:</div>
                          <div className="text-sm text-white/60 line-clamp-3 whitespace-pre-wrap">{h.output}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
