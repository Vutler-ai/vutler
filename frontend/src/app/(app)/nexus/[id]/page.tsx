'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  getNode,
  spawnAgent,
  createNodeAgent,
  stopNodeAgent,
  getNodeCapabilities,
  getNodeCommands,
  getNodeCommand,
  queueDispatchAction,
  type CreateNodeAgentDefinition,
} from '@/lib/api/endpoints/nexus';
import {
  createEnterpriseEventSubscription,
  listEnterpriseEventSubscriptions,
  retryEnterpriseEventSubscription,
  updateEnterpriseEventSubscription,
} from '@/lib/api/endpoints/nexus-enterprise';
import { getAgents } from '@/lib/api/endpoints/agents';
import {
  NEXUS_FIRST_COMMAND_PRESETS,
  getNexusFirstCommandPreset,
  type NexusFirstCommandPresetKey,
} from '@/lib/nexus/first-commands';
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
  NexusCommandStatus,
  NexusCommandStats,
  NexusProviderSource,
  NexusDiscoverySnapshot,
  NexusEnterpriseEventSubscription,
  NexusEnterpriseEventSubscriptionProvider,
  NexusEnterpriseProvisioningMode,
} from '@/lib/api/types';

// ─── Local types ──────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
}

interface CommandHistoryResponse {
  commands: NexusCommandStatus[];
  summary: NexusCommandStats | null;
}

interface NodeConsentSourceState {
  enabled: boolean;
  apps: string[];
  actions: string[];
  allowedFolders?: string[];
}

interface NodeConsentState {
  sources: Record<string, NodeConsentSourceState>;
  summary: {
    enabledSources: number;
    enabledApps: number;
    enabledActions: number;
  };
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
  poolAgentIds?: string[];
  providerSources?: Record<string, NexusProviderSource>;
  discoverySnapshot?: NexusDiscoverySnapshot;
  consentState?: NodeConsentState;
}

type NodeDetailResponse = NodeDetail | { node?: NodeDetail };

interface NodeLocalDiagnostic {
  key: string;
  label: string;
  status: 'effective' | 'attention' | 'blocked';
  blocker: 'needs_discovery' | 'denied_consent' | 'missing_app' | 'missing_sync_folder' | 'missing_os_permission' | null;
  reason: string;
  nextAction: string;
  effectiveSource?: string | null;
  consentEnabled: boolean;
  discoveryAvailable: boolean;
}

interface EnhancedNexusCapabilities extends NexusCapabilities {
  consentState?: NodeConsentState;
  discoverySnapshot?: NexusDiscoverySnapshot;
  diagnostics?: NodeLocalDiagnostic[];
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

function formatProviderLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDuration(value?: number): string {
  if (!value || value <= 0) return '—';
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value / 60000)}m`;
}

function describePayload(payload?: Record<string, unknown>): string {
  const action = typeof payload?.action === 'string' ? payload.action : '';
  return action ? formatProviderLabel(action) : '—';
}

function shortId(value?: string | null): string {
  if (!value) return '—';
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function getDiagnosticTone(status: NodeLocalDiagnostic['status']): string {
  if (status === 'effective') return 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30';
  if (status === 'blocked') return 'bg-red-900/20 text-red-300 border-red-500/30';
  return 'bg-amber-900/20 text-amber-300 border-amber-500/30';
}

function getDiagnosticBadgeLabel(blocker: NodeLocalDiagnostic['blocker']): string {
  switch (blocker) {
    case 'denied_consent':
      return 'Consent denied';
    case 'missing_app':
      return 'Missing app';
    case 'missing_sync_folder':
      return 'Missing sync folder';
    case 'missing_os_permission':
      return 'OS permission review';
    case 'needs_discovery':
      return 'Run discovery';
    default:
      return 'Effective';
  }
}

function buildSubscriptionPackage(subscription: NexusEnterpriseEventSubscription) {
  return {
    provider: subscription.provider,
    provisioningMode: subscription.provisioningMode,
    provisioningStatus: subscription.provisioningStatus,
    roomName: subscription.roomName || null,
    sourceResource: subscription.sourceResource || null,
    events: subscription.events || [],
    callbackUrl: subscription.callbackUrl,
    callbackPath: subscription.callbackPath,
    verificationSecret: subscription.verificationSecret,
    externalSubscriptionId: subscription.externalSubscriptionId || null,
    status: subscription.status,
  };
}

function getProvisioningOwner(mode: string, status: string): string {
  if (status === 'provisioned') return 'Vutler';
  if (mode === 'automatic') return 'Vutler';
  if (mode === 'assisted') return 'Partner / Client';
  return 'Client / Partner';
}

function getProvisioningChecklist(subscription: NexusEnterpriseEventSubscription): string[] {
  const common = [
    'Register the callback URL exactly as shown.',
    'Store the verification secret in the provider webhook or subscription config.',
    'Keep the event scope narrow to the room or resource you are monitoring.',
  ];

  if (subscription.provider === 'microsoft_graph') {
    return [
      'Create or reuse the Azure app registration that owns Graph subscriptions.',
      'Grant the Graph permissions needed for the selected room or Teams resource.',
      'Set the notification URL to the callback URL and complete the validation challenge.',
      ...common,
    ];
  }

  if (subscription.provider === 'zoom') {
    return [
      'Open the Zoom admin app or marketplace app used for Room alerts.',
      'Register the callback URL on the event subscription configuration.',
      'Map the webhook to the room or room-alert scope you want to monitor.',
      ...common,
    ];
  }

  if (subscription.provider === 'google') {
    return [
      'Use the customer Workspace project or admin console that owns the watch channel.',
      'Register the callback URL in the Google Workspace watch or push configuration.',
      'Bind the watch to the room calendar or resource identifier listed here.',
      ...common,
    ];
  }

  return [
    'Register the callback URL in the partner or device platform.',
    'Pass the verification secret with each signed event payload.',
    'Validate that the source system posts only the listed events for this room or resource.',
  ];
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

const LOCAL_NEXUS_DISCOVERY_PORTS = [3199, 3200, 3201, 3202] as const;
const LOCAL_NEXUS_LEGACY_PORTS = [3100, 3101, 3102, 3103] as const;

const EVENT_PROVIDER_OPTIONS: Array<{
  value: NexusEnterpriseEventSubscriptionProvider;
  label: string;
  hint: string;
}> = [
  {
    value: 'microsoft_graph',
    label: 'Microsoft Graph',
    hint: 'Teams Rooms, Microsoft 365 calendars, room events',
  },
  {
    value: 'zoom',
    label: 'Zoom',
    hint: 'Zoom Rooms and meeting alert webhooks',
  },
  {
    value: 'google',
    label: 'Google',
    hint: 'Google Workspace and calendar watch events',
  },
  {
    value: 'generic_http',
    label: 'Generic HTTP',
    hint: 'Partner systems posting events to the enterprise webhook',
  },
];

const PROVISIONING_MODE_HINTS: Record<NexusEnterpriseEventSubscriptionProvider, Record<NexusEnterpriseProvisioningMode, string>> = {
  microsoft_graph: {
    manual: 'Manual mode keeps the callback package visible for customer-side Azure setup.',
    assisted: 'Assisted mode generates the callback and payload, then the partner finishes the app registration.',
    automatic: 'Automatic mode attempts the Graph subscription immediately when the tenant credentials are available.',
  },
  zoom: {
    manual: 'Manual mode is safest for Zoom admins and partner-led rollout.',
    assisted: 'Assisted mode prepares the endpoint and tells the partner exactly what to configure in Zoom.',
    automatic: 'Automatic falls back to assisted today because Zoom is not auto-provisioned yet.',
  },
  google: {
    manual: 'Manual mode is recommended when the customer owns the Workspace project.',
    assisted: 'Assisted mode prepares the webhook and watch payload for Google Workspace admins.',
    automatic: 'Automatic falls back to assisted today because Google is not auto-provisioned yet.',
  },
  generic_http: {
    manual: 'Manual mode exposes a stable endpoint and secret for custom systems.',
    assisted: 'Assisted mode prepares the payload and endpoint details for the partner to wire up.',
    automatic: 'Automatic is not available for generic HTTP sources and will behave like manual.',
  },
};

const PROVISIONING_STATUS_STYLES: Record<string, string> = {
  manual_required: 'bg-[#111827] text-[#cbd5e1] border-[rgba(255,255,255,0.1)]',
  assisted_required: 'bg-amber-900/20 text-amber-300 border-amber-500/30',
  pending: 'bg-blue-900/20 text-blue-300 border-blue-500/30',
  provisioned: 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-900/20 text-red-400 border-red-500/30',
};

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-900/20 text-amber-300 border-amber-500/30',
  disabled: 'bg-[#111827] text-[#94a3b8] border-[rgba(255,255,255,0.1)]',
};

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

function ProvisioningModeBadge({ mode }: { mode: string }) {
  const tone = mode === 'automatic'
    ? 'bg-blue-900/20 text-blue-300 border-blue-500/30'
    : mode === 'assisted'
      ? 'bg-amber-900/20 text-amber-300 border-amber-500/30'
      : 'bg-[#111827] text-[#cbd5e1] border-[rgba(255,255,255,0.1)]';

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${tone}`}>
      {mode.replace('_', ' ')}
    </span>
  );
}

function ProvisioningStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${PROVISIONING_STATUS_STYLES[status] || PROVISIONING_STATUS_STYLES.manual_required}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function CopyValueButton({
  value,
  idleLabel,
  copiedLabel = 'Copied',
}: {
  value: string;
  idleLabel: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2.5 py-1.5 rounded-lg text-xs bg-[#111827] hover:bg-[#172033] border border-[rgba(255,255,255,0.08)] text-[#d1d5db] transition-colors"
    >
      {copied ? copiedLabel : idleLabel}
    </button>
  );
}

function DeploymentSubscriptionsSection({
  agents,
}: {
  agents: NexusAgentStatus[];
}) {
  const [subscriptions, setSubscriptions] = useState<NexusEnterpriseEventSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [providerFilter, setProviderFilter] = useState<'all' | NexusEnterpriseEventSubscriptionProvider>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async () => {
    try {
      setError('');
      const next = await listEnterpriseEventSubscriptions();
      setSubscriptions(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    const timer = window.setInterval(loadSubscriptions, 12000);
    return () => window.clearInterval(timer);
  }, [loadSubscriptions]);

  const counts = subscriptions.reduce(
    (acc, subscription) => {
      acc.total += 1;
      acc[subscription.provisioningStatus] = (acc[subscription.provisioningStatus] || 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>
  );
  const filteredSubscriptions = subscriptions.filter((subscription) => {
    if (providerFilter !== 'all' && subscription.provider !== providerFilter) return false;
    if (statusFilter !== 'all' && subscription.provisioningStatus !== statusFilter) return false;
    return true;
  });

  const handleSubscriptionPatch = async (
    subscription: NexusEnterpriseEventSubscription,
    patch: {
      status?: 'active' | 'paused' | 'disabled';
      provisioningMode?: NexusEnterpriseProvisioningMode;
    }
  ) => {
    setSavingId(subscription.id);
    try {
      const updated = await updateEnterpriseEventSubscription(subscription.id, patch);
      setSubscriptions((current) => current.map((item) => (item.id === subscription.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update event subscription');
    } finally {
      setSavingId(null);
    }
  };

  const handleSubscriptionRetry = async (subscription: NexusEnterpriseEventSubscription) => {
    setRetryingId(subscription.id);
    try {
      const updated = await retryEnterpriseEventSubscription(subscription.id, {
        provisioningMode: subscription.provisioningMode,
      });
      setSubscriptions((current) => current.map((item) => (item.id === subscription.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry event subscription');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Deployment Event Subscriptions</h2>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Workspace-level subscriptions for room alerts, Graph callbacks, and partner-managed AV event flows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="px-3 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Prepare Subscription
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Provider filter</label>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as 'all' | NexusEnterpriseEventSubscriptionProvider)}
              className="min-w-[180px] bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
            >
              <option value="all">All providers</option>
              {EVENT_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Provisioning state</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-w-[180px] bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
            >
              <option value="all">All states</option>
              <option value="manual_required">Manual required</option>
              <option value="assisted_required">Assisted required</option>
              <option value="pending">Pending</option>
              <option value="provisioned">Provisioned</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="text-xs text-[#6b7280] pb-1">
            Showing {filteredSubscriptions.length} of {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-xs text-[#6b7280]">Total</p>
            <p className="text-lg font-semibold text-white mt-1">{counts.total || 0}</p>
          </div>
          <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-xs text-[#6b7280]">Provisioned</p>
            <p className="text-lg font-semibold text-emerald-400 mt-1">{counts.provisioned || 0}</p>
          </div>
          <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-xs text-[#6b7280]">Needs Partner</p>
            <p className="text-lg font-semibold text-amber-300 mt-1">
              {(counts.manual_required || 0) + (counts.assisted_required || 0)}
            </p>
          </div>
          <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-xs text-[#6b7280]">Failed Auto-Provision</p>
            <p className="text-lg font-semibold text-red-400 mt-1">{counts.failed || 0}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.08)] px-4 py-3">
          <p className="text-xs text-[#93c5fd] uppercase tracking-wide font-medium">Provisioning model</p>
          <p className="text-sm text-[#dbeafe] mt-1">
            Use <span className="font-medium text-white">manual</span> or <span className="font-medium text-white">assisted</span> when the customer or partner owns the tenant setup.
            Use <span className="font-medium text-white">automatic</span> only when Vutler has the credentials and the provider supports direct provisioning.
          </p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-20 rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)]"
              />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : subscriptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] px-4 py-8 text-center">
            <p className="text-sm text-white">No event subscriptions prepared yet.</p>
            <p className="text-xs text-[#6b7280] mt-1">
              Start with Graph, Zoom, Google, or a partner webhook endpoint for room incidents.
            </p>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] px-4 py-8 text-center">
            <p className="text-sm text-white">No subscriptions match the current filters.</p>
            <p className="text-xs text-[#6b7280] mt-1">
              Change provider or provisioning-state filters to inspect the full deployment queue.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubscriptions.map((subscription) => {
              const linkedAgent = agents.find((agent) => agent.id === subscription.agentId);
              const registrationPackage = JSON.stringify(buildSubscriptionPackage(subscription), null, 2);
              const checklist = getProvisioningChecklist(subscription);
              return (
                <div
                  key={subscription.id}
                  className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-white font-medium">
                          {subscription.roomName || subscription.sourceResource || 'Unscoped subscription'}
                        </p>
                        <span className="px-2 py-0.5 rounded-full text-xs border bg-[#111827] text-[#cbd5e1] border-[rgba(255,255,255,0.1)]">
                          {formatProviderLabel(subscription.provider)}
                        </span>
                        <ProvisioningModeBadge mode={subscription.provisioningMode} />
                        <ProvisioningStatusBadge status={subscription.provisioningStatus} />
                      </div>
                      <p className="text-xs text-[#6b7280] mt-1">
                        {linkedAgent?.name || subscription.agentId || subscription.profileKey || 'Deployment-level subscription'}
                        {' · '}
                        status {subscription.status}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${SUBSCRIPTION_STATUS_STYLES[subscription.status] || SUBSCRIPTION_STATUS_STYLES.active}`}>
                      {subscription.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Resource</p>
                      <p className="text-[#d1d5db] break-all">{subscription.sourceResource || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">Events</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(subscription.events || []).length > 0 ? subscription.events.map((event) => (
                          <span
                            key={`${subscription.id}-${event}`}
                            className="px-2 py-0.5 rounded-full text-xs border bg-blue-900/20 text-blue-300 border-blue-500/30"
                          >
                            {event}
                          </span>
                        )) : (
                          <span className="text-[#6b7280]">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-1">External ID</p>
                      <p className="text-[#d1d5db] font-mono">{shortId(subscription.externalSubscriptionId)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-[#6b7280] uppercase tracking-wide">Status</label>
                      <select
                        value={subscription.status}
                        onChange={(event) => handleSubscriptionPatch(subscription, { status: event.target.value as 'active' | 'paused' | 'disabled' })}
                        disabled={savingId === subscription.id}
                        className="w-full bg-[#05060d] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-60"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-[#6b7280] uppercase tracking-wide">Provisioning mode</label>
                      <select
                        value={subscription.provisioningMode}
                        onChange={(event) => handleSubscriptionPatch(subscription, { provisioningMode: event.target.value as NexusEnterpriseProvisioningMode })}
                        disabled={savingId === subscription.id}
                        className="w-full bg-[#05060d] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-60"
                      >
                        <option value="manual">Manual</option>
                        <option value="assisted">Assisted</option>
                        <option value="automatic">Automatic</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-[#6b7280] uppercase tracking-wide">Operator action</label>
                      <button
                        type="button"
                        onClick={() => handleSubscriptionRetry(subscription)}
                        disabled={retryingId === subscription.id}
                        className="w-full px-3 py-2 rounded-lg bg-[#111827] hover:bg-[#172033] border border-[rgba(255,255,255,0.08)] text-sm text-white transition-colors disabled:opacity-60"
                      >
                        {retryingId === subscription.id ? 'Retrying…' : 'Retry provisioning'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-[#05060d] border border-[rgba(255,255,255,0.06)] p-3">
                      <p className="text-[#6b7280] uppercase tracking-wide mb-1">Callback URL</p>
                      <p className="text-[#d1d5db] font-mono break-all">{subscription.callbackUrl}</p>
                      <div className="mt-3">
                        <CopyValueButton value={subscription.callbackUrl} idleLabel="Copy URL" />
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#05060d] border border-[rgba(255,255,255,0.06)] p-3">
                      <p className="text-[#6b7280] uppercase tracking-wide mb-1">Verification Secret</p>
                      <p className="text-[#d1d5db] font-mono break-all">{subscription.verificationSecret}</p>
                      <div className="mt-3">
                        <CopyValueButton value={subscription.verificationSecret} idleLabel="Copy Secret" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#05060d] border border-[rgba(255,255,255,0.06)] p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[#6b7280] uppercase tracking-wide mb-1 text-xs">Provisioning package</p>
                        <p className="text-sm text-[#d1d5db]">
                          Owner: <span className="text-white font-medium">{getProvisioningOwner(subscription.provisioningMode, subscription.provisioningStatus)}</span>
                        </p>
                      </div>
                      <CopyValueButton value={registrationPackage} idleLabel="Copy Package JSON" copiedLabel="Package copied" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-2">Next steps</p>
                        <ul className="space-y-1.5 text-sm text-[#d1d5db]">
                          {checklist.map((item) => (
                            <li key={`${subscription.id}-${item}`} className="flex gap-2">
                              <span className="text-[#3b82f6] shrink-0">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs text-[#6b7280] uppercase tracking-wide mb-2">Package preview</p>
                        <pre className="text-[11px] leading-5 text-[#cbd5e1] bg-[#02040a] border border-[rgba(255,255,255,0.04)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
{registrationPackage}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {(subscription.provisioningError || subscription.provisioningStatus === 'manual_required' || subscription.provisioningStatus === 'assisted_required') && (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${
                      subscription.provisioningError
                        ? 'bg-red-900/10 border-red-500/20 text-red-300'
                        : 'bg-amber-900/10 border-amber-500/20 text-amber-200'
                    }`}>
                      {subscription.provisioningError
                        ? subscription.provisioningError
                        : subscription.provisioningStatus === 'assisted_required'
                          ? 'Partner action required: use the callback URL and secret above to finish provider-side setup.'
                          : 'Customer or partner needs to register this webhook manually on the target platform.'}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-[#6b7280]">
                    <span>Created {formatDateTime(subscription.createdAt)}</span>
                    <span>
                      Last event {subscription.lastEventAt ? formatDateTime(subscription.lastEventAt) : 'not received yet'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateDialog && (
        <CreateEventSubscriptionDialog
          agents={agents}
          onClose={() => setShowCreateDialog(false)}
          onCreated={(subscription) => {
            setShowCreateDialog(false);
            setSubscriptions((current) => [subscription, ...current]);
          }}
        />
      )}
    </section>
  );
}

function CreateEventSubscriptionDialog({
  agents,
  onClose,
  onCreated,
}: {
  agents: NexusAgentStatus[];
  onClose: () => void;
  onCreated: (subscription: NexusEnterpriseEventSubscription) => void;
}) {
  const [provider, setProvider] = useState<NexusEnterpriseEventSubscriptionProvider>('microsoft_graph');
  const [provisioningMode, setProvisioningMode] = useState<NexusEnterpriseProvisioningMode>('assisted');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [sourceResource, setSourceResource] = useState('');
  const [eventsInput, setEventsInput] = useState('created,updated');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const providerHint = EVENT_PROVIDER_OPTIONS.find((item) => item.value === provider)?.hint || '';
  const modeHint = PROVISIONING_MODE_HINTS[provider][provisioningMode];

  useEffect(() => {
    if (provider === 'microsoft_graph' && provisioningMode === 'manual') return;
    if (provider === 'microsoft_graph') {
      setProvisioningMode('assisted');
      return;
    }
    if ((provider === 'zoom' || provider === 'google') && provisioningMode === 'automatic') {
      setProvisioningMode('assisted');
      return;
    }
    if (provider === 'generic_http' && provisioningMode === 'automatic') {
      setProvisioningMode('manual');
    }
  }, [provider, provisioningMode]);

  const handleSubmit = async () => {
    const events = eventsInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!roomName.trim() && !sourceResource.trim()) {
      setError('Add at least a room name or a source resource.');
      return;
    }

    if ((provider === 'microsoft_graph' || provider === 'zoom' || provider === 'google') && !sourceResource.trim()) {
      setError('Source resource is required for provider-backed subscriptions.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const subscription = await createEnterpriseEventSubscription({
        provider,
        agentId: selectedAgentId || undefined,
        profileKey: selectedAgent?.profileKey || undefined,
        subscriptionType: 'room_event',
        roomName: roomName.trim() || undefined,
        sourceResource: sourceResource.trim() || undefined,
        events,
        status: 'active',
        deliveryMode: 'manual',
        provisioningMode,
      });
      onCreated(subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare event subscription');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-2xl mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-white font-semibold text-lg">Prepare Event Subscription</h2>
            <p className="text-sm text-[#6b7280] mt-1">
              Generate the callback package now, then let Vutler, the partner, or the customer finish provider-side setup.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Provider</label>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as NexusEnterpriseEventSubscriptionProvider)}
              className={inputCls}
            >
              {EVENT_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-[#6b7280]">{providerHint}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Linked agent</label>
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className={inputCls}
            >
              <option value="">Deployment-level subscription</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}{agent.profileKey ? ` · ${agent.profileKey}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-[#6b7280]">
              Attach this webhook to an AV or IT agent when you want clear ownership.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Provisioning mode</label>
            <select
              value={provisioningMode}
              onChange={(event) => setProvisioningMode(event.target.value as NexusEnterpriseProvisioningMode)}
              className={inputCls}
            >
              <option value="manual">Manual</option>
              <option value="assisted">Assisted</option>
              <option value="automatic">Automatic</option>
            </select>
            <p className="text-xs text-[#6b7280]">{modeHint}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Room name</label>
            <input
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Zurich Boardroom A"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Source resource</label>
            <input
              type="text"
              value={sourceResource}
              onChange={(event) => setSourceResource(event.target.value)}
              placeholder={provider === 'microsoft_graph'
                ? '/communications/callRecords'
                : provider === 'zoom'
                  ? 'room-alerts/zurich-boardroom-a'
                  : provider === 'google'
                    ? 'calendar-room-a@company.com'
                    : 'https://partner.example.com/webhooks/room-a'}
              className={inputCls}
            />
            <p className="text-xs text-[#6b7280]">
              Use the provider resource identifier or the room-level endpoint used by the partner system.
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Events</label>
            <input
              type="text"
              value={eventsInput}
              onChange={(event) => setEventsInput(event.target.value)}
              placeholder="created,updated,deleted"
              className={inputCls}
            />
            <p className="text-xs text-[#6b7280]">
              Comma-separated event names. Keep the list narrow for dangerous or noisy room signals.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] p-4 space-y-2">
          <p className="text-xs text-[#9ca3af] uppercase tracking-wide">What happens next</p>
          <ul className="space-y-1 text-sm text-[#d1d5db]">
            <li>Vutler creates a callback URL and verification secret for this deployment.</li>
            <li>The subscription is stored immediately with a provisioning status you can track from the node page.</li>
            <li>
              {provider === 'microsoft_graph' && provisioningMode === 'automatic'
                ? 'Vutler attempts Graph provisioning right away and falls back with an explicit error if the tenant setup is incomplete.'
                : 'The partner or customer can finish provider-side registration using the generated callback package.'}
            </li>
          </ul>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? 'Preparing…' : 'Prepare Subscription'}
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

  const data = (result.data ?? null) as Record<string, unknown> | null;
  if (!data) return null;

  if (action === 'search') {
    const results = Array.isArray(data.results) ? (data.results as NexusSearchResult[]) : [];
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
    const entries = Array.isArray(data.entries)
      ? (data.entries as Array<{ name: string; type: string; size?: number }>)
      : [];
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
    const emails = Array.isArray(data.emails) ? (data.emails as NexusEmailResult[]) : [];
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
    const events = Array.isArray(data.events) ? (data.events as NexusCalendarEvent[]) : [];
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
    const contacts = Array.isArray(data.contacts) ? (data.contacts as NexusContact[]) : [];
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
    const shellData = data as unknown as NexusShellResult;
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
    const docData = data as unknown as NexusDocumentResult;
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
    const clipContent = typeof data.content === 'string' ? data.content : '';
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

function ActionDispatchPanel({
  nodeId,
  onCommandSettled,
}: {
  nodeId: string;
  onCommandSettled?: () => void;
}) {
  const [activeAction, setActiveAction] = useState<ActionType>('list_dir');
  const [dispatching, setDispatching] = useState(false);
  const [result, setResult] = useState<NexusDispatchResult | null>(null);
  const [command, setCommand] = useState<NexusCommandStatus<NexusDispatchResult> | null>(null);
  const [commandError, setCommandError] = useState('');

  // Per-action form state
  const [searchQuery, setSearchQuery] = useState('report');
  const [searchScope, setSearchScope] = useState('');
  const [docPath, setDocPath] = useState('');
  const [dirPath, setDirPath] = useState('~/Desktop');
  const [dirRecursive, setDirRecursive] = useState(false);
  const [dirPattern, setDirPattern] = useState('');
  const [emailLimit, setEmailLimit] = useState(10);
  const [searchEmailQuery, setSearchEmailQuery] = useState('');
  const [searchEmailLimit, setSearchEmailLimit] = useState(10);
  const [calDays, setCalDays] = useState(7);
  const [contactQuery, setContactQuery] = useState('');
  const [contactLimit, setContactLimit] = useState(50);
  const [shellCmd, setShellCmd] = useState('pwd');
  const ACTION_KEYS = Object.keys(ACTION_CONFIGS) as ActionType[];

  const canDispatch = (): boolean => {
    if (dispatching) return false;
    switch (activeAction) {
      case 'search': return searchQuery.trim().length > 0;
      case 'read_document': return docPath.trim().length > 0;
      case 'list_dir': return dirPath.trim().length > 0;
      case 'read_clipboard': return true;
      case 'list_emails': return true;
      case 'search_emails': return searchEmailQuery.trim().length > 0;
      case 'read_calendar': return true;
      case 'read_contacts': return true;
      case 'shell_exec': return shellCmd.trim().length > 0;
      default: return false;
    }
  };

  const handleDispatch = async () => {
    setDispatching(true);
    setResult(null);
    setCommand(null);
    setCommandError('');
    try {
      let queued: NexusCommandStatus<NexusDispatchResult>;
      switch (activeAction) {
        case 'search':
          queued = await queueDispatchAction(nodeId, 'search', { query: searchQuery, scope: searchScope || undefined });
          break;
        case 'read_document':
          queued = await queueDispatchAction(nodeId, 'read_document', { path: docPath });
          break;
        case 'list_dir':
          queued = await queueDispatchAction(nodeId, 'list_dir', { path: dirPath, recursive: dirRecursive, pattern: dirPattern || undefined });
          break;
        case 'read_clipboard':
          queued = await queueDispatchAction(nodeId, 'read_clipboard', {});
          break;
        case 'list_emails':
          queued = await queueDispatchAction(nodeId, 'list_emails', { limit: emailLimit });
          break;
        case 'search_emails':
          queued = await queueDispatchAction(nodeId, 'search_emails', { query: searchEmailQuery, limit: searchEmailLimit });
          break;
        case 'read_calendar':
          queued = await queueDispatchAction(nodeId, 'read_calendar', { days: calDays });
          break;
        case 'read_contacts':
          queued = await queueDispatchAction(nodeId, contactQuery ? 'search_contacts' : 'read_contacts', { query: contactQuery || undefined, limit: contactLimit });
          break;
        case 'shell_exec':
          queued = await queueDispatchAction(nodeId, 'shell_exec', { command: shellCmd });
          break;
        default:
          throw new Error('Unknown action');
      }
      setCommand(queued);
    } catch (err) {
      setResult({
        taskId: '',
        status: 'error',
        error: err instanceof Error ? err.message : 'Dispatch failed',
      });
      setDispatching(false);
    }
  };

  useEffect(() => {
    if (!command?.id) return undefined;
    if (!['queued', 'in_progress'].includes(command.status)) return undefined;

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await getNodeCommand<NexusDispatchResult>(nodeId, command.id);
        if (cancelled) return;
        setCommand(next);

        if (next.status === 'completed') {
          setResult(next.result || { taskId: next.id, status: 'completed', data: null });
          setDispatching(false);
          onCommandSettled?.();
        } else if (next.status === 'failed' || next.status === 'expired') {
          setResult(next.result || {
            taskId: next.id,
            status: 'error',
            error: next.error || 'Dispatch failed',
          });
          setDispatching(false);
          onCommandSettled?.();
        }
      } catch (err) {
        if (cancelled) return;
        setCommandError(err instanceof Error ? err.message : 'Failed to read command status');
      }
    };

    poll();
    const timer = window.setInterval(poll, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nodeId, command?.id, command?.status, onCommandSettled]);

  const progressMessage = (() => {
    if (!command) return '';
    if (command.progress?.message) return command.progress.message;
    if (command.status === 'queued') return 'Queued in Nexus command channel';
    if (command.status === 'in_progress') return 'Command is running on the node';
    return '';
  })();

  const progressStage = command?.progress?.stage || (
    command?.status === 'queued'
      ? 'queued'
      : command?.status === 'in_progress'
        ? 'running'
        : ''
  );

  const currentActionLabel = ACTION_CONFIGS[activeAction].label;

  const clearResults = () => {
    setResult(null);
    setCommand(null);
    setCommandError('');
  };

  const selectAction = (key: ActionType) => {
    setActiveAction(key);
    clearResults();
  };

  const applyQuickAction = (presetKey: NexusFirstCommandPresetKey) => {
    clearResults();
    const preset = getNexusFirstCommandPreset(presetKey);
    switch (preset.action) {
      case 'list_dir':
        setActiveAction('list_dir');
        setDirPath(preset.value);
        setDirPattern('');
        setDirRecursive(false);
        break;
      case 'search':
        setActiveAction('search');
        setSearchQuery(preset.value);
        setSearchScope('~/Documents');
        break;
      case 'read_clipboard':
        setActiveAction('read_clipboard');
        break;
      case 'shell_exec':
        setActiveAction('shell_exec');
        setShellCmd(preset.value);
        break;
    }
  };

  const activeCommandId = command?.id || result?.taskId || '';

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
        <h2 className="text-sm font-semibold text-white">Dispatch Action</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">Start with one concrete local action, then switch to the typed command you need</p>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <p className="text-xs text-[#9ca3af] uppercase tracking-wide mb-2">First Commands</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {NEXUS_FIRST_COMMAND_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyQuickAction(preset.key)}
                className="text-left rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] hover:border-blue-500/30 hover:bg-blue-900/10 px-3 py-3 transition-colors"
              >
                <p className="text-sm text-white font-medium">{preset.title}</p>
                <p className="text-xs text-[#6b7280] mt-1">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Action type tabs */}
        <div className="flex flex-wrap gap-1.5">
          {ACTION_KEYS.map((key) => {
            const cfg = ACTION_CONFIGS[key];
            const active = key === activeAction;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectAction(key)}
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
          {dispatching ? `Running: ${currentActionLabel}` : `Run: ${currentActionLabel}`}
        </button>

        {command && (
          <div className="rounded-xl border border-[rgba(59,130,246,0.28)] bg-[rgba(59,130,246,0.08)] p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-[#93c5fd] uppercase tracking-wide font-medium">Live Command</p>
                <p className="text-sm text-white font-medium">{command.type}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs border border-blue-500/30 bg-blue-900/20 text-blue-300">
                {command.status.replace('_', ' ')}
              </span>
            </div>
            {progressMessage && (
              <div className="space-y-1">
                <p className="text-sm text-[#dbeafe]">{progressMessage}</p>
                <div className="flex items-center gap-2 text-xs text-[#93c5fd]">
                  <span className="font-mono">{progressStage || 'running'}</span>
                  {command.progress?.elapsedMs !== undefined && (
                    <span>{Math.round(command.progress.elapsedMs / 1000)}s</span>
                  )}
                  <span className="font-mono break-all">{activeCommandId}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {commandError && (
          <p className="text-xs text-amber-400">{commandError}</p>
        )}

        {/* Result viewer */}
        {result && <ResultViewer action={activeAction} result={result} />}
      </div>
    </section>
  );
}

// ─── Capabilities card ────────────────────────────────────────────────────────

function CapabilitiesCard({ nodeId, node }: { nodeId: string; node: NodeDetail }) {
  const [caps, setCaps] = useState<EnhancedNexusCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getNodeCapabilities(nodeId)
      .then((result) => setCaps(result as EnhancedNexusCapabilities))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load capabilities'))
      .finally(() => setLoading(false));
  }, [nodeId]);

  const diagnostics = caps?.diagnostics || [];

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

          {caps.providerSources && Object.keys(caps.providerSources).length > 0 && (
            <div>
              <p className="text-xs text-[#6b7280] mb-1">Effective runtime sources</p>
              <p className="text-[11px] text-[#4b5563] mb-2">
                Each capability uses one effective source at runtime. Fallbacks remain available if the primary source becomes unavailable.
              </p>
              <div className="space-y-2">
                {Object.entries(caps.providerSources).map(([provider, source]) => (
                  <div
                    key={provider}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#0a0b14] border border-[rgba(255,255,255,0.07)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white">{formatProviderLabel(provider)}</p>
                      <p className="text-xs text-[#6b7280]">
                        Active: {formatProviderLabel(source.active)}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs border bg-blue-900/20 text-blue-300 border-blue-500/30">
                        Primary: {formatProviderLabel(source.active)}
                      </span>
                      {source.fallbacks.map((fallback) => (
                        <span
                          key={`${provider}-${fallback}`}
                          className="px-2 py-0.5 rounded-full text-xs border bg-[#111827] text-[#9ca3af] border-[rgba(255,255,255,0.08)]"
                        >
                          Fallback: {formatProviderLabel(fallback)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#6b7280] mb-1">Local readiness diagnostics</p>
                <p className="text-[11px] text-[#4b5563]">
                  This combines discovery, consent, and the effective local runtime path in one place.
                </p>
              </div>
              <span className="text-[11px] text-[#6b7280]">
                {node.discoverySnapshot?.persistedAt
                  ? `Snapshot ${formatDateTime(node.discoverySnapshot.persistedAt)}`
                  : 'No stored snapshot'}
              </span>
            </div>

            {diagnostics.length === 0 ? (
              <div className="mt-3 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
                Run discovery to classify local blockers and remediation hints.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {diagnostics.map((diagnostic) => (
                  <div
                    key={diagnostic.key}
                    className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white">{diagnostic.label}</p>
                        <p className="mt-1 text-xs text-[#6b7280]">{diagnostic.reason}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border whitespace-nowrap ${getDiagnosticTone(diagnostic.status)}`}>
                        {getDiagnosticBadgeLabel(diagnostic.blocker)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        diagnostic.consentEnabled
                          ? 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-[#111827] text-[#9ca3af] border-[rgba(255,255,255,0.08)]'
                      }`}>
                        Consent: {diagnostic.consentEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        diagnostic.discoveryAvailable
                          ? 'bg-blue-900/20 text-blue-300 border-blue-500/30'
                          : 'bg-[#111827] text-[#9ca3af] border-[rgba(255,255,255,0.08)]'
                      }`}>
                        Discovery: {diagnostic.discoveryAvailable ? 'Ready' : 'Missing'}
                      </span>
                      {diagnostic.effectiveSource && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] border bg-violet-900/20 text-violet-200 border-violet-500/30">
                          Effective source: {formatProviderLabel(diagnostic.effectiveSource)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#11131d] px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Next action</p>
                      <p className="mt-1 text-xs text-[#d1d5db]">{diagnostic.nextAction}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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

          {caps.permissions?.allowedActions && caps.permissions.allowedActions.length > 0 && (
            <div>
              <p className="text-xs text-[#6b7280] mb-2">Allowed actions</p>
              <div className="flex flex-wrap gap-1.5">
                {caps.permissions.allowedActions.map((action) => (
                  <code
                    key={action}
                    className="px-2 py-0.5 rounded-full text-xs border bg-amber-900/20 text-amber-300 border-amber-500/30"
                  >
                    {action}
                  </code>
                ))}
              </div>
            </div>
          )}

          {caps.permissions && (!caps.permissions.allowedFolders?.length && !caps.permissions.allowedActions?.length) && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
              No local ACL restrictions are currently reported for this node.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DiscoverySnapshotCard({
  node,
  onDiscoveryUpdated,
}: {
  node: NodeDetail;
  onDiscoveryUpdated?: () => void;
}) {
  const snapshot = node.discoverySnapshot || null;
  const [command, setCommand] = useState<NexusCommandStatus<NexusDispatchResult<{ snapshot: NexusDiscoverySnapshot }>> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!command?.id) return undefined;
    if (!['queued', 'in_progress'].includes(command.status)) return undefined;

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await getNodeCommand<NexusDispatchResult<{ snapshot: NexusDiscoverySnapshot }>>(node.id, command.id);
        if (cancelled) return;
        setCommand(next);

        if (next.status === 'completed') {
          setRunning(false);
          setError('');
          onDiscoveryUpdated?.();
        } else if (next.status === 'failed' || next.status === 'expired') {
          setRunning(false);
          setError(next.error || 'Discovery run failed');
          onDiscoveryUpdated?.();
        }
      } catch (err) {
        if (cancelled) return;
        setRunning(false);
        setError(err instanceof Error ? err.message : 'Failed to read discovery status');
      }
    };

    poll();
    const timer = window.setInterval(poll, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [command?.id, command?.status, node.id, onDiscoveryUpdated]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    try {
      const queued = await queueDispatchAction(node.id, 'discover_local_runtime', {});
      setCommand(queued as NexusCommandStatus<NexusDispatchResult<{ snapshot: NexusDiscoverySnapshot }>>);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : 'Failed to start discovery run');
    }
  };

  const providerEntries = snapshot
    ? Object.entries(snapshot.providers).sort(([left], [right]) => left.localeCompare(right))
    : [];

  const latestCollectedAt = snapshot?.persistedAt || snapshot?.collectedAt;
  const progressMessage = command?.progress?.message
    || (command?.status === 'queued'
      ? 'Discovery queued in the Nexus command channel'
      : command?.status === 'in_progress'
        ? 'Discovery is running on the client machine'
        : '');

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Discovery</h2>
          <p className="text-xs text-[#6b7280] mt-1">
            Inspect installed apps, synced folders, and local provider readiness on this client machine.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || node.status !== 'online'}
          className="px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0a0b14] text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#3b82f6] transition-colors"
        >
          {running ? 'Running discovery…' : 'Run discovery'}
        </button>
      </div>

      {node.status !== 'online' && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          The node is offline. Bring it back online before launching a new discovery run.
        </div>
      )}

      {progressMessage && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
          {progressMessage}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {!snapshot && (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0a0b14] px-4 py-5 text-sm text-[#6b7280]">
          No discovery snapshot has been captured for this node yet.
        </div>
      )}

      {snapshot && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Platform</p>
              <p className="mt-1 text-sm text-white">{formatProviderLabel(snapshot.platform)}</p>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Apps</p>
              <p className="mt-1 text-sm text-white">{snapshot.summary.detectedApps}</p>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Synced folders</p>
              <p className="mt-1 text-sm text-white">{snapshot.summary.syncedFolders}</p>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Ready providers</p>
              <p className="mt-1 text-sm text-white">
                {snapshot.summary.readyProviders}/{snapshot.summary.totalProviders}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b7280]">
            {snapshot.hostname && <span>Host: <span className="text-[#d1d5db]">{snapshot.hostname}</span></span>}
            {latestCollectedAt && <span>Last run: <span className="text-[#d1d5db]">{formatDateTime(latestCollectedAt)}</span></span>}
          </div>

          <div>
            <p className="text-xs text-[#6b7280] mb-2">Local provider readiness</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {providerEntries.map(([provider, state]) => (
                <div
                  key={provider}
                  className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-white">{formatProviderLabel(provider)}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        state.available
                          ? 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-red-900/20 text-red-300 border-red-500/30'
                      }`}
                    >
                      {state.available ? 'Ready' : 'Unavailable'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#9ca3af]">
                    Source: {formatProviderLabel(state.source)}
                  </p>
                  <p className="mt-1 text-xs text-[#6b7280]">{state.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#6b7280] mb-2">Detected apps</p>
              {snapshot.detectedApps.length === 0 ? (
                <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
                  No known desktop apps were detected by the current probe.
                </div>
              ) : (
                <div className="space-y-2">
                  {snapshot.detectedApps.map((app) => (
                    <div
                      key={`${app.key}-${app.location || app.label}`}
                      className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2"
                    >
                      <p className="text-sm text-white">{app.label}</p>
                      {app.location && <p className="mt-1 text-xs text-[#6b7280] font-mono break-all">{app.location}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-[#6b7280] mb-2">Synced folders</p>
              {snapshot.syncedFolders.length === 0 ? (
                <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
                  No common synced folders were detected on this machine.
                </div>
              ) : (
                <div className="space-y-2">
                  {snapshot.syncedFolders.map((folder) => (
                    <div
                      key={`${folder.key}-${folder.path}`}
                      className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2"
                    >
                      <p className="text-sm text-white">{folder.label}</p>
                      <p className="mt-1 text-xs text-[#6b7280] font-mono break-all">{folder.path}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ConsentStateCard({ consentState }: { consentState?: NodeConsentState | null }) {
  const sourceEntries = consentState
    ? Object.entries(consentState.sources).filter(([, source]) => source.enabled || source.apps.length || source.actions.length || source.allowedFolders?.length)
    : [];

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Consent state</h2>
        <p className="text-xs text-[#6b7280] mt-1">
          Effective local consent grouped by source, app, and runtime action.
        </p>
      </div>

      {!consentState && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
          This node has not reported a structured local consent state yet.
        </div>
      )}

      {consentState && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Sources</p>
              <p className="mt-1 text-sm text-white">{consentState.summary.enabledSources}</p>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Apps</p>
              <p className="mt-1 text-sm text-white">{consentState.summary.enabledApps}</p>
            </div>
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[#6b7280]">Actions</p>
              <p className="mt-1 text-sm text-white">{consentState.summary.enabledActions}</p>
            </div>
          </div>

          {sourceEntries.length === 0 ? (
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2 text-xs text-[#6b7280]">
              No enabled local consent sources are currently reported.
            </div>
          ) : (
            <div className="space-y-3">
              {sourceEntries.map(([sourceKey, source]) => (
                <div
                  key={sourceKey}
                  className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] p-3 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{formatProviderLabel(sourceKey)}</p>
                      <p className="text-xs text-[#6b7280]">
                        {source.enabled ? 'Enabled for local runtime use' : 'Configured but currently disabled'}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                      source.enabled
                        ? 'bg-emerald-900/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-[#111827] text-[#9ca3af] border-[rgba(255,255,255,0.08)]'
                    }`}>
                      {source.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[#6b7280] mb-2">Apps</p>
                      <div className="flex flex-wrap gap-1.5">
                        {source.apps.length === 0 ? (
                          <span className="text-xs text-[#6b7280]">No local apps selected</span>
                        ) : (
                          source.apps.map((app) => (
                            <code
                              key={app}
                              className="px-2 py-0.5 rounded-full text-xs border bg-blue-900/20 text-blue-200 border-blue-500/30"
                            >
                              {app}
                            </code>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[#6b7280] mb-2">Actions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {source.actions.length === 0 ? (
                          <span className="text-xs text-[#6b7280]">No runtime actions selected</span>
                        ) : (
                          source.actions.map((action) => (
                            <code
                              key={action}
                              className="px-2 py-0.5 rounded-full text-xs border bg-amber-900/20 text-amber-200 border-amber-500/30"
                            >
                              {action}
                            </code>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {source.allowedFolders && source.allowedFolders.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[#6b7280] mb-2">Folders</p>
                      <div className="space-y-1">
                        {source.allowedFolders.map((folder) => (
                          <div key={folder} className="text-xs text-[#d1d5db] font-mono break-all">
                            {folder}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RuntimeObservabilityCard({
  summary,
  commands,
}: {
  summary: NexusCommandStats | null;
  commands: NexusCommandStatus[];
}) {
  const summaryItems = summary ? [
    { label: 'Queued', value: summary.queued, tone: 'text-amber-400' },
    { label: 'Running', value: summary.inProgress, tone: 'text-blue-300' },
    { label: 'Completed 24h', value: summary.completed24h, tone: 'text-emerald-400' },
    { label: 'Failed 24h', value: summary.failed24h + summary.expired24h, tone: 'text-red-400' },
  ] : [];

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Runtime Observability</h2>
          <p className="text-xs text-[#6b7280] mt-0.5">Command queue health, retries, timing, and latest executions</p>
        </div>
        {summary && (
          <span className="text-xs text-[#6b7280]">Avg completion {formatDuration(summary.avgDurationMs)}</span>
        )}
      </div>

      {summaryItems.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
              <p className="text-xs text-[#6b7280]">{item.label}</p>
              <p className={`text-lg font-semibold mt-1 ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {commands.length === 0 ? (
        <p className="text-sm text-[#6b7280]">No commands recorded for this node yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#6b7280] text-xs uppercase tracking-wide border-b border-[rgba(255,255,255,0.07)]">
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 pr-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((entry) => (
                <tr key={entry.id} className="border-b border-[rgba(255,255,255,0.05)] last:border-0 align-top">
                  <td className="py-3 pr-3">
                    <p className="text-white font-medium">{entry.type}</p>
                    <p className="text-[11px] text-[#6b7280] font-mono break-all">{entry.id}</p>
                  </td>
                  <td className="py-3 pr-3 text-[#d1d5db]">{describePayload(entry.payload)}</td>
                  <td className="py-3 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      entry.status === 'completed'
                        ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
                        : entry.status === 'failed' || entry.status === 'expired'
                          ? 'bg-red-900/20 text-red-400 border-red-500/30'
                          : entry.status === 'in_progress'
                            ? 'bg-blue-900/20 text-blue-300 border-blue-500/30'
                            : 'bg-amber-900/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {entry.status.replace('_', ' ')}
                    </span>
                    {entry.error && <p className="text-[11px] text-red-300 mt-1">{entry.error}</p>}
                    {entry.progress?.message && <p className="text-[11px] text-[#93c5fd] mt-1">{entry.progress.message}</p>}
                  </td>
                  <td className="py-3 pr-3 text-[#d1d5db]">
                    {entry.attempts || 0}/{entry.maxAttempts || 0}
                  </td>
                  <td className="py-3 pr-3 text-[#d1d5db]">{formatDuration(entry.durationMs)}</td>
                  <td className="py-3 pr-3 text-[#9ca3af] whitespace-nowrap">{formatDateTime(entry.updatedAt || entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LocalRuntimeConsoleCard({ node }: { node: NodeDetail }) {
  const [detectedPort, setDetectedPort] = useState<number | null>(null);
  const [localState, setLocalState] = useState<'idle' | 'searching' | 'ready' | 'error'>('idle');
  const [reconnectState, setReconnectState] = useState<'idle' | 'reconnecting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Search localhost to reopen the paired local Nexus console for this node.');

  const detectMatchingLocalConsole = useCallback(async () => {
    if (typeof window === 'undefined') return null;

    setLocalState('searching');
    setReconnectState('idle');
    setMessage('Searching localhost for the local Nexus console attached to this node…');

    for (const discoveryPort of LOCAL_NEXUS_DISCOVERY_PORTS) {
      try {
        const discoveryResponse = await fetch(`http://localhost:${discoveryPort}/api/discovery`);
        if (!discoveryResponse.ok) continue;
        const discoveryPayload = await discoveryResponse.json().catch(() => null);
        if (!discoveryPayload) continue;

        const resolvedPort = Number(discoveryPayload?.dashboard?.port) || discoveryPort;
        const setupResponse = await fetch(`http://localhost:${resolvedPort}/api/setup-state`).catch(() => null);
        const setupState = setupResponse?.ok ? await setupResponse.json().catch(() => null) : null;
        if (!setupState) continue;
        if (setupState?.node_id !== node.id) continue;

        setDetectedPort(resolvedPort);
        setLocalState('ready');
        setMessage(`Local Nexus console detected on port ${resolvedPort} for this node.`);
        return resolvedPort;
      } catch {
        // Try next bridge port.
      }
    }

    for (const port of LOCAL_NEXUS_LEGACY_PORTS) {
      try {
        const setupResponse = await fetch(`http://localhost:${port}/api/setup-state`);
        if (!setupResponse.ok) continue;
        const setupState = await setupResponse.json().catch(() => null);
        if (!setupState || setupState?.node_id !== node.id) continue;

        setDetectedPort(port);
        setLocalState('ready');
        setMessage(`Local Nexus console detected on port ${port} for this node.`);
        return port;
      } catch {
        // Try next legacy port.
      }
    }

    setDetectedPort(null);
    setLocalState('error');
    setMessage('No local Nexus console matching this node was detected on localhost. Launch the local runtime on this machine, then retry.');
    return null;
  }, [node.id]);

  useEffect(() => {
    void detectMatchingLocalConsole();
  }, [detectMatchingLocalConsole]);

  const handleReconnect = useCallback(async () => {
    const port = detectedPort ?? await detectMatchingLocalConsole();
    if (!port) return;

    setReconnectState('reconnecting');
    setMessage('Requesting the local runtime to reconnect with its saved config…');

    try {
      const response = await fetch(`http://localhost:${port}/api/setup/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Reconnect failed on port ${port}`);
      }

      setReconnectState('success');
      setLocalState('ready');
      setMessage(`Local runtime reconnected on port ${port}.`);
    } catch (err) {
      setReconnectState('error');
      setMessage(err instanceof Error ? err.message : 'Could not reconnect the local runtime.');
    }
  }, [detectedPort, detectMatchingLocalConsole]);

  const localConsoleUrl = detectedPort ? `http://localhost:${detectedPort}/` : null;

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Local Console</h2>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Reopen the paired local runtime or ask it to reconnect without returning to the install flow.
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full border text-xs ${
          localState === 'ready'
            ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30'
            : localState === 'searching'
              ? 'bg-blue-900/20 text-blue-300 border-blue-500/30'
              : 'bg-[#111827] text-[#9ca3af] border-[rgba(255,255,255,0.08)]'
        }`}>
          {localState === 'ready' ? 'Detected' : localState === 'searching' ? 'Searching' : 'Not found'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide">Node</p>
          <p className="text-sm text-white mt-1">{node.name}</p>
          <p className="text-[11px] text-[#6b7280] mt-2 font-mono break-all">{node.id}</p>
        </div>
        <div className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
          <p className="text-xs text-[#6b7280] uppercase tracking-wide">Local console</p>
          <p className="text-sm text-white mt-1">{localConsoleUrl || 'Not detected yet'}</p>
          <p className="text-[11px] text-[#6b7280] mt-2">
            Works only on the same machine where the local Nexus runtime is running.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {localConsoleUrl && (
          <a
            href={localConsoleUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Open Local Console
          </a>
        )}
        <button
          type="button"
          onClick={() => void handleReconnect()}
          disabled={reconnectState === 'reconnecting' || localState === 'searching'}
          className="px-3 py-2 bg-[#1e293b] hover:bg-[#334155] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {reconnectState === 'reconnecting' ? 'Reconnecting…' : 'Reconnect Local Runtime'}
        </button>
        <button
          type="button"
          onClick={() => void detectMatchingLocalConsole()}
          disabled={localState === 'searching' || reconnectState === 'reconnecting'}
          className="px-3 py-2 bg-[#111827] hover:bg-[#172033] disabled:opacity-50 text-[#d1d5db] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm transition-colors"
        >
          {localState === 'searching' ? 'Searching…' : 'Retry Local Detection'}
        </button>
      </div>

      <p className={`mt-4 text-xs ${
        reconnectState === 'error' || localState === 'error'
          ? 'text-red-400'
          : reconnectState === 'success'
            ? 'text-emerald-400'
            : 'text-[#6b7280]'
      }`}>
        {message}
      </p>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NexusNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [commandHistory, setCommandHistory] = useState<NexusCommandStatus[]>([]);
  const [commandSummary, setCommandSummary] = useState<NexusCommandStats | null>(null);
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
      const data = await getNode(id) as NodeDetailResponse;
      if ('node' in data) {
        setNode(data.node ?? null);
      } else {
        setNode(data as NodeDetail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load node');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchCommandHistory = useCallback(async () => {
    try {
      const data = await getNodeCommands(id, 20) as CommandHistoryResponse;
      setCommandHistory(data.commands ?? []);
      setCommandSummary(data.summary ?? null);
    } catch {
      // Keep node detail usable even if observability fetch fails.
    }
  }, [id]);

  useEffect(() => { fetchNode(); }, [fetchNode]);
  useEffect(() => { fetchCommandHistory(); }, [fetchCommandHistory]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchNode();
      fetchCommandHistory();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchNode, fetchCommandHistory]);

  // Load pool agents for enterprise nodes (for spawn dropdown)
  useEffect(() => {
    if (node?.mode === 'enterprise') {
      getAgents()
        .then((agents) => {
          const poolIds = new Set(node.poolAgentIds ?? []);
          setPoolAgents(agents.filter((agent) => poolIds.has(agent.id)));
        })
        .catch(() => setPoolAgents([]));
      return;
    }
    setPoolAgents([]);
  }, [node?.mode, node?.poolAgentIds]);

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

      {!isEnterprise && (
        <LocalRuntimeConsoleCard node={node} />
      )}

      {/* Capabilities */}
      <CapabilitiesCard nodeId={id} node={node} />

      <DiscoverySnapshotCard
        node={node}
        onDiscoveryUpdated={() => {
          fetchNode();
          fetchCommandHistory();
        }}
      />

      <ConsentStateCard consentState={node.consentState} />

      <RuntimeObservabilityCard summary={commandSummary} commands={commandHistory} />

      {isEnterprise && (
        <DeploymentSubscriptionsSection agents={agents} />
      )}

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
      <ActionDispatchPanel
        nodeId={id}
        onCommandSettled={() => {
          fetchNode();
          fetchCommandHistory();
        }}
      />

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
