'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  executeSandbox,
  executeBatch,
  getSandboxExecutions,
  getSandboxExecution,
} from '@/lib/api/endpoints/sandbox';
import type {
  SandboxExecution,
  SandboxLanguage,
  SandboxStatus,
} from '@/lib/api/types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES: { value: SandboxLanguage; label: string; hint: string }[] = [
  { value: 'javascript', label: 'JavaScript', hint: 'console.log("hello")' },
  { value: 'python', label: 'Python', hint: 'print("hello")' },
  { value: 'shell', label: 'Shell', hint: 'echo "hello"' },
];

const TIMEOUTS = [
  { value: 5_000, label: '5s' },
  { value: 15_000, label: '15s' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '60s' },
];

const AGENT_CONTEXTS = ['None', 'mike', 'aria', 'zeus', 'nova', 'rex'];

const REFRESH_INTERVAL_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColors(status: SandboxStatus) {
  switch (status) {
    case 'completed':
      return { dot: 'bg-emerald-400', text: 'text-emerald-400', badge: 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' };
    case 'failed':
      return { dot: 'bg-red-400', text: 'text-red-400', badge: 'bg-red-900/20 border-red-500/30 text-red-400' };
    case 'timeout':
      return { dot: 'bg-yellow-400', text: 'text-yellow-400', badge: 'bg-yellow-900/20 border-yellow-500/30 text-yellow-400' };
    case 'running':
    case 'pending':
      return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400', badge: 'bg-blue-900/20 border-blue-500/30 text-blue-400' };
    case 'skipped':
      return { dot: 'bg-gray-500', text: 'text-gray-400', badge: 'bg-gray-900/20 border-gray-500/30 text-gray-400' };
    default:
      return { dot: 'bg-gray-500', text: 'text-gray-400', badge: 'bg-gray-900/20 border-gray-500/30 text-gray-400' };
  }
}

function langBadgeColor(lang: SandboxLanguage) {
  switch (lang) {
    case 'javascript': return 'bg-yellow-900/30 text-yellow-300 border-yellow-600/30';
    case 'python': return 'bg-blue-900/30 text-blue-300 border-blue-600/30';
    case 'shell': return 'bg-purple-900/30 text-purple-300 border-purple-600/30';
    default: return 'bg-gray-800 text-gray-300 border-gray-600/30';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LangBadge({ lang }: { lang: SandboxLanguage }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${langBadgeColor(lang)}`}>
      {lang === 'javascript' ? 'JS' : lang === 'python' ? 'PY' : 'SH'}
    </span>
  );
}

function StatusBadge({ status }: { status: SandboxStatus }) {
  const c = statusColors(status);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${c.badge}`}>
      {status === 'running' && <span className="mr-1">⟳</span>}
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 text-xs text-[#6b7280] hover:text-white bg-[#1e1f2e] border border-[rgba(255,255,255,0.06)] rounded transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─── History Item ─────────────────────────────────────────────────────────────

function HistoryItem({
  exec,
  onSelect,
  isActive,
}: {
  exec: SandboxExecution;
  onSelect: (exec: SandboxExecution) => void;
  isActive: boolean;
}) {
  const c = statusColors(exec.status);
  return (
    <button
      onClick={() => onSelect(exec)}
      className={`w-full text-left px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[#0f1020] transition-colors ${isActive ? 'bg-[#0f1020]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
          <LangBadge lang={exec.language} />
        </div>
        <span className="text-[10px] text-[#4b5563] shrink-0">{timeAgo(exec.created_at)}</span>
      </div>
      <p className="text-xs text-[#6b7280] font-mono truncate leading-relaxed">
        {(exec.code || '').split('\n')[0].slice(0, 60) || '—'}
      </p>
      {exec.duration_ms != null && (
        <p className="text-[10px] text-[#374151] mt-0.5">{exec.duration_ms}ms</p>
      )}
    </button>
  );
}

// ─── Output Panel ─────────────────────────────────────────────────────────────

function OutputPanel({
  execution,
  loading,
}: {
  execution: SandboxExecution | null;
  loading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'stdout' | 'stderr' | 'combined'>('combined');

  if (loading) {
    return (
      <div className="bg-[#000] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 min-h-[120px] flex items-center gap-3">
        <span className="w-4 h-4 border-2 border-[#3b82f6]/40 border-t-[#3b82f6] rounded-full animate-spin shrink-0" />
        <span className="text-sm text-[#6b7280]">Executing…</span>
      </div>
    );
  }

  if (!execution) return null;

  const hasStdout = !!execution.stdout?.trim();
  const hasStderr = !!execution.stderr?.trim();
  const combined = [
    execution.stdout?.trim() && `[stdout]\n${execution.stdout.trim()}`,
    execution.stderr?.trim() && `[stderr]\n${execution.stderr.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n') || '(no output)';

  const displayText =
    activeTab === 'stdout'
      ? execution.stdout?.trim() || '(empty)'
      : activeTab === 'stderr'
      ? execution.stderr?.trim() || '(empty)'
      : combined;

  const c = statusColors(execution.status);

  return (
    <div className="bg-[#000] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      {/* Output header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(255,255,255,0.07)] bg-[#080810]">
        <div className="flex items-center gap-3">
          <StatusBadge status={execution.status} />
          {execution.exit_code != null && (
            <span className="text-xs text-[#6b7280]">exit {execution.exit_code}</span>
          )}
          {execution.duration_ms != null && (
            <span className="text-xs text-[#4b5563]">{execution.duration_ms}ms</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={displayText} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[rgba(255,255,255,0.06)] bg-[#080810]">
        {(['combined', 'stdout', 'stderr'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-white border-b-2 border-[#3b82f6]'
                : 'text-[#4b5563] hover:text-[#9ca3af]'
            } ${tab === 'stderr' && hasStderr && activeTab !== 'stderr' ? 'text-red-500/70' : ''}`}
          >
            {tab}
            {tab === 'stdout' && hasStdout && (
              <span className="ml-1 w-1 h-1 rounded-full bg-emerald-400 inline-block" />
            )}
            {tab === 'stderr' && hasStderr && (
              <span className="ml-1 w-1 h-1 rounded-full bg-red-400 inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <pre className="p-4 text-sm text-[#d1d5db] font-mono whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed scrollbar-thin">
        {displayText}
      </pre>
    </div>
  );
}

// ─── Batch Step Row ───────────────────────────────────────────────────────────

interface BatchScript {
  language: SandboxLanguage;
  code: string;
}

function BatchStepRow({
  index,
  script,
  onChange,
  onRemove,
  result,
}: {
  index: number;
  script: BatchScript;
  onChange: (s: BatchScript) => void;
  onRemove: () => void;
  result?: SandboxExecution;
}) {
  return (
    <div className="bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[#080810]">
        <span className="text-xs text-[#4b5563] font-mono">Step {index + 1}</span>
        <div className="flex gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              onClick={() => onChange({ ...script, language: l.value })}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                script.language === l.value
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-[#6b7280] hover:text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {result && (
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge status={result.status} />
            {result.duration_ms != null && (
              <span className="text-[10px] text-[#4b5563]">{result.duration_ms}ms</span>
            )}
          </div>
        )}
        {!result && (
          <button
            onClick={onRemove}
            className="ml-auto text-xs text-[#4b5563] hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      <textarea
        value={script.code}
        onChange={(e) => onChange({ ...script, code: e.target.value })}
        rows={3}
        placeholder={`# ${LANGUAGES.find((l) => l.value === script.language)?.hint || ''}`}
        className="w-full px-4 py-3 bg-transparent text-white text-sm placeholder-[#374151] font-mono resize-y min-h-[72px] focus:outline-none leading-relaxed"
      />
      {result && (result.stdout || result.stderr) && (
        <div className="border-t border-[rgba(255,255,255,0.05)] px-4 py-2 bg-[#050508]">
          {result.stdout && (
            <pre className="text-xs text-[#9ca3af] font-mono whitespace-pre-wrap max-h-28 overflow-y-auto">
              {result.stdout}
            </pre>
          )}
          {result.stderr && (
            <pre className="text-xs text-red-400/80 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto mt-1">
              {result.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  // ── Editor state ──
  const [language, setLanguage] = useState<SandboxLanguage>('javascript');
  const [code, setCode] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(30_000);
  const [agentContext, setAgentContext] = useState('None');

  // ── Execution state ──
  const [executing, setExecuting] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<SandboxExecution | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  // ── Batch mode ──
  const [batchMode, setBatchMode] = useState(false);
  const [batchScripts, setBatchScripts] = useState<BatchScript[]>([
    { language: 'shell', code: '' },
    { language: 'javascript', code: '' },
  ]);
  const [stopOnError, setStopOnError] = useState(true);
  const [batchResults, setBatchResults] = useState<SandboxExecution[]>([]);

  // ── History ──
  const [history, setHistory] = useState<SandboxExecution[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterLang, setFilterLang] = useState<SandboxLanguage | ''>('');
  const [filterStatus, setFilterStatus] = useState<SandboxStatus | ''>('');
  const [filterAgent, setFilterAgent] = useState('');
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    try {
      const res = await getSandboxExecutions({
        language: filterLang || undefined,
        status: filterStatus || undefined,
        agent_id: filterAgent || undefined,
        limit: 30,
      });
      setHistory(res.executions);
      setHistoryTotal(res.total);
    } catch {
      // non-fatal
    } finally {
      setHistoryLoading(false);
    }
  }, [filterLang, filterStatus, filterAgent]);

  useEffect(() => {
    setHistoryLoading(true);
    loadHistory();
  }, [loadHistory]);

  // Auto-refresh history
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(loadHistory, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadHistory]);

  // ── Execute single ──
  const handleExecute = async () => {
    if (!code.trim()) return;
    setExecuting(true);
    setExecError(null);
    setCurrentExecution(null);
    setBatchResults([]);

    try {
      const result = await executeSandbox({
        language,
        code: code.trim(),
        timeout_ms: timeoutMs,
        agent_id: agentContext !== 'None' ? agentContext : undefined,
      });
      setCurrentExecution(result);
      setActiveHistoryId(result.id);
      loadHistory();
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  // ── Execute batch ──
  const handleBatch = async () => {
    const valid = batchScripts.filter((s) => s.code.trim());
    if (valid.length === 0) return;
    setExecuting(true);
    setExecError(null);
    setCurrentExecution(null);
    setBatchResults([]);

    try {
      const results = await executeBatch({
        scripts: valid,
        stop_on_error: stopOnError,
        agent_id: agentContext !== 'None' ? agentContext : undefined,
      });
      setBatchResults(results);
      loadHistory();
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Batch failed');
    } finally {
      setExecuting(false);
    }
  };

  // ── History click: load full detail ──
  const handleHistorySelect = async (exec: SandboxExecution) => {
    setActiveHistoryId(exec.id);
    setBatchMode(false);
    setCode(exec.code);
    setLanguage(exec.language);
    setExecError(null);
    setBatchResults([]);

    // Load full detail (has stdout/stderr)
    try {
      const full = await getSandboxExecution(exec.id);
      setCurrentExecution(full);
    } catch {
      setCurrentExecution(exec);
    }
  };

  // ── Batch step helpers ──
  const updateBatchScript = (index: number, updated: BatchScript) => {
    setBatchScripts((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };
  const removeBatchScript = (index: number) => {
    setBatchScripts((prev) => prev.filter((_, i) => i !== index));
  };
  const addBatchScript = () => {
    setBatchScripts((prev) => [...prev, { language: 'shell', code: '' }]);
  };

  const canRun = batchMode
    ? batchScripts.some((s) => s.code.trim()) && !executing
    : code.trim().length > 0 && !executing;

  return (
    <div className="max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Code Sandbox</h1>
          <p className="text-sm text-[#6b7280] mt-1">
            Execute JavaScript, Python, and shell scripts. Used by agents for testing and validation.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-[#9ca3af]">Batch Mode</span>
          <button
            onClick={() => { setBatchMode((b) => !b); setCurrentExecution(null); setBatchResults([]); setExecError(null); }}
            className={`relative w-10 h-5.5 rounded-full transition-colors ${batchMode ? 'bg-[#3b82f6]' : 'bg-[#1e1f2e]'}`}
            style={{ height: '22px' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${batchMode ? 'translate-x-[18px]' : ''}`}
            />
          </button>
        </label>
      </div>

      <div className="flex gap-5">
        {/* ─── Left panel ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Language tabs (single mode) */}
            {!batchMode && (
              <div className="flex gap-1 bg-[#0d0e1a] rounded-lg p-1 border border-[rgba(255,255,255,0.07)]">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLanguage(l.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      language === l.value
                        ? 'bg-[#3b82f6] text-white'
                        : 'text-[#9ca3af] hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}

            {/* Timeout selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6b7280] whitespace-nowrap">Timeout</label>
              <select
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                className="px-2 py-1.5 bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
              >
                {TIMEOUTS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Agent context */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6b7280] whitespace-nowrap">Running as</label>
              <select
                value={agentContext}
                onChange={(e) => setAgentContext(e.target.value)}
                className="px-2 py-1.5 bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#3b82f6]"
              >
                {AGENT_CONTEXTS.map((a) => (
                  <option key={a} value={a}>{a === 'None' ? 'No agent' : a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Single editor ── */}
          {!batchMode && (
            <div className="bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[#080810]">
                <div className="flex items-center gap-2">
                  <LangBadge lang={language} />
                  <span className="text-xs text-[#4b5563]">editor</span>
                </div>
                <span className="text-xs text-[#374151]">⌘+Enter to run</span>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (canRun) handleExecute();
                  }
                }}
                placeholder={`// ${LANGUAGES.find((l) => l.value === language)?.hint || ''}`}
                rows={10}
                disabled={executing}
                className="w-full px-4 py-4 bg-transparent text-white text-sm placeholder-[#2d2f3f] focus:outline-none resize-y min-h-[200px] font-mono leading-relaxed disabled:opacity-60"
              />
            </div>
          )}

          {/* ── Batch editor ── */}
          {batchMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[#9ca3af] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stopOnError}
                    onChange={(e) => setStopOnError(e.target.checked)}
                    className="rounded accent-[#3b82f6]"
                  />
                  Stop on error
                </label>
                <span className="text-xs text-[#4b5563]">{batchScripts.length} step{batchScripts.length !== 1 ? 's' : ''}</span>
              </div>

              {batchScripts.map((script, i) => (
                <BatchStepRow
                  key={i}
                  index={i}
                  script={script}
                  onChange={(s) => updateBatchScript(i, s)}
                  onRemove={() => removeBatchScript(i)}
                  result={batchResults[i]}
                />
              ))}

              {batchResults.length === 0 && (
                <button
                  onClick={addBatchScript}
                  disabled={executing || batchScripts.length >= 20}
                  className="w-full py-2.5 text-sm text-[#6b7280] hover:text-white border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl transition-colors hover:border-[rgba(255,255,255,0.2)] disabled:opacity-40"
                >
                  + Add step
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={batchMode ? handleBatch : handleExecute}
              disabled={!canRun}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#3b82f6]/25 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {executing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {batchMode ? 'Running batch…' : 'Executing…'}
                </>
              ) : (
                <>
                  <span>▶</span>
                  {batchMode ? 'Run Batch' : 'Run'}
                </>
              )}
            </button>

            {(currentExecution || execError || batchResults.length > 0) && (
              <button
                onClick={() => { setCurrentExecution(null); setExecError(null); setBatchResults([]); setActiveHistoryId(null); }}
                className="px-4 py-2.5 text-sm text-[#6b7280] hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Error */}
          {execError && (
            <div className="p-4 bg-red-900/15 border border-red-500/20 rounded-xl text-red-400 text-sm font-mono">
              {execError}
            </div>
          )}

          {/* Output (single mode) */}
          {!batchMode && (
            <OutputPanel execution={currentExecution} loading={executing} />
          )}

          {/* Batch summary */}
          {batchMode && batchResults.length > 0 && !executing && (
            <div className="bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
              <h3 className="text-sm font-medium text-white mb-3">Batch Results</h3>
              <div className="flex items-center gap-4 text-xs text-[#6b7280]">
                <span className="text-emerald-400">
                  {batchResults.filter((r) => r.status === 'completed').length} completed
                </span>
                <span className="text-red-400">
                  {batchResults.filter((r) => r.status === 'failed').length} failed
                </span>
                <span className="text-yellow-400">
                  {batchResults.filter((r) => r.status === 'timeout').length} timeout
                </span>
                <span className="text-gray-500">
                  {batchResults.filter((r) => r.status === 'skipped').length} skipped
                </span>
                <span className="ml-auto text-[#4b5563]">
                  total {batchResults.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0)}ms
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Right panel — History ─────────────────────────────────── */}
        <div className="w-72 shrink-0 hidden lg:flex flex-col gap-3">

          {/* Filter controls */}
          <div className="bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-xl p-3 space-y-2">
            <p className="text-xs text-[#6b7280] font-medium uppercase tracking-wide">Filter history</p>
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value as SandboxLanguage | '')}
              className="w-full px-2 py-1.5 bg-[#080810] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-white focus:outline-none"
            >
              <option value="">All languages</option>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as SandboxStatus | '')}
              className="w-full px-2 py-1.5 bg-[#080810] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-white focus:outline-none"
            >
              <option value="">All statuses</option>
              {(['completed', 'failed', 'timeout', 'running'] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#080810] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-white focus:outline-none"
            >
              <option value="">All agents</option>
              {AGENT_CONTEXTS.filter((a) => a !== 'None').map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* History list */}
          <div className="bg-[#0d0e1a] border border-[rgba(255,255,255,0.07)] rounded-xl flex flex-col flex-1 min-h-0">
            <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between shrink-0">
              <h3 className="text-sm font-medium text-white">Recent</h3>
              <span className="text-xs text-[#4b5563]">{historyTotal} total</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="p-3 space-y-2 animate-pulse">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="h-3 bg-[#1e293b] rounded w-20" />
                      <div className="h-3 bg-[#1e293b] rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#4b5563]">No executions yet</div>
              ) : (
                history.map((exec) => (
                  <HistoryItem
                    key={exec.id}
                    exec={exec}
                    onSelect={handleHistorySelect}
                    isActive={activeHistoryId === exec.id}
                  />
                ))
              )}
            </div>

            <div className="px-3 py-2 border-t border-[rgba(255,255,255,0.04)] shrink-0">
              <p className="text-[10px] text-[#2d2f3f]">Auto-refreshes every 10s</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
