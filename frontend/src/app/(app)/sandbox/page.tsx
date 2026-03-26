'use client';

import { useState, useEffect, useRef } from 'react';
import { getAgents, getAgentExecutions, executeAgent } from '@/lib/api/endpoints/agents';
import type { Agent, AgentExecution } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ─── History Item ─────────────────────────────────────────────────────────────

function HistoryItem({
  exec,
  onRestore,
}: {
  exec: AgentExecution;
  onRestore: (exec: AgentExecution) => void;
}) {
  return (
    <button
      onClick={() => onRestore(exec)}
      className="w-full text-left px-4 py-3 border-b border-[rgba(255,255,255,0.05)] last:border-0 hover:bg-[#0e0f1a] transition-colors group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6b7280] group-hover:text-[#9ca3af] transition-colors">
          {timeAgo(exec.created_at)}
        </span>
        {exec.tokens_used > 0 && (
          <span className="text-xs text-[#4b5563]">{formatTokens(exec.tokens_used)} tok</span>
        )}
      </div>
      <p className="text-xs text-[#9ca3af] truncate">{exec.input || '—'}</p>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [prompt, setPrompt] = useState('');
  const [executing, setExecuting] = useState(false);
  const [output, setOutput] = useState<{ response: string; latency_ms?: number; model?: string } | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [history, setHistory] = useState<AgentExecution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const outputRef = useRef<HTMLPreElement>(null);

  // Load agents on mount
  useEffect(() => {
    getAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setSelectedAgent(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Load history when agent changes
  useEffect(() => {
    if (!selectedAgent) { setHistory([]); return; }
    setHistoryLoading(true);
    getAgentExecutions(selectedAgent)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedAgent]);

  const handleExecute = async () => {
    if (!selectedAgent || !prompt.trim()) return;
    setExecuting(true);
    setExecError(null);
    setOutput(null);
    try {
      const result = await executeAgent(selectedAgent, prompt.trim());
      setOutput({ response: result.response });
      // Refresh history
      getAgentExecutions(selectedAgent).then(setHistory).catch(() => {});
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
      // Scroll output into view
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };

  const handleRestore = (exec: AgentExecution) => {
    setPrompt(exec.input || '');
    if (exec.output) {
      setOutput({ response: exec.output, latency_ms: exec.latency_ms });
    }
    setExecError(null);
  };

  const selectedAgentObj = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Agent Sandbox</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Execute agents interactively and inspect responses</p>
      </div>

      <div className="flex gap-6">
        {/* Main panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Agent selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-[#9ca3af] uppercase tracking-wide mb-1.5">Agent</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {selectedAgentObj?.model && (
              <div className="shrink-0 mt-5">
                <span className="px-2.5 py-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-[#9ca3af] font-mono">
                  {selectedAgentObj.model}
                </span>
              </div>
            )}
            {selectedAgentObj?.status && (
              <div className="shrink-0 mt-5">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  selectedAgentObj.status === 'active'
                    ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
                    : selectedAgentObj.status === 'error'
                    ? 'bg-red-900/20 text-red-400 border-red-500/30'
                    : 'bg-[#374151]/40 text-[#9ca3af] border-[rgba(255,255,255,0.1)]'
                }`}>
                  {selectedAgentObj.status}
                </span>
              </div>
            )}
          </div>

          {/* Prompt input */}
          <div>
            <label className="block text-xs text-[#9ca3af] uppercase tracking-wide mb-1.5">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (!executing && selectedAgent && prompt.trim()) handleExecute();
                }
              }}
              placeholder="Enter a message or instruction for the agent…"
              rows={6}
              disabled={executing}
              className="w-full px-4 py-3 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl text-white text-sm placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] resize-y min-h-[120px] disabled:opacity-60 font-mono leading-relaxed"
            />
            <p className="text-xs text-[#4b5563] mt-1">⌘ Enter to execute</p>
          </div>

          {/* Execute button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleExecute}
              disabled={executing || !selectedAgent || !prompt.trim()}
              className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#3b82f6]/30 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {executing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing…
                </>
              ) : (
                <>▶ Execute</>
              )}
            </button>
            {(output || execError) && (
              <button
                onClick={() => { setOutput(null); setExecError(null); }}
                className="px-4 py-2.5 text-sm text-[#6b7280] hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Error */}
          {execError && (
            <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {execError}
            </div>
          )}

          {/* Output panel */}
          {output && (
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.07)] bg-[#0e0f1a]">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-white">Response</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                  {output.model && <span className="font-mono">{output.model}</span>}
                  {output.latency_ms !== undefined && <span>{output.latency_ms}ms</span>}
                </div>
              </div>
              <pre
                ref={outputRef}
                className="p-4 text-sm text-[#d1d5db] font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed"
              >
                {output.response || '(empty response)'}
              </pre>
            </div>
          )}

          {/* Loading output placeholder */}
          {executing && (
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
                <span className="w-4 h-4 border-2 border-[#3b82f6]/30 border-t-[#3b82f6] rounded-full animate-spin" />
                Waiting for response…
              </div>
            </div>
          )}
        </div>

        {/* History sidebar */}
        <div className="w-72 shrink-0 hidden xl:flex flex-col">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl flex flex-col min-h-0 flex-1">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.07)] shrink-0">
              <h3 className="text-sm font-medium text-white">Execution History</h3>
              <p className="text-xs text-[#6b7280] mt-0.5">Click to restore prompt + output</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!selectedAgent ? (
                <div className="p-4 text-center text-sm text-[#6b7280]">Select an agent to see history</div>
              ) : historyLoading ? (
                <div className="p-4 space-y-3 animate-pulse">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="h-3 bg-[#1e293b] rounded w-16" />
                      <div className="h-3 bg-[#1e293b] rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#6b7280]">No executions yet</div>
              ) : (
                history.map((exec) => (
                  <HistoryItem key={exec.id} exec={exec} onRestore={handleRestore} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
