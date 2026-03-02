'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';

interface Execution {
  id: string;
  code: string;
  stdout: string;
  exit_code: number;
  duration_ms: number;
  environment: string;
  created_at: string;
}

export default function SandboxPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [code, setCode] = useState('# Write your code here\nprint("Hello from Vutler Sandbox!")');
  const [environment, setEnvironment] = useState<'local' | 'docker'>('local');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ stdout: string; exit_code: number; duration_ms: number } | null>(null);
  const [recentExecs, setRecentExecs] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch('/api/v1/agents')
      .then(r => r.json())
      .then(data => {
        const list = data.agents || data || [];
        setAgents(list);
        if (list.length > 0) setSelectedAgent(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedAgent) loadRecent();
  }, [selectedAgent]);

  const loadRecent = async () => {
    try {
      const res = await authFetch(`/api/v1/agents/${selectedAgent}/executions?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setRecentExecs(data.executions || []);
      }
    } catch {}
  };

  const runCode = async () => {
    if (!selectedAgent || !code.trim()) return;
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const res = await authFetch(`/api/v1/agents/${selectedAgent}/run-code`, {
        method: 'POST',
        body: JSON.stringify({ code, environment }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOutput({ stdout: data.stdout || data.output || '', exit_code: data.exit_code ?? 0, duration_ms: data.duration_ms ?? 0 });
      loadRecent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const lineNumbers = code.split('\n').map((_, i) => i + 1).join('\n');

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">🧪 RLM Sandbox</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Execute code through your agents</p>
      </div>

      <div className="flex gap-6">
        {/* Main area */}
        <div className="flex-1 space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-4">
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="px-4 py-2.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Agent</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value as any)}
              className="px-4 py-2.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="local">Local</option>
              <option value="docker">Docker</option>
            </select>
            <button
              onClick={runCode}
              disabled={running || !selectedAgent || !code.trim()}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/30 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {running ? (
                <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Running...</>
              ) : (
                <>▶ Run</>
              )}
            </button>
          </div>

          {/* Code editor */}
          <div className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.07)] bg-[#0e0f1a]">
              <span className="text-xs text-[#6b7280] font-mono">code.py</span>
              <span className="text-xs text-[#6b7280]">{code.split('\n').length} lines</span>
            </div>
            <div className="flex">
              <pre className="py-4 px-3 text-right text-xs text-[#4b5563] font-mono leading-6 select-none border-r border-[rgba(255,255,255,0.05)] min-w-[3rem]">
                {lineNumbers}
              </pre>
              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    setCode(code.substring(0, start) + '    ' + code.substring(end));
                    setTimeout(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 4; }, 0);
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runCode();
                }}
                spellCheck={false}
                className="flex-1 py-4 px-4 bg-transparent text-white font-mono text-sm leading-6 resize-y min-h-[300px] focus:outline-none"
              />
            </div>
          </div>

          {/* Output */}
          {error && <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
          {output && (
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.07)]">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#9ca3af]">Output</span>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${output.exit_code === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    exit: {output.exit_code}
                  </span>
                </div>
                <span className="text-xs text-[#6b7280]">{output.duration_ms}ms</span>
              </div>
              <pre className="p-4 text-sm text-white font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                {output.stdout || '(no output)'}
              </pre>
            </div>
          )}
        </div>

        {/* Recent executions sidebar */}
        <div className="w-80 flex-shrink-0 hidden xl:block">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.07)]">
              <h3 className="text-sm font-medium text-white">Recent Executions</h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {recentExecs.length === 0 ? (
                <div className="p-4 text-center text-sm text-[#6b7280]">No executions yet</div>
              ) : (
                recentExecs.map((ex, i) => (
                  <button
                    key={ex.id || i}
                    onClick={() => { setCode(ex.code || ''); if (ex.stdout) setOutput({ stdout: ex.stdout, exit_code: ex.exit_code, duration_ms: ex.duration_ms }); }}
                    className="w-full text-left px-4 py-3 border-b border-[rgba(255,255,255,0.05)] hover:bg-[#0e0f1a] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${ex.exit_code === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {ex.exit_code === 0 ? '✓' : '✗'}
                      </span>
                      <span className="text-xs text-[#6b7280]">{new Date(ex.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-[#9ca3af] font-mono truncate">{ex.code?.split('\n')[0] || '...'}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
