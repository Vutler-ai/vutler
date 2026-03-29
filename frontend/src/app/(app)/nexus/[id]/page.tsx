'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  getNode,
  dispatch,
  spawnAgent,
  createNodeAgent,
  stopNodeAgent,
  dispatchSearch,
  dispatchReadDocument,
  dispatchListDir,
  dispatchListEmails,
  dispatchSearchEmails,
  dispatchReadCalendar,
  dispatchReadContacts,
  dispatchShellExec,
  dispatchReadClipboard,
  getNodeCapabilities,
  type CreateNodeAgentDefinition,
} from '@/lib/api/endpoints/nexus';
import { getAgents } from '@/lib/api/endpoints/agents';
import type {
  NexusAgentStatus,
  NexusSeatsInfo,
  Agent,
  NexusCapabilities,
  NexusDispatchResult,
  NexusSearchResult,
  NexusEmailResult,
  NexusCalendarEvent,
  NexusContact,
  NexusShellResult,
  NexusDocumentResult,
} from '@/lib/api/types';

// ─── Local types ──────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
}

interface NodeDetail {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  ip?: string;
  connectedSince?: string;
  lastHeartbeat?: string;
  agents?: NexusAgentStatus[];
  seats?: NexusSeatsInfo;
  recentActivity?: ActivityEvent[];
  agentCount?: number;
  mode?: string;
  clientName?: string;
}

type ActionType =
  | 'search'
  | 'read_document'
  | 'list_dir'
  | 'read_clipboard'
  | 'list_emails'
  | 'search_emails'
  | 'read_calendar'
  | 'read_contacts'
  | 'shell_exec';

interface ActionConfig {
  label: string;
  icon: string;
}

const ACTION_CONFIGS: Record<ActionType, ActionConfig> = {
  search:         { label: 'Search Files',  icon: '🔍' },
  read_document:  { label: 'Read Document', icon: '📄' },
  list_dir:       { label: 'List Directory',icon: '📁' },
  read_clipboard: { label: 'Clipboard',     icon: '📋' },
  list_emails:    { label: 'List Emails',   icon: '📧' },
  search_emails:  { label: 'Search Emails', icon: '✉️' },
  read_calendar:  { label: 'Calendar',      icon: '📅' },
  read_contacts:  { label: 'Contacts',      icon: '👤' },
  shell_exec:     { label: 'Shell',         icon: '>' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso?: string): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Status styles ─────────────────────────────────────────────────────────────

const NODE_STATUS: Record<string, { dot: string; badge: string; label: string }> = {
  online:  { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Online' },
  offline: { dot: 'bg-slate-400',   badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',     label: 'Offline' },
  error:   { dot: 'bg-red-400',     badge: 'bg-red-500/10 text-red-400 border-red-500/30',           label: 'Error' },
};

const AGENT_STATUS_STYLES: Record<NexusAgentStatus['status'], { dot: string; label: string }> = {
  idle:    { dot: 'bg-emerald-400', label: 'idle' },
  busy:    { dot: 'bg-blue-400',    label: 'busy' },
  stopped: { dot: 'bg-[#6b7280]',  label: 'stopped' },
};

function StatusBadge({ status }: { status: string }) {
  const s = NODE_STATUS[status] ?? NODE_STATUS.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

const inputCls =
  'w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors';

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 bg-[#14151f] rounded w-32" />
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 space-y-3">
        <div className="h-4 bg-[#1e293b] rounded w-20" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 bg-[#1e293b] rounded w-16" />
              <div className="h-4 bg-[#1e293b] rounded w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl h-32" />
        ))}
      </div>
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl h-40" />
    </div>
  );
}

// ─── Seats progress bar ───────────────────────────────────────────────────────

function SeatsBar({ seats }: { seats: NexusSeatsInfo }) {
  const pct = seats.max > 0 ? Math.min(100, Math.round((seats.used / seats.max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#3b82f6] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[#9ca3af] shrink-0 tabular-nums">{seats.used}/{seats.max}</span>
    </div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  isEnterprise,
  onStop,
  stopping,
}: {
  agent: NexusAgentStatus;
  isEnterprise: boolean;
  onStop: (id: string) => void;
  stopping: boolean;
}) {
  const s = AGENT_STATUS_STYLES[agent.status] ?? AGENT_STATUS_STYLES.stopped;
  const initials = agent.name.slice(0, 2).toUpperCase();

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col gap-3 hover:border-[rgba(255,255,255,0.12)] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#1e293b] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-xs font-semibold text-[#9ca3af] shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{agent.name}</p>
            <p className="text-xs text-[#6b7280] truncate">{agent.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${s.dot} ${agent.status === 'idle' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-[#9ca3af]">{s.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#6b7280]">
        <span>{agent.tasksCompleted} task{agent.tasksCompleted !== 1 ? 's' : ''} done</span>
        {isEnterprise && agent.status !== 'stopped' && (
          <button
            onClick={() => onStop(agent.id)}
            disabled={stopping}
            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Spawn agent dropdown ─────────────────────────────────────────────────────

function SpawnAgentDropdown({
  nodeId,
  poolAgents,
  onSpawned,
}: {
  nodeId: string;
  poolAgents: Agent[];
  onSpawned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [spawning, setSpawning] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSpawn = async (agentId: string) => {
    setSpawning(agentId);
    setError('');
    try {
      await spawnAgent(nodeId, agentId);
      setOpen(false);
      onSpawned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spawn agent');
    } finally {
      setSpawning('');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
      >
        Spawn Agent
        <span className="text-[#6b7280] text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden">
          {poolAgents.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#6b7280]">No pool agents configured.</p>
          ) : (
            poolAgents.map((a) => (
              <button
                key={a.id}
                onClick={() => handleSpawn(a.id)}
                disabled={spawning === a.id}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[rgba(255,255,255,0.04)] transition-colors disabled:opacity-50"
              >
                <div className="w-6 h-6 rounded-full bg-[#1e293b] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-xs text-[#9ca3af] shrink-0">
                  {a.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm text-white truncate">{a.name}</span>
                {spawning === a.id && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin ml-auto" />
                )}
              </button>
            ))
          )}
          {error && <p className="px-4 py-2 text-xs text-red-400 border-t border-[rgba(255,255,255,0.07)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Create agent dialog ──────────────────────────────────────────────────────

const AVAILABLE_SKILLS = ['email', 'calendar', 'tasks', 'drive', 'chat', 'web-search', 'code-exec'];
const AVAILABLE_TOOLS  = ['send-email', 'read-email', 'create-event', 'create-task', 'read-file', 'write-file', 'web-search', 'execute-code'];
const MODEL_OPTIONS    = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'claude-sonnet-4-20250514', 'claude-haiku-4-5', 'llama-3.3-70b-versatile'];

function CreateAgentDialog({
  nodeId,
  onClose,
  onCreated,
}: {
  nodeId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateNodeAgentDefinition>({
    name: '',
    role: '',
    description: '',
    system_prompt: '',
    model: 'gpt-5.4-mini',
    skills: [],
    tools: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleItem = (key: 'skills' | 'tools', value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      setError('Name and role are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createNodeAgent(nodeId, form);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Create Node Agent</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Support Bot"
                className={inputCls}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Role</label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="e.g. support"
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short description…"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">System Prompt</label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="You are a helpful assistant…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Model</label>
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className={inputCls}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Skills</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SKILLS.map((skill) => {
                const active = form.skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleItem('skills', skill)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      active
                        ? 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/40'
                        : 'bg-[#0a0b14] text-[#6b7280] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Tools</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const active = form.tools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleItem('tools', tool)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-[#0a0b14] text-[#6b7280] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  >
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>
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
            className="flex-1 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? 'Creating…' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Viewer ────────────────────────────────────────────────────────────

function ResultViewer({ action, result }: { action: ActionType; result: NexusDispatchResult }) {
  if (result.status === 'error') {
    return (
      <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-xs font-medium text-red-400 mb-1">Error</p>
        <p className="text-sm text-red-300">{result.error ?? 'An unknown error occurred.'}</p>
      </div>
    );
  }

  const data = result.data as any;
  if (!data) return null;

  if (action === 'search') {
    const results: NexusSearchResult[] = data?.results ?? [];
    return (
      <div className="mt-4">
        <p className="text-xs text-[#9ca3af] mb-2">{results.length} file{results.length !== 1 ? 's' : ''} found</p>
        {results.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No files matched your query.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.07)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[#0a0b14]">
                  <th className="text-left px-3 py-2 text-xs text-[#9ca3af] font-medium">Path</th>
                  <th className="text-right px-3 py-2 text-xs text-[#9ca3af] font-medium">Size</th>
                  <th className="text-right px-3 py-2 text-xs text-[#9ca3af] font-medium">Modified</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-3 py-2 font-mono text-xs text-[#d1d5db] break-all">{r.path}</td>
                    <td className="px-3 py-2 text-xs text-[#9ca3af] text-right whitespace-nowrap">{formatBytes(r.size)}</td>
                    <td className="px-3 py-2 text-xs text-[#9ca3af] text-right whitespace-nowrap">{r.modified ? timeAgo(r.modified) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (action === 'list_dir') {
    const entries: Array<{ name: string; type: string; size?: number }> = data?.entries ?? [];
    return (
      <div className="mt-4">
        <p className="text-xs text-[#9ca3af] mb-2">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</p>
        {entries.length === 0 ? (
          <p className="text-sm text-[#6b7280]">Directory is empty.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.07)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[#0a0b14]">
                  <th className="text-left px-3 py-2 text-xs text-[#9ca3af] font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-xs text-[#9ca3af] font-medium">Type</th>
                  <th className="text-right px-3 py-2 text-xs text-[#9ca3af] font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-3 py-2 font-mono text-xs text-[#d1d5db]">
                      {e.type === 'dir' ? '📁 ' : '📄 '}{e.name}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#6b7280]">{e.type}</td>
                    <td className="px-3 py-2 text-xs text-[#9ca3af] text-right">{e.type === 'file' ? formatBytes(e.size) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (action === 'list_emails' || action === 'search_emails') {
    const emails: NexusEmailResult[] = data?.emails ?? [];
    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs text-[#9ca3af]">{emails.length} email{emails.length !== 1 ? 's' : ''}</p>
        {emails.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No emails found.</p>
        ) : (
          emails.map((email, i) => (
            <div key={i} className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm text-white font-medium truncate flex-1">{email.subject || '(no subject)'}</p>
                <p className="text-xs text-[#6b7280] whitespace-nowrap shrink-0">{formatDateTime(email.date)}</p>
              </div>
              <p className="text-xs text-[#3b82f6] mb-1 truncate">From: {email.sender}</p>
              {email.preview && <p className="text-xs text-[#9ca3af] line-clamp-2">{email.preview}</p>}
            </div>
          ))
        )}
      </div>
    );
  }

  if (action === 'read_calendar') {
    const events: NexusCalendarEvent[] = data?.events ?? [];
    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs text-[#9ca3af]">{events.length} event{events.length !== 1 ? 's' : ''}</p>
        {events.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No calendar events found.</p>
        ) : (
          events.map((event, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-900/20 border border-blue-500/20 flex items-center justify-center text-sm shrink-0">
                📅
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{event.title}</p>
                <p className="text-xs text-[#9ca3af] mt-0.5">
                  {formatDateTime(event.start)}{event.end ? ` → ${formatDateTime(event.end)}` : ''}
                </p>
                {event.location && <p className="text-xs text-[#6b7280] mt-0.5 truncate">📍 {event.location}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (action === 'read_contacts') {
    const contacts: NexusContact[] = data?.contacts ?? [];
    return (
      <div className="mt-4">
        <p className="text-xs text-[#9ca3af] mb-2">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        {contacts.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No contacts found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {contacts.map((c, i) => (
              <div key={i} className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#1e293b] flex items-center justify-center text-xs text-[#9ca3af] font-medium shrink-0">
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="text-sm text-white font-medium truncate">{c.name}</p>
                </div>
                {c.email && <p className="text-xs text-[#6b7280] truncate">✉ {c.email}</p>}
                {c.phone && <p className="text-xs text-[#6b7280] truncate">📞 {c.phone}</p>}
                {c.company && <p className="text-xs text-[#4b5563] truncate">🏢 {c.company}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (action === 'shell_exec') {
    const shellData = data as NexusShellResult;
    return (
      <div className="mt-4">
        {shellData.exitCode !== undefined && (
          <p className="text-xs text-[#9ca3af] mb-2">
            Exit code: <span className={shellData.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}>{shellData.exitCode}</span>
          </p>
        )}
        <pre className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-[#d1d5db] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
          {shellData.output || '(no output)'}
        </pre>
      </div>
    );
  }

  if (action === 'read_document') {
    const docData = data as NexusDocumentResult;
    return (
      <div className="mt-4">
        {docData.format && (
          <p className="text-xs text-[#9ca3af] mb-2">Format: {docData.format}</p>
        )}
        <pre className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-[#d1d5db] whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
          {docData.content || '(empty document)'}
        </pre>
      </div>
    );
  }

  if (action === 'read_clipboard') {
    const clipContent: string = data?.content ?? '';
    return (
      <div className="mt-4">
        <p className="text-xs text-[#9ca3af] mb-2">Clipboard content</p>
        <div className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg text-sm text-[#d1d5db] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {clipContent || '(clipboard is empty)'}
        </div>
      </div>
    );
  }

  // Fallback: raw JSON
  return (
    <div className="mt-4">
      <pre className="p-3 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs text-[#d1d5db] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// ─── Action Dispatch Panel ────────────────────────────────────────────────────

function ActionDispatchPanel({ nodeId }: { nodeId: string }) {
  const [activeAction, setActiveAction] = useState<ActionType>('search');
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<NexusDispatchResult | null>(null);

  // Per-action form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('');
  const [docPath, setDocPath] = useState('');
  const [dirPath, setDirPath] = useState('');
  const [dirRecursive, setDirRecursive] = useState(false);
  const [dirPattern, setDirPattern] = useState('');
  const [emailLimit, setEmailLimit] = useState(10);
  const [searchEmailQuery, setSearchEmailQuery] = useState('');
  const [searchEmailLimit, setSearchEmailLimit] = useState(10);
  const [calDays, setCalDays] = useState(7);
  const [contactQuery, setContactQuery] = useState('');
  const [contactLimit, setContactLimit] = useState(50);
  const [shellCmd, setShellCmd] = useState('');

  const handleDispatch = async () => {
    setDispatching(true);
    setResult(null);
    try {
      let res: NexusDispatchResult;
      switch (activeAction) {
        case 'search':
          res = await dispatchSearch(nodeId, searchQuery, searchScope || undefined);
          break;
        case 'read_document':
          res = await dispatchReadDocument(nodeId, docPath);
          break;
        case 'list_dir':
          res = await dispatchListDir(nodeId, dirPath, dirRecursive, dirPattern || undefined);
          break;
        case 'read_clipboard':
          res = await dispatchReadClipboard(nodeId);
          break;
        case 'list_emails':
          res = await dispatchListEmails(nodeId, emailLimit);
          break;
        case 'search_emails':
          res = await dispatchSearchEmails(nodeId, searchEmailQuery, searchEmailLimit);
          break;
        case 'read_calendar':
          res = await dispatchReadCalendar(nodeId, calDays);
          break;
        case 'read_contacts':
          res = await dispatchReadContacts(nodeId, contactQuery || undefined, contactLimit);
          break;
        case 'shell_exec':
          res = await dispatchShellExec(nodeId, shellCmd);
          break;
        default:
          res = { taskId: '', status: 'error', error: 'Unknown action' };
      }
      setResult(res);
    } catch (err) {
      setResult({
        taskId: '',
        status: 'error',
        error: err instanceof Error ? err.message : 'Dispatch failed',
      });
    } finally {
      setDispatching(false);
    }
  };

  const canDispatch = (): boolean => {
    if (dispatching) return false;
    switch (activeAction) {
      case 'search':        return searchQuery.trim().length > 0;
      case 'read_document': return docPath.trim().length > 0;
      case 'list_dir':      return dirPath.trim().length > 0;
      case 'read_clipboard':return true;
      case 'list_emails':   return true;
      case 'search_emails': return searchEmailQuery.trim().length > 0;
      case 'read_calendar': return true;
      case 'read_contacts': return true;
      case 'shell_exec':    return shellCmd.trim().length > 0;
      default: return false;
    }
  };

  const ACTION_KEYS = Object.keys(ACTION_CONFIGS) as ActionType[];

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
        <h2 className="text-sm font-semibold text-white">Dispatch Action</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">Send a typed command to this node</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Action type tabs */}
        <div className="flex flex-wrap gap-1.5">
          {ACTION_KEYS.map((key) => {
            const cfg = ACTION_CONFIGS[key];
            const active = key === activeAction;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setActiveAction(key); setResult(null); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? 'bg-blue-900/20 text-blue-400 border-blue-500/30'
                    : 'bg-[#0a0b14] text-[#6b7280] border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] hover:text-[#9ca3af]'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic fields */}
        <div className="space-y-3">
          {activeAction === 'search' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Query</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canDispatch() && handleDispatch()}
                  placeholder="e.g. invoice Q3"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Scope (optional)</label>
                <input
                  type="text"
                  value={searchScope}
                  onChange={(e) => setSearchScope(e.target.value)}
                  placeholder="/home/user/documents"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {activeAction === 'read_document' && (
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Path</label>
              <input
                type="text"
                value={docPath}
                onChange={(e) => setDocPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canDispatch() && handleDispatch()}
                placeholder="/home/user/document.pdf"
                className={inputCls}
              />
            </div>
          )}

          {activeAction === 'list_dir' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Path</label>
                <input
                  type="text"
                  value={dirPath}
                  onChange={(e) => setDirPath(e.target.value)}
                  placeholder="/home/user"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Pattern (optional)</label>
                <input
                  type="text"
                  value={dirPattern}
                  onChange={(e) => setDirPattern(e.target.value)}
                  placeholder="*.pdf"
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setDirRecursive(!dirRecursive)}
                  className={`w-9 h-5 rounded-full border transition-colors flex items-center ${
                    dirRecursive
                      ? 'bg-[#3b82f6] border-[#3b82f6]'
                      : 'bg-[#0a0b14] border-[rgba(255,255,255,0.15)]'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${dirRecursive ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-[#9ca3af]">Recursive</span>
              </label>
            </>
          )}

          {activeAction === 'read_clipboard' && (
            <p className="text-xs text-[#6b7280]">Reads the current clipboard content from the remote node.</p>
          )}

          {activeAction === 'list_emails' && (
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Limit</label>
              <input
                type="number"
                value={emailLimit}
                onChange={(e) => setEmailLimit(Math.max(1, parseInt(e.target.value, 10) || 10))}
                min={1}
                max={100}
                className={inputCls}
              />
            </div>
          )}

          {activeAction === 'search_emails' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Query</label>
                <input
                  type="text"
                  value={searchEmailQuery}
                  onChange={(e) => setSearchEmailQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canDispatch() && handleDispatch()}
                  placeholder="invoice unpaid"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Limit</label>
                <input
                  type="number"
                  value={searchEmailLimit}
                  onChange={(e) => setSearchEmailLimit(Math.max(1, parseInt(e.target.value, 10) || 10))}
                  min={1}
                  max={100}
                  className={inputCls}
                />
              </div>
            </>
          )}

          {activeAction === 'read_calendar' && (
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Days ahead</label>
              <input
                type="number"
                value={calDays}
                onChange={(e) => setCalDays(Math.max(1, parseInt(e.target.value, 10) || 7))}
                min={1}
                max={90}
                className={inputCls}
              />
            </div>
          )}

          {activeAction === 'read_contacts' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Search query (optional)</label>
                <input
                  type="text"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="John"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Limit</label>
                <input
                  type="number"
                  value={contactLimit}
                  onChange={(e) => setContactLimit(Math.max(1, parseInt(e.target.value, 10) || 50))}
                  min={1}
                  max={500}
                  className={inputCls}
                />
              </div>
            </>
          )}

          {activeAction === 'shell_exec' && (
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Command</label>
              <input
                type="text"
                value={shellCmd}
                onChange={(e) => setShellCmd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canDispatch() && handleDispatch()}
                placeholder="ls -la /home/user"
                className={`${inputCls} font-mono`}
              />
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleDispatch}
          disabled={!canDispatch()}
          className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:bg-[#3b82f6]/30 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {dispatching && (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {dispatching ? 'Dispatching…' : `Run: ${ACTION_CONFIGS[activeAction].label}`}
        </button>

        {/* Result viewer */}
        {result && <ResultViewer action={activeAction} result={result} />}
      </div>
    </section>
  );
}

// ─── Capabilities card ────────────────────────────────────────────────────────

function CapabilitiesCard({ nodeId }: { nodeId: string }) {
  const [caps, setCaps] = useState<NexusCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getNodeCapabilities(nodeId)
      .then(setCaps)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load capabilities'))
      .finally(() => setLoading(false));
  }, [nodeId]);

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
      <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Capabilities</h2>

      {loading && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-[#1e293b] rounded w-24" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-5 bg-[#1e293b] rounded-full w-16" />)}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {caps && !loading && (
        <div className="space-y-4">
          {/* Platform */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">Platform</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#1e293b] text-[#d1d5db] border border-[rgba(255,255,255,0.07)] font-mono">
              {caps.platform}
            </span>
          </div>

          {/* Providers */}
          {caps.providers.length > 0 && (
            <div>
              <p className="text-xs text-[#6b7280] mb-2">Providers</p>
              <div className="flex flex-wrap gap-1.5">
                {caps.providers.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 rounded-full text-xs border bg-emerald-900/20 text-emerald-400 border-emerald-500/30"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allowed folders */}
          {caps.permissions?.allowedFolders && caps.permissions.allowedFolders.length > 0 && (
            <div>
              <p className="text-xs text-[#6b7280] mb-2">Allowed folders</p>
              <div className="space-y-1">
                {caps.permissions.allowedFolders.map((folder) => (
                  <div key={folder} className="flex items-center gap-1.5 text-xs text-[#d1d5db] font-mono">
                    <span className="text-[#4b5563]">📁</span>
                    {folder}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NexusNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Agent actions
  const [stoppingAgentId, setStoppingAgentId] = useState('');
  const [showCreateAgentDialog, setShowCreateAgentDialog] = useState(false);
  const [poolAgents, setPoolAgents] = useState<Agent[]>([]);

  const activityRef = useRef<HTMLDivElement>(null);

  const fetchNode = useCallback(async () => {
    setError('');
    try {
      const data = await getNode(id);
      setNode(((data as any).node ?? data) as NodeDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load node');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchNode(); }, [fetchNode]);

  // Load pool agents for enterprise nodes (for spawn dropdown)
  useEffect(() => {
    if (node?.mode === 'enterprise') {
      getAgents().then(setPoolAgents).catch(() => {});
    }
  }, [node?.mode]);

  const handleStopAgent = async (agentId: string) => {
    setStoppingAgentId(agentId);
    try {
      await stopNodeAgent(id, agentId);
      fetchNode();
    } catch {
      // silently refresh
      fetchNode();
    } finally {
      setStoppingAgentId('');
    }
  };

  if (loading) return <PageSkeleton />;

  if (error || !node) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-4xl mb-4">🔌</p>
        <h2 className="text-lg font-semibold text-white mb-2">Node not found</h2>
        <p className="text-sm text-[#9ca3af] mb-6">{error || 'This node does not exist or is unreachable.'}</p>
        <Link href="/nexus" className="text-[#3b82f6] hover:underline text-sm">← Back to Nexus</Link>
      </div>
    );
  }

  const agents: NexusAgentStatus[] = node.agents ?? [];
  const activity: ActivityEvent[] = node.recentActivity ?? [];
  const isEnterprise = node.mode === 'enterprise';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <Link href="/nexus" className="text-[#9ca3af] hover:text-white transition-colors">
            ← Nexus
          </Link>
          {isEnterprise && node.clientName && (
            <>
              <span className="text-[#374151]">/</span>
              <span className="text-[#6b7280]">{node.clientName}</span>
            </>
          )}
          <span className="text-[#374151]">/</span>
          <h1 className="text-white font-semibold">{node.name}</h1>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {/* Enterprise client banner */}
      {isEnterprise && node.clientName && (
        <div className="flex items-center gap-3 bg-emerald-900/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <span className="text-emerald-400 text-lg shrink-0">🏢</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400/70 uppercase tracking-wide font-medium">Enterprise Deployment</p>
            <p className="text-sm text-white font-medium truncate">{node.clientName}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 shrink-0">
            Enterprise
          </span>
        </div>
      )}

      {/* Info card */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-4">Node Info</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Node ID</dt>
            <dd className="text-sm text-white font-mono">{node.id}</dd>
          </div>
          {node.ip && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">IP Address</dt>
              <dd className="text-sm text-white font-mono">{node.ip}</dd>
            </div>
          )}
          {node.mode && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Mode</dt>
              <dd className="text-sm text-white capitalize">{node.mode}</dd>
            </div>
          )}
          {node.clientName && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Client</dt>
              <dd className="text-sm text-white">{node.clientName}</dd>
            </div>
          )}
          {node.connectedSince && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-[#6b7280]">Connected since</dt>
              <dd className="text-sm text-white">{formatDate(node.connectedSince)}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-[#6b7280]">Last heartbeat</dt>
            <dd className="text-sm text-white">{timeAgo(node.lastHeartbeat)}</dd>
          </div>
        </dl>
      </section>

      {/* Capabilities */}
      <CapabilitiesCard nodeId={id} />

      {/* ── Agents section ── */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
        {/* Section header */}
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold text-white">
              Agents
              <span className="ml-2 text-xs font-normal text-[#6b7280]">({agents.length})</span>
            </h2>
            {/* Seats progress */}
            {node.seats && (
              <div className="flex items-center gap-2 min-w-[140px]">
                <SeatsBar seats={node.seats} />
                <span className="text-xs text-[#6b7280] whitespace-nowrap">seats</span>
              </div>
            )}
          </div>

          {/* Enterprise actions */}
          {isEnterprise && (
            <div className="flex items-center gap-2 shrink-0">
              <SpawnAgentDropdown
                nodeId={id}
                poolAgents={poolAgents}
                onSpawned={fetchNode}
              />
              <button
                onClick={() => setShowCreateAgentDialog(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Create New Agent
              </button>
            </div>
          )}
        </div>

        {/* Cards grid or empty */}
        {agents.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#6b7280]">
            No agents deployed to this node yet.
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isEnterprise={isEnterprise}
                onStop={handleStopAgent}
                stopping={stoppingAgentId === agent.id}
              />
            ))}
          </div>
        )}

        {/* Local mode note */}
        {!isEnterprise && agents.length > 0 && (
          <p className="px-5 pb-4 text-xs text-[#4b5563]">
            Local node agents are configured at deploy time and are read-only here.
          </p>
        )}
      </section>

      {/* Action dispatch panel (replaces old "Send Task") */}
      <ActionDispatchPanel nodeId={id} />

      {/* Recent activity */}
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No recent activity recorded.</p>
        ) : (
          <div ref={activityRef} className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {activity.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-sm">
                <span className="text-[#4b5563] mt-0.5 shrink-0">•</span>
                <span className="text-[#d1d5db] flex-1">{event.message}</span>
                <span className="text-xs text-[#6b7280] shrink-0 ml-2 whitespace-nowrap">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create agent dialog */}
      {showCreateAgentDialog && (
        <CreateAgentDialog
          nodeId={id}
          onClose={() => setShowCreateAgentDialog(false)}
          onCreated={() => { setShowCreateAgentDialog(false); fetchNode(); }}
        />
      )}
    </div>
  );
}
