'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getNodes, deployLocal, deployEnterprise, deleteNode } from '@/lib/api/endpoints/nexus';
import {
  getEnterpriseProfiles,
  validateEnterpriseProfileSelection,
  type NexusEnterpriseRegistryRecord,
} from '@/lib/api/endpoints/nexus-enterprise';
import { getClients, createClient, updateClient, deleteClient } from '@/lib/api/endpoints/clients';
import { getAgents } from '@/lib/api/endpoints/agents';
import { getAvatarImageUrl } from '@/lib/avatar';
import type {
  NexusNode,
  NexusStats,
  NexusBillingSnapshot,
  NexusCommandStats,
  Agent,
  Client,
  CreateClientPayload,
  AutoSpawnRule,
  EnterpriseProfileSelectionValidation,
  NexusEnterpriseDriveRepo,
  NexusTokenResponse,
} from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatProviderLabel(value?: string): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatQuotaValue(value?: number): string {
  if (value === undefined || value === null) return '0';
  if (value === -1) return 'Unlimited';
  return String(value);
}

function formatDurationMs(value?: number): string {
  if (!value || value <= 0) return '—';
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value / 60000)}m`;
}

function formatAgentLevelLabel(level?: number): string {
  if (level === 1) return 'Level 1 - Administrative';
  if (level === 2) return 'Level 2 - Operational';
  if (level === 3) return 'Level 3 - Technical';
  return 'Unknown level';
}

const STATUS_DOT: Record<NexusNode['status'], string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  offline: 'bg-[#6b7280]',
};
const STATUS_RING: Record<NexusNode['status'], string> = {
  online: 'shadow-[0_0_0_3px_rgba(16,185,129,0.12)]',
  warning: 'shadow-[0_0_0_3px_rgba(245,158,11,0.12)]',
  offline: '',
};
const MODE_BADGE: Record<string, string> = {
  local: 'bg-blue-900/20 text-blue-400 border border-blue-500/30',
  enterprise: 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/30',
  standard: 'bg-[#374151]/40 text-[#9ca3af] border border-[rgba(255,255,255,0.1)]',
};

const inputCls =
  'w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-4 py-2.5 text-white text-sm placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors';

type LocalConsentSourceKey = 'filesystem' | 'mail' | 'calendar' | 'contacts' | 'clipboard' | 'shell';

interface LocalConsentChoice {
  key: string;
  label: string;
}

interface LocalConsentDefinition {
  key: LocalConsentSourceKey;
  label: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  apps: LocalConsentChoice[];
  actions: LocalConsentChoice[];
}

interface LocalConsentSourceState {
  enabled: boolean;
  apps: string[];
  actions: string[];
}

type LocalConsentState = Record<LocalConsentSourceKey, LocalConsentSourceState>;

const LOCAL_CONSENT_DEFINITIONS: LocalConsentDefinition[] = [
  {
    key: 'filesystem',
    label: 'Files & Search',
    description: 'Search, read, browse, and open local files.',
    icon: '📁',
    defaultEnabled: true,
    apps: [
      { key: 'finder', label: 'Finder / Explorer' },
      { key: 'preview', label: 'Preview / Native openers' },
      { key: 'synced_drives', label: 'Synced cloud folders' },
    ],
    actions: [
      { key: 'search', label: 'Search files' },
      { key: 'read_document', label: 'Read documents' },
      { key: 'list_dir', label: 'Browse folders' },
      { key: 'open_file', label: 'Open files' },
    ],
  },
  {
    key: 'mail',
    label: 'Mail',
    description: 'Read and search local desktop mailboxes.',
    icon: '✉️',
    defaultEnabled: true,
    apps: [
      { key: 'apple_mail', label: 'Apple Mail' },
      { key: 'outlook', label: 'Outlook' },
    ],
    actions: [
      { key: 'list_emails', label: 'List emails' },
      { key: 'search_emails', label: 'Search emails' },
    ],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Read upcoming events from local calendars.',
    icon: '📅',
    defaultEnabled: true,
    apps: [
      { key: 'apple_calendar', label: 'Apple Calendar' },
      { key: 'outlook_calendar', label: 'Outlook Calendar' },
    ],
    actions: [
      { key: 'read_calendar', label: 'Read events' },
    ],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    description: 'Search and read local contacts.',
    icon: '👤',
    defaultEnabled: true,
    apps: [
      { key: 'apple_contacts', label: 'Apple Contacts' },
      { key: 'outlook_contacts', label: 'Outlook Contacts' },
    ],
    actions: [
      { key: 'read_contacts', label: 'Read contacts' },
      { key: 'search_contacts', label: 'Search contacts' },
    ],
  },
  {
    key: 'clipboard',
    label: 'Clipboard',
    description: 'Read the current system clipboard.',
    icon: '📋',
    defaultEnabled: false,
    apps: [
      { key: 'system_clipboard', label: 'System clipboard' },
    ],
    actions: [
      { key: 'read_clipboard', label: 'Read clipboard' },
    ],
  },
  {
    key: 'shell',
    label: 'Shell',
    description: 'Execute terminal commands and interactive sessions.',
    icon: '⚡',
    defaultEnabled: false,
    apps: [
      { key: 'terminal', label: 'Terminal shell' },
    ],
    actions: [
      { key: 'shell_exec', label: 'Run commands' },
      { key: 'terminal_open', label: 'Open session' },
      { key: 'terminal_exec', label: 'Send input' },
      { key: 'terminal_read', label: 'Read output' },
    ],
  },
];

function createDefaultLocalConsentState(): LocalConsentState {
  return LOCAL_CONSENT_DEFINITIONS.reduce((acc, source) => {
    acc[source.key] = {
      enabled: source.defaultEnabled,
      apps: source.defaultEnabled ? source.apps.map((app) => app.key) : [],
      actions: source.defaultEnabled ? source.actions.map((action) => action.key) : [],
    };
    return acc;
  }, {} as LocalConsentState);
}

function buildLocalPermissionsFromConsent(consent: LocalConsentState) {
  const allowedActions = Array.from(new Set(
    Object.values(consent)
      .filter((source) => source.enabled)
      .flatMap((source) => source.actions)
  ));

  return {
    filesystem: consent.filesystem.enabled,
    shell: consent.shell.enabled,
    mail: consent.mail.enabled,
    calendar: consent.calendar.enabled,
    contacts: consent.contacts.enabled,
    clipboard: consent.clipboard.enabled,
    allowedFolders: [] as string[],
    allowedActions,
    consent: {
      sources: Object.fromEntries(
        Object.entries(consent).map(([key, state]) => [
          key,
          {
            enabled: state.enabled,
            apps: state.apps,
            actions: state.actions,
            ...(key === 'filesystem' ? { allowedFolders: [] } : {}),
          },
        ])
      ),
    },
  };
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onToggle, color = '#3b82f6' }: { on: boolean; onToggle: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ backgroundColor: on ? color : '#374151' }}
      className="relative w-10 h-5 rounded-full transition-colors shrink-0"
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ─── Agent Avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({ agent, size = 8 }: { agent: Agent; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = agent.name.slice(0, 2).toUpperCase();
  const imageUrl = !imgError ? getAvatarImageUrl(agent.avatar, agent.name) : null;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={agent.name}
        className={`w-${size} h-${size} rounded-full object-cover shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={`w-${size} h-${size} rounded-full bg-[#1e293b] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-xs font-semibold text-[#9ca3af] shrink-0`}
    >
      {initials}
    </div>
  );
}

// ─── Deploy Modal (multi-step) ────────────────────────────────────────────────

type DeployStep = 'select' | 'local-config' | 'local-token' | 'ent-basics' | 'ent-profile' | 'ent-primary' | 'ent-pool' | 'ent-spawn-rules' | 'ent-token';
type DeployMode = 'local' | 'enterprise';

function DeployModal({
  onClose,
  initialMode,
  initialClientName,
  initialProfileKey,
  billing,
}: {
  onClose: () => void;
  initialMode?: DeployMode;
  initialClientName?: string;
  initialProfileKey?: string;
  billing?: NexusBillingSnapshot | null;
}) {
  const [step, setStep] = useState<DeployStep>(initialMode === 'local' ? 'local-config' : initialMode === 'enterprise' ? 'ent-basics' : 'select');
  const [mode, setMode] = useState<DeployMode>(initialMode ?? 'local');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [enterpriseDriveRepo, setEnterpriseDriveRepo] = useState<NexusEnterpriseDriveRepo | null>(null);

  // Workspace agents (enterprise only)
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [enterpriseProfiles, setEnterpriseProfiles] = useState<NexusEnterpriseRegistryRecord[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileValidationLoading, setProfileValidationLoading] = useState(false);

  // Local: config
  const [localNodeName, setLocalNodeName] = useState('');
  const [localConsent, setLocalConsent] = useState<LocalConsentState>(() => createDefaultLocalConsentState());

  // Enterprise: step 1 — basics
  const [nodeName, setNodeName] = useState('');
  const [clientName, setClientName] = useState(initialClientName ?? '');
  const [seats, setSeats] = useState(5);
  const [profileKey, setProfileKey] = useState(initialProfileKey ?? '');
  const [profileValidation, setProfileValidation] = useState<EnterpriseProfileSelectionValidation | null>(null);
  // Enterprise: step 2 — primary agent
  const [primaryAgentId, setPrimaryAgentId] = useState('');
  // Enterprise: step 3 — pool agents + allow creating
  const [poolAgentIds, setPoolAgentIds] = useState<string[]>([]);
  const [allowCreatingNewAgents, setAllowCreatingNewAgents] = useState(false);
  // Enterprise: step 4 — auto-spawn rules
  const [autoSpawnRules, setAutoSpawnRules] = useState<AutoSpawnRule[]>([]);
  const [newSpawnPattern, setNewSpawnPattern] = useState('');
  const [newSpawnAgentName, setNewSpawnAgentName] = useState('');

  const toggleAgentId = (id: string, ids: string[], setIds: (v: string[]) => void) => {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const toggleLocalSourceEnabled = (sourceKey: LocalConsentSourceKey) => {
    const source = LOCAL_CONSENT_DEFINITIONS.find((entry) => entry.key === sourceKey);
    if (!source) return;
    setLocalConsent((current) => {
      const nextEnabled = !current[sourceKey].enabled;
      return {
        ...current,
        [sourceKey]: {
          enabled: nextEnabled,
          apps: nextEnabled
            ? (current[sourceKey].apps.length ? current[sourceKey].apps : source.apps.map((app) => app.key))
            : [],
          actions: nextEnabled
            ? (current[sourceKey].actions.length ? current[sourceKey].actions : source.actions.map((action) => action.key))
            : [],
        },
      };
    });
  };

  const toggleLocalSourceChoice = (
    sourceKey: LocalConsentSourceKey,
    kind: 'apps' | 'actions',
    choiceKey: string
  ) => {
    setLocalConsent((current) => {
      const values = current[sourceKey][kind];
      const nextValues = values.includes(choiceKey)
        ? values.filter((value) => value !== choiceKey)
        : [...values, choiceKey];
      const nextEnabled = kind === 'actions'
        ? nextValues.length > 0
        : current[sourceKey].enabled;

      return {
        ...current,
        [sourceKey]: {
          ...current[sourceKey],
          enabled: nextEnabled,
          [kind]: nextValues,
        },
      };
    });
  };

  useEffect(() => {
    const needsAgents = ['ent-primary', 'ent-pool'].includes(step);
    if (needsAgents && agents.length === 0 && !agentsLoading) {
      setAgentsLoading(true);
      getAgents()
        .then(setAgents)
        .catch(() => {})
        .finally(() => setAgentsLoading(false));
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 'ent-profile' || enterpriseProfiles.length > 0 || profilesLoading) return;
    setProfilesLoading(true);
    getEnterpriseProfiles()
      .then(setEnterpriseProfiles)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load enterprise profiles'))
      .finally(() => setProfilesLoading(false));
  }, [step, enterpriseProfiles.length, profilesLoading]);

  useEffect(() => {
    if (!initialProfileKey) return;
    setProfileKey(initialProfileKey);
  }, [initialProfileKey]);

  const selectedProfile = enterpriseProfiles.find((profile) => profile.key === profileKey) || null;

  const handleGenerate = async () => {
    setError('');
    if (mode === 'local' && billing && (!billing.canProvision.local || !billing.canProvision.total)) {
      setError('No local Nexus quota remaining on the current billing plan.');
      return;
    }
    if (mode === 'enterprise' && billing && (!billing.canProvision.enterprise || !billing.canProvision.total)) {
      setError('No enterprise Nexus quota remaining on the current billing plan.');
      return;
    }
    if (mode === 'enterprise' && billing?.seats && billing.seats.total !== -1 && seats > billing.seats.available) {
      setError(`Requested ${seats} seats, but only ${billing.seats.available} enterprise seat(s) are available on this workspace.`);
      return;
    }
    setLoading(true);
    try {
      let result: NexusTokenResponse;
      if (mode === 'local') {
        const permissions = buildLocalPermissionsFromConsent(localConsent);
        result = await deployLocal({
          agentIds: ['local-node'],
          nodeName: localNodeName.trim() || undefined,
          permissions,
        });
        setToken(result.token);
        setEnterpriseDriveRepo(null);
        setStep('local-token');
      } else {
        if (!profileKey) {
          throw new Error('Enterprise profile is required');
        }
        result = await deployEnterprise({
          name: nodeName.trim(),
          clientName: clientName.trim(),
          seats,
          primaryAgentId,
          poolAgentIds,
          allowCreatingNewAgents,
          autoSpawnRules: autoSpawnRules.length > 0 ? autoSpawnRules : undefined,
          role: 'general',
          filesystemRoot: `/opt/${clientName.toLowerCase().replace(/\s+/g, '-')}/`,
          offlineMode: false,
          profileKey,
          profileVersion: profileValidation?.profileVersion || selectedProfile?.version,
          deploymentMode: 'fixed',
          selectedCapabilities: profileValidation?.summary.selectedCapabilities,
          selectedLocalIntegrations: profileValidation?.summary.selectedLocalIntegrations,
          selectedHelperProfiles: profileValidation?.summary.selectedHelperProfiles,
        });
        setToken(result.token);
        setEnterpriseDriveRepo(result.payload?.drive_repo ?? null);
        setStep('ent-token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const localCliInstructions = `npm install -g @vutler/nexus\nvutler-nexus init ${token || '<token>'}\nvutler-nexus start`;
  const enterpriseDockerInstructions = `git clone https://github.com/Vutler-ai/vutler.git\ncd vutler/packages/nexus\ncat > .env <<'EOF'\nNEXUS_TOKEN=${token || '<token>'}\nNEXUS_SERVER=https://app.vutler.ai\nNODE_NAME=${nodeName.trim() || '<enterprise-node-name>'}\nEOF\ndocker compose up -d --build`;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const installerBaseUrl = 'https://github.com/Vutler-ai/vutler/releases/latest/download';

  const isTokenStep = step === 'local-token' || step === 'ent-token';
  const modeQuota = mode === 'enterprise'
    ? { remaining: billing?.remaining.enterprise, limit: billing?.limits.enterprise, label: 'Enterprise' }
    : { remaining: billing?.remaining.local, limit: billing?.limits.local, label: 'Local' };
  const enterpriseSeatSummary = billing?.seats ?? null;
  const quotaBlocked = billing
    ? mode === 'enterprise'
      ? (!billing.canProvision.enterprise || !billing.canProvision.total)
      : (!billing.canProvision.local || !billing.canProvision.total)
    : false;
  const seatQuotaBlocked = mode === 'enterprise' && enterpriseSeatSummary?.total !== undefined && enterpriseSeatSummary.total !== -1
    ? enterpriseSeatSummary.available <= 0
    : false;

  const stepLabel: Record<DeployStep, string> = {
    select: 'Choose type',
    'local-config': '1 of 2 — Configure node',
    'local-token': '2 of 2 — Install & Connect',
    'ent-basics': '1 of 6 — Basics',
    'ent-profile': '2 of 6 — Profile',
    'ent-primary': '3 of 6 — Primary agent',
    'ent-pool': '4 of 6 — Agent pool',
    'ent-spawn-rules': '5 of 6 — Auto-spawn rules',
    'ent-token': '6 of 6 — Token',
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex min-h-full items-start justify-center px-4 py-4 sm:items-center sm:py-6">
        <div className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[#14151f] p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-lg">Deploy New Nexus</h2>
            {step !== 'select' && (
              <p className="text-xs text-[#6b7280] mt-0.5">{stepLabel[step]}</p>
            )}
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none" aria-label="Close">×</button>
        </div>

        {billing && (
          <div className="mt-5 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wide">Billing plan</p>
              <p className="text-sm text-white font-medium">{formatProviderLabel(billing.planId)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#6b7280]">{modeQuota.label} quota</p>
              <p className={`text-sm font-medium ${modeQuota.remaining === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {formatQuotaValue(modeQuota.remaining)} left / {formatQuotaValue(modeQuota.limit)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex-1 overflow-y-auto pr-1">

        {/* ── Step: select mode ── */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-[#9ca3af] text-sm">Choose a deployment type to get started.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  m: 'local' as DeployMode,
                  icon: '💻',
                  label: 'Personal Node',
                  badge: 'Local',
                  desc: 'Connect your computer so agents can search files, read emails, calendar, and more.',
                  badgeCls: MODE_BADGE.local,
                  borderHover: 'hover:border-blue-500/50',
                  bgHover: 'hover:bg-blue-900/5',
                  textHover: 'group-hover:text-blue-400',
                },
                {
                  m: 'enterprise' as DeployMode,
                  icon: '🏢',
                  label: 'Enterprise Node',
                  badge: 'Enterprise',
                  desc: 'Deploy a multi-agent node at a client site with seat management.',
                  badgeCls: MODE_BADGE.enterprise,
                  borderHover: 'hover:border-emerald-500/50',
                  bgHover: 'hover:bg-emerald-900/5',
                  textHover: 'group-hover:text-emerald-400',
                },
              ] as const).map(({ m, icon, label, badge, desc, badgeCls, borderHover, bgHover, textHover }) => {
                const disabled = billing
                  ? m === 'enterprise'
                    ? (!billing.canProvision.enterprise || !billing.canProvision.total)
                    : (!billing.canProvision.local || !billing.canProvision.total)
                  : false;
                return (
                <button
                  key={m}
                  onClick={() => { if (!disabled) { setMode(m); setStep(m === 'local' ? 'local-config' : 'ent-basics'); } }}
                  disabled={disabled}
                  className={`flex flex-col items-start gap-2 p-4 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] ${disabled ? 'opacity-50 cursor-not-allowed' : `${borderHover} ${bgHover}`} rounded-xl text-left transition-all group`}
                >
                  <span className="text-2xl">{icon}</span>
                  <p className={`text-white font-semibold text-sm transition-colors ${textHover}`}>{label}</p>
                  <p className="text-[#6b7280] text-xs">{desc}</p>
                  <span className={`mt-1 text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>{badge}</span>
                  {disabled && <span className="text-[10px] text-amber-400">No quota remaining</span>}
                </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LOCAL: Step 1 — configure node & permissions ── */}
        {step === 'local-config' && (
          <div className="space-y-4">
            {!initialMode && (
              <button onClick={() => setStep('select')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            )}
            <p className="text-[#9ca3af] text-sm">Name your node and choose what your agents can access on this machine.</p>

            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Node Name</label>
              <input
                type="text"
                value={localNodeName}
                onChange={(e) => setLocalNodeName(e.target.value)}
                placeholder="e.g. MacBook Pro Antoine"
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Local consent</label>
              <div className="space-y-3">
                {LOCAL_CONSENT_DEFINITIONS.map((source) => {
                  const state = localConsent[source.key];
                  return (
                    <div
                      key={source.key}
                      className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-xl p-3 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5">{source.icon}</span>
                          <div>
                            <p className="text-sm text-white">{source.label}</p>
                            <p className="text-xs text-[#6b7280]">{source.description}</p>
                          </div>
                        </div>
                        <Toggle on={state.enabled} onToggle={() => toggleLocalSourceEnabled(source.key)} />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-[#6b7280] mb-2">Apps</p>
                          <div className="space-y-2">
                            {source.apps.map((app) => (
                              <label
                                key={app.key}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                                  state.enabled
                                    ? 'border-[rgba(255,255,255,0.08)] bg-[#111827] text-[#d1d5db]'
                                    : 'border-[rgba(255,255,255,0.05)] bg-[#0f111a] text-[#6b7280]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={state.apps.includes(app.key)}
                                  disabled={!state.enabled}
                                  onChange={() => toggleLocalSourceChoice(source.key, 'apps', app.key)}
                                  className="accent-[#3b82f6]"
                                />
                                <span>{app.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-[#6b7280] mb-2">Actions</p>
                          <div className="space-y-2">
                            {source.actions.map((action) => (
                              <label
                                key={action.key}
                                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                                  state.enabled
                                    ? 'border-[rgba(255,255,255,0.08)] bg-[#111827] text-[#d1d5db]'
                                    : 'border-[rgba(255,255,255,0.05)] bg-[#0f111a] text-[#6b7280]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={state.actions.includes(action.key)}
                                  disabled={!state.enabled}
                                  onChange={() => toggleLocalSourceChoice(source.key, 'actions', action.key)}
                                  className="accent-[#3b82f6]"
                                />
                                <span>{action.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[#6b7280]">Folder allow-lists stay editable during the local onboarding flow. The selections here define the initial source, app, and action consent sent to Nexus.</p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {quotaBlocked && <p className="text-amber-400 text-sm">This billing plan cannot provision another {modeQuota.label.toLowerCase()} node.</p>}
            {seatQuotaBlocked && <p className="text-amber-400 text-sm">No enterprise seats are left to allocate on this workspace.</p>}
            <button
              onClick={handleGenerate}
              disabled={loading || quotaBlocked || seatQuotaBlocked}
              className="w-full py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Generating…' : 'Generate & Continue →'}
            </button>
          </div>
        )}

        {/* ── ENTERPRISE: Step 1 — basics ── */}
        {step === 'ent-basics' && (
          <div className="space-y-4">
            {!initialMode && (
              <button onClick={() => setStep('select')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Node Name</label>
                <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="e.g. Studio Paris" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Client Name</label>
                <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Corp" className={inputCls} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Seats (concurrent agents)</label>
              <input
                type="number"
                min={1}
                max={enterpriseSeatSummary && enterpriseSeatSummary.available > 0 ? enterpriseSeatSummary.available : 100}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={inputCls}
              />
              <p className="text-xs text-[#6b7280]">
                {enterpriseSeatSummary
                  ? `How many agents can run concurrently on this node. ${formatQuotaValue(enterpriseSeatSummary.available)} seat(s) available to allocate on this workspace.`
                  : 'How many agents can run concurrently on this node.'}
              </p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={() => {
                if (!nodeName.trim() || !clientName.trim()) { setError('Node name and client name are required'); return; }
                if (enterpriseSeatSummary && enterpriseSeatSummary.total !== -1 && seats > enterpriseSeatSummary.available) {
                  setError(`Requested ${seats} seats, but only ${enterpriseSeatSummary.available} enterprise seat(s) are available on this workspace.`);
                  return;
                }
                setError('');
                setStep('ent-profile');
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* ── ENTERPRISE: Step 2 — profile ── */}
        {step === 'ent-profile' && (
          <div className="space-y-4">
            <button onClick={() => setStep('ent-basics')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            <p className="text-[#9ca3af] text-sm">Choose the deployable profile that defines the risk posture, capabilities, and governance defaults for this node.</p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {profilesLoading && (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-[#0a0b14] rounded-lg animate-pulse" />)}
                </div>
              )}
              {!profilesLoading && enterpriseProfiles.map((profile) => {
                const selected = profileKey === profile.key;
                const level = Number(profile.agent_level || (profile.definition as { agent_level?: number })?.agent_level || 0);
                const definition = profile.definition as { name?: string; description?: string; category?: string };
                const profileName = typeof profile.name === 'string' && profile.name
                  ? profile.name
                  : definition.name || profile.key;
                const profileCategory = typeof profile.category === 'string' && profile.category
                  ? profile.category
                  : definition.category || 'general';
                return (
                  <label
                    key={profile.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selected
                        ? 'border-emerald-500/60 bg-emerald-500/5'
                        : 'border-[rgba(255,255,255,0.07)] bg-[#0a0b14] hover:border-[rgba(255,255,255,0.14)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="enterpriseProfile"
                      checked={selected}
                      onChange={() => {
                        setProfileKey(profile.key);
                        setProfileValidation(null);
                        setError('');
                      }}
                      className="w-4 h-4 accent-emerald-500 mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-white font-medium">{profileName}</p>
                        <span className="px-2 py-0.5 rounded-full bg-[#111827] border border-[rgba(255,255,255,0.08)] text-[10px] text-[#9ca3af] uppercase tracking-wide">
                          {profileCategory}
                        </span>
                      </div>
                      <p className="text-xs text-[#6b7280] mt-1">{formatAgentLevelLabel(level)}</p>
                      {definition.description && <p className="text-xs text-[#9ca3af] mt-1">{definition.description}</p>}
                    </div>
                  </label>
                );
              })}
            </div>

            {profileValidation && (
              <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#6b7280] uppercase tracking-wide">Validated profile</p>
                    <p className="text-sm text-white font-medium">{profileValidation.profileName}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#111827] border border-[rgba(255,255,255,0.08)] text-[10px] text-[#9ca3af] uppercase tracking-wide">
                    {profileValidation.riskPosture.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-[#111827] px-3 py-2">
                    <p className="text-[#6b7280] uppercase tracking-wide">Seat impact now</p>
                    <p className="text-white font-medium mt-1">{profileValidation.seatImpact.totalImmediate}</p>
                  </div>
                  <div className="rounded-lg bg-[#111827] px-3 py-2">
                    <p className="text-[#6b7280] uppercase tracking-wide">Required capabilities</p>
                    <p className="text-white font-medium mt-1">{profileValidation.summary.requiredCapabilities.length}</p>
                  </div>
                </div>
                {profileValidation.warnings.length > 0 && (
                  <div className="space-y-1">
                    {profileValidation.warnings.map((warning) => (
                      <p key={warning} className="text-xs text-amber-400">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={async () => {
                if (!profileKey) {
                  setError('Please select an enterprise profile');
                  return;
                }
                setProfileValidationLoading(true);
                setError('');
                try {
                  const validation = await validateEnterpriseProfileSelection({
                    profileKey,
                    deploymentMode: 'fixed',
                    startActive: true,
                  });
                  setProfileValidation(validation);
                  setStep('ent-primary');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to validate enterprise profile');
                } finally {
                  setProfileValidationLoading(false);
                }
              }}
              disabled={profileValidationLoading || profilesLoading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {profileValidationLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {profileValidationLoading ? 'Validating…' : 'Validate & Continue →'}
            </button>
          </div>
        )}

        {/* ── ENTERPRISE: Step 3 — primary agent ── */}
        {step === 'ent-primary' && (
          <div className="space-y-4">
            <button onClick={() => setStep('ent-profile')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            <p className="text-[#9ca3af] text-sm">Select the primary agent that handles requests by default.</p>
            {profileValidation && (
              <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#0a0b14] px-3 py-2.5 text-xs">
                <span className="text-[#6b7280]">Profile:</span> <span className="text-white">{profileValidation.profileName}</span>
                <span className="text-[#6b7280]"> · </span>
                <span className="text-[#9ca3af]">{formatAgentLevelLabel(profileValidation.agentLevel)}</span>
              </div>
            )}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {agentsLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-[#0a0b14] rounded-lg animate-pulse" />)}
                </div>
              )}
              {!agentsLoading && agents.map((agent) => {
                const selected = primaryAgentId === agent.id;
                return (
                  <label
                    key={agent.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selected
                        ? 'border-emerald-500/60 bg-emerald-500/5'
                        : 'border-[rgba(255,255,255,0.07)] bg-[#0a0b14] hover:border-[rgba(255,255,255,0.14)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="primaryAgent"
                      checked={selected}
                      onChange={() => setPrimaryAgentId(agent.id)}
                      className="w-4 h-4 accent-emerald-500 shrink-0"
                    />
                    <AgentAvatar agent={agent} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{agent.name}</p>
                      {agent.model && <p className="text-xs text-[#6b7280] truncate">{agent.model}</p>}
                    </div>
                    {selected && <span className="text-xs text-emerald-400 shrink-0">Primary</span>}
                  </label>
                );
              })}
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={() => {
                if (!primaryAgentId) { setError('Please select a primary agent'); return; }
                setError('');
                setStep('ent-pool');
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* ── ENTERPRISE: Step 4 — pool agents ── */}
        {step === 'ent-pool' && (
          <div className="space-y-4">
            <button onClick={() => setStep('ent-primary')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            <p className="text-[#9ca3af] text-sm">Select agents available in the pool (can be spawned on demand).</p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {agents.filter((a) => a.id !== primaryAgentId).map((agent) => {
                const checked = poolAgentIds.includes(agent.id);
                return (
                  <label
                    key={agent.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      checked
                        ? 'border-emerald-500/60 bg-emerald-500/5'
                        : 'border-[rgba(255,255,255,0.07)] bg-[#0a0b14] hover:border-[rgba(255,255,255,0.14)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAgentId(agent.id, poolAgentIds, setPoolAgentIds)}
                      className="w-4 h-4 accent-emerald-500 shrink-0"
                    />
                    <AgentAvatar agent={agent} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{agent.name}</p>
                      {agent.model && <p className="text-xs text-[#6b7280] truncate">{agent.model}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-[#9ca3af]">Allow creating new agents from node</span>
              <Toggle on={allowCreatingNewAgents} onToggle={() => setAllowCreatingNewAgents(!allowCreatingNewAgents)} color="#10b981" />
            </div>
            <button
              onClick={() => setStep('ent-spawn-rules')}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* ── ENTERPRISE: Step 5 — auto-spawn rules ── */}
        {step === 'ent-spawn-rules' && (
          <div className="space-y-4">
            <button onClick={() => setStep('ent-pool')} className="text-xs text-[#6b7280] hover:text-white transition-colors">← Back</button>
            <p className="text-[#9ca3af] text-sm">Optional: define rules that auto-spawn agents when a trigger pattern is matched.</p>

            {/* Rules table */}
            {autoSpawnRules.length > 0 && (
              <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[rgba(255,255,255,0.07)] bg-[#0a0b14]">
                      <th className="text-left px-3 py-2 text-[#6b7280] uppercase tracking-wide">Trigger pattern</th>
                      <th className="text-left px-3 py-2 text-[#6b7280] uppercase tracking-wide">Agent name</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {autoSpawnRules.map((rule, idx) => (
                      <tr key={idx} className="border-b border-[rgba(255,255,255,0.04)] last:border-0">
                        <td className="px-3 py-2 text-white font-mono">{rule.triggerPattern}</td>
                        <td className="px-3 py-2 text-[#9ca3af]">{rule.agentName}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setAutoSpawnRules(autoSpawnRules.filter((_, i) => i !== idx))}
                            className="text-[#6b7280] hover:text-red-400 transition-colors"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add rule */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSpawnPattern}
                onChange={(e) => setNewSpawnPattern(e.target.value)}
                placeholder="trigger-pattern"
                className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-white text-xs placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
              <input
                type="text"
                value={newSpawnAgentName}
                onChange={(e) => setNewSpawnAgentName(e.target.value)}
                placeholder="agent name"
                className="flex-1 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-white text-xs placeholder-[#4b5563] focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
              <button
                onClick={() => {
                  if (!newSpawnPattern.trim() || !newSpawnAgentName.trim()) return;
                  setAutoSpawnRules([...autoSpawnRules, { triggerPattern: newSpawnPattern.trim(), agentName: newSpawnAgentName.trim() }]);
                  setNewSpawnPattern('');
                  setNewSpawnAgentName('');
                }}
                className="px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors shrink-0"
              >
                + Add
              </button>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {quotaBlocked && <p className="text-amber-400 text-sm">This billing plan cannot provision another {modeQuota.label.toLowerCase()} node.</p>}
            <button
              onClick={handleGenerate}
              disabled={loading || quotaBlocked}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Generating…' : 'Generate Token'}
            </button>
          </div>
        )}

        {/* ── Token step (shared) ── */}
        {isTokenStep && (
          <div className="space-y-4">
            {step === 'local-token' ? (
              <div className="space-y-2">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">1. Download & Install</label>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`${installerBaseUrl}/vutler-nexus-macos.dmg`}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isMac
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-[#1e293b] hover:bg-[#334155] text-[#d1d5db]'
                    }`}
                  >
                    <span className="text-lg">🍎</span> macOS (.dmg)
                  </a>
                  <a
                    href={`${installerBaseUrl}/vutler-nexus-windows.exe`}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      !isMac
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-[#1e293b] hover:bg-[#334155] text-[#d1d5db]'
                    }`}
                  >
                    <span className="text-lg">🪟</span> Windows (.exe)
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">1. Prepare Docker Runtime</label>
                <div className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg p-3 space-y-2">
                  <p className="text-white text-sm font-medium">Enterprise mode runs as a Docker runtime on the client environment.</p>
                  <p className="text-[#6b7280] text-xs">
                    Use the repository Docker setup in <code className="text-emerald-400">packages/nexus/</code> and inject the deploy token below as <code className="text-emerald-400">NEXUS_TOKEN</code>.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 2: Token ── */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">2. Your Deploy Token</label>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 min-w-0 bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-emerald-400 text-[10px] font-mono break-all max-h-24 overflow-y-auto overflow-x-hidden select-all leading-relaxed">
                  {token}
                </code>
                <button
                  onClick={() => copyText(token)}
                  className="shrink-0 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-xs transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {step === 'ent-token' && enterpriseDriveRepo && (
              <div className="space-y-1.5">
                <label className="text-xs text-[#9ca3af] uppercase tracking-wide">3. Drive Repo</label>
                <div className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg p-3 space-y-3">
                  <div>
                    <p className="text-white text-sm font-medium">Enterprise Drive namespace provisioned</p>
                    <p className="text-[#6b7280] text-xs mt-0.5">
                      Use it immediately for client context, room inventories, playbooks, and generated reports.
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#111827] px-3 py-2">
                    <p className="text-[#6b7280] uppercase tracking-wide text-[11px]">Root path</p>
                    <p className="text-emerald-400 text-[11px] font-mono mt-1 break-all">{enterpriseDriveRepo.rootPath}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <div className="rounded-lg bg-[#111827] px-3 py-2">
                      <p className="text-[#6b7280] uppercase tracking-wide text-[11px]">Context</p>
                      <p className="text-white font-mono mt-1 break-all">{enterpriseDriveRepo.sharedPaths.context}</p>
                    </div>
                    <div className="rounded-lg bg-[#111827] px-3 py-2">
                      <p className="text-[#6b7280] uppercase tracking-wide text-[11px]">Inventory</p>
                      <p className="text-white font-mono mt-1 break-all">{enterpriseDriveRepo.sharedPaths.inventory}</p>
                    </div>
                    <div className="rounded-lg bg-[#111827] px-3 py-2">
                      <p className="text-[#6b7280] uppercase tracking-wide text-[11px]">Node imports</p>
                      <p className="text-white font-mono mt-1 break-all">{enterpriseDriveRepo.nodePaths.imports}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-400">
                    Put spreadsheets and context here first. Credentials can be imported from files, but should then move into governed registries or a vault.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 3/4: Setup ── */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#9ca3af] uppercase tracking-wide">{step === 'ent-token' && enterpriseDriveRepo ? '4. Setup' : '3. Setup'}</label>
              <div className="bg-[#0a0b14] border border-[rgba(255,255,255,0.07)] rounded-lg p-3 space-y-3">
                {step === 'local-token' ? (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="text-lg shrink-0">📱</span>
                      <div>
                        <p className="text-white text-sm font-medium">QR Onboarding (recommended)</p>
                        <p className="text-[#6b7280] text-xs mt-0.5">Open the app after install — it will guide you through pairing, folder permissions, and health check.</p>
                      </div>
                    </div>
                    <div className="border-t border-[rgba(255,255,255,0.05)] pt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg shrink-0">⌨️</span>
                          <p className="text-[#9ca3af] text-xs font-medium">Or use CLI</p>
                        </div>
                        <button
                          onClick={() => copyText(localCliInstructions)}
                          className="text-xs text-[#6b7280] hover:text-white transition-colors"
                        >
                          Copy all
                        </button>
                      </div>
                      <pre className="text-[#6b7280] text-xs font-mono whitespace-pre-wrap leading-relaxed pl-7">
                        {localCliInstructions}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">🐳</span>
                        <p className="text-[#9ca3af] text-xs font-medium">Docker setup</p>
                      </div>
                      <button
                        onClick={() => copyText(enterpriseDockerInstructions)}
                        className="text-xs text-[#6b7280] hover:text-white transition-colors"
                      >
                        Copy all
                      </button>
                    </div>
                    <pre className="text-[#6b7280] text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {enterpriseDockerInstructions}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-amber-400">⚠ Token expires in 7 days. Store it securely.</p>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Client Form Modal ────────────────────────────────────────────────────────

function ClientFormModal({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client?.name ?? '');
  const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Client name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: CreateClientPayload = {
        name: name.trim(),
        contactEmail: contactEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (client) {
        await updateClient(client.id, payload);
      } else {
        await createClient(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Company Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contact@acme.com"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[#9ca3af] uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
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
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  title,
  label,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  label: string;
  description?: ReactNode;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <h2 className="text-white font-semibold text-lg">{title}</h2>
        <p className="text-[#9ca3af] text-sm">
          {description ?? (
            <>
              Are you sure you want to delete <span className="text-white font-medium">{label}</span>? This action cannot be undone.
            </>
          )}
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? 'Deleting…' : (confirmLabel ?? 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  onDelete,
}: {
  node: NexusNode;
  onDelete: (node: NexusNode) => void;
}) {
  const m = node.mode ?? 'standard';
  const workspaceProviders = ['mail', 'calendar', 'contacts']
    .map((key) => node.providerSources?.[key]?.active)
    .filter((value, index, list): value is string => !!value && list.indexOf(value) === index);
  return (
    <div
      className={`group flex flex-col bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 hover:border-[rgba(255,255,255,0.14)] transition-all duration-200 ${STATUS_RING[node.status]}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-[#6b7280] capitalize">{node.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${MODE_BADGE[m] ?? MODE_BADGE.standard}`}>{m}</span>
          <button
            type="button"
            onClick={() => onDelete(node)}
            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            title={`Delete ${node.name}`}
          >
            Delete
          </button>
        </div>
      </div>
      <Link href={`/nexus/${node.id}`} className="flex flex-1 flex-col">
        <p className="text-white font-semibold text-base leading-snug mb-0.5 group-hover:text-[#3b82f6] transition-colors">
          {node.name}
        </p>
        {node.clientName && <p className="text-xs text-[#6b7280] mb-1">{node.clientName}</p>}
        <div className="mt-auto pt-4 space-y-1 text-xs text-[#6b7280]">
          <p>{node.agentCount === 0 ? 'No agents' : `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`}</p>
          {node.seats && (
            <p className="text-[#3b82f6]">{node.seats.used}/{node.seats.max} seats used</p>
          )}
          {workspaceProviders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {workspaceProviders.map((provider) => (
                <span
                  key={`${node.id}-${provider}`}
                  className="px-1.5 py-0.5 rounded-full bg-[#0a0b14] border border-[rgba(255,255,255,0.08)] text-[10px] text-[#9ca3af]"
                >
                  {formatProviderLabel(provider)}
                </span>
              ))}
            </div>
          )}
          <p>Last: {relativeTime(node.lastHeartbeat)}</p>
        </div>
        <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)]">
          <span className="text-xs text-[#3b82f6] group-hover:underline">Manage →</span>
        </div>
      </Link>
    </div>
  );
}

function NodeSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-44 animate-pulse" />
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: NexusStats }) {
  const items = [
    { label: 'nodes', value: stats.total, color: 'text-white' },
    { label: 'online', value: stats.online, color: 'text-emerald-400' },
    { label: `agent${stats.agents !== 1 ? 's' : ''}`, value: stats.agents, color: 'text-white' },
    { label: 'tasks done', value: stats.tasksCompleted.toLocaleString(), color: 'text-white' },
  ];
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#9ca3af]">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-x-6">
          {i > 0 && <span className="hidden sm:block text-[rgba(255,255,255,0.12)] mr-[-1rem]">•</span>}
          <span>
            <span className={`font-medium ${item.color}`}>{item.value}</span>{' '}{item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function BillingOverviewCard({ billing }: { billing: NexusBillingSnapshot }) {
  const rows = [
    { label: 'Total nodes', usage: billing.usage.total, limit: billing.limits.total, remaining: billing.remaining.total },
    { label: 'Local', usage: billing.usage.local, limit: billing.limits.local, remaining: billing.remaining.local },
    { label: 'Enterprise', usage: billing.usage.enterprise, limit: billing.limits.enterprise, remaining: billing.remaining.enterprise },
  ];

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#6b7280] uppercase tracking-wide">Billing</p>
          <h3 className="text-white font-semibold mt-1">{formatProviderLabel(billing.planId)}</h3>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs bg-[#0a0b14] border border-[rgba(255,255,255,0.08)] text-[#9ca3af]">
          Nexus quota
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="text-white">{row.label}</p>
              <p className="text-xs text-[#6b7280]">
                {row.usage} used / {formatQuotaValue(row.limit)}
              </p>
            </div>
            <span className={`text-sm font-medium ${row.remaining === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatQuotaValue(row.remaining)} left
            </span>
          </div>
        ))}
      </div>

      {billing.seats && (
        <div className="pt-1 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="text-white">Enterprise seats</p>
              <p className="text-xs text-[#6b7280]">
                {billing.seats.addOnSeats > 0
                  ? `${billing.seats.included} included + ${billing.seats.addOnSeats} add-on`
                  : `${billing.seats.included} included`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white font-medium">
                {formatQuotaValue(billing.seats.available)} left / {formatQuotaValue(billing.seats.total)}
              </p>
              <p className="text-xs text-[#6b7280]">{billing.seats.allocated} allocated</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuntimeOverviewCard({ stats }: { stats: NexusCommandStats }) {
  const items = [
    { label: 'Queued', value: stats.queued, tone: 'text-amber-400' },
    { label: 'Running', value: stats.inProgress, tone: 'text-blue-300' },
    { label: 'Completed 24h', value: stats.completed24h, tone: 'text-emerald-400' },
    { label: 'Failed 24h', value: stats.failed24h + stats.expired24h, tone: 'text-red-400' },
  ];

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#6b7280] uppercase tracking-wide">Runtime</p>
          <h3 className="text-white font-semibold mt-1">Command channel</h3>
        </div>
        <span className="text-xs text-[#6b7280]">
          Avg {formatDurationMs(stats.avgDurationMs)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-[#0a0b14] border border-[rgba(255,255,255,0.06)] p-3">
            <p className="text-xs text-[#6b7280]">{item.label}</p>
            <p className={`text-lg font-semibold mt-1 ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── My Nodes Tab ─────────────────────────────────────────────────────────────

function MyNodesTab({
  nodes,
  stats,
  billing,
  commandStats,
  loading,
  error,
  onRetry,
  onDeploy,
  onDeleteNode,
}: {
  nodes: NexusNode[];
  stats: NexusStats | null;
  billing: NexusBillingSnapshot | null;
  commandStats: NexusCommandStats | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onDeploy: () => void;
  onDeleteNode: (node: NexusNode) => void;
}) {
  const localNodes = nodes.filter((n) => n.mode !== 'enterprise');

  return (
    <div className="space-y-6">
      {!loading && stats && <StatsBar stats={stats} />}
      {!loading && (billing || commandStats) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {billing && <BillingOverviewCard billing={billing} />}
          {commandStats && <RuntimeOverviewCard stats={commandStats} />}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <span>{error}</span>
          <button onClick={onRetry} className="ml-auto text-red-300 hover:text-white underline text-xs">Retry</button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <NodeSkeleton key={i} />)}
        </div>
      )}

      {!loading && localNodes.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">
            🖥️
          </div>
          <p className="text-white font-semibold text-lg">No local nodes deployed yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">Deploy your first local Nexus node to run agents on your machine.</p>
          <button
            onClick={onDeploy}
            className="mt-2 px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Deploy Local
          </button>
        </div>
      )}

      {!loading && localNodes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {localNodes.map((node) => <NodeCard key={node.id} node={node} onDelete={onDeleteNode} />)}
        </div>
      )}
    </div>
  );
}

// ─── Client Card ──────────────────────────────────────────────────────────────

function ClientCard({
  client,
  enterpriseNodes,
  onEdit,
  onDelete,
  onDeploy,
}: {
  client: Client;
  enterpriseNodes: NexusNode[];
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  onDeploy: (clientName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clientNodes = enterpriseNodes.filter(
    (n) => n.clientName?.toLowerCase() === client.name.toLowerCase()
  );
  const onlineCount = clientNodes.filter((n) => n.status === 'online').length;

  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl overflow-hidden transition-all duration-200 hover:border-[rgba(255,255,255,0.12)]">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-white font-semibold text-base truncate">{client.name}</h3>
            </div>
            {client.contactEmail && (
              <p className="text-xs text-[#6b7280] truncate">{client.contactEmail}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(client)}
              className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[rgba(255,255,255,0.05)] rounded-lg transition-colors text-xs"
              title="Edit"
            >
              ✎
            </button>
            <button
              onClick={() => onDelete(client)}
              className="p-1.5 text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs"
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#6b7280]">
          <span>
            <span className="text-white font-medium">{clientNodes.length}</span> node{clientNodes.length !== 1 ? 's' : ''}
          </span>
          {clientNodes.length > 0 && (
            <>
              <span className="text-[rgba(255,255,255,0.1)]">•</span>
              <span className="text-emerald-400 font-medium">{onlineCount} online</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onDeploy(client.name)}
            className="flex-1 py-1.5 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            + Deploy Node
          </button>
          {clientNodes.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 py-1.5 bg-[#0a0b14] hover:bg-[rgba(255,255,255,0.03)] text-[#9ca3af] border border-[rgba(255,255,255,0.07)] rounded-lg text-xs font-medium transition-colors"
            >
              {expanded ? 'Hide Nodes ▲' : 'View Nodes ▼'}
            </button>
          )}
        </div>
      </div>

      {expanded && clientNodes.length > 0 && (
        <div className="border-t border-[rgba(255,255,255,0.07)] bg-[#0e0f1a]">
          {clientNodes.map((node, idx) => (
            <Link
              key={node.id}
              href={`/nexus/${node.id}`}
              className={`flex items-center justify-between px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors group ${
                idx < clientNodes.length - 1 ? 'border-b border-[rgba(255,255,255,0.05)]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[node.status]} ${node.status === 'online' ? 'animate-pulse' : ''}`} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate group-hover:text-[#3b82f6] transition-colors">{node.name}</p>
                  <p className="text-xs text-[#6b7280]">
                    {node.agentCount === 0 ? 'No agents' : `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`} · {relativeTime(node.lastHeartbeat)}
                  </p>
                </div>
              </div>
              <span className="text-xs text-[#4b5563] group-hover:text-[#3b82f6] transition-colors shrink-0 ml-2">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-5 h-52 animate-pulse" />
  );
}

// ─── Enterprise Tab ───────────────────────────────────────────────────────────

function EnterpriseTab({
  clients,
  enterpriseNodes,
  billing,
  commandStats,
  loading,
  error,
  onRetry,
  onNewClient,
  onEditClient,
  onDeleteClient,
  onDeployEnterprise,
}: {
  clients: Client[];
  enterpriseNodes: NexusNode[];
  billing: NexusBillingSnapshot | null;
  commandStats: NexusCommandStats | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNewClient: () => void;
  onEditClient: (c: Client) => void;
  onDeleteClient: (c: Client) => void;
  onDeployEnterprise: (clientName?: string) => void;
}) {
  return (
    <div className="space-y-6">
      {!loading && (billing || commandStats) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {billing && <BillingOverviewCard billing={billing} />}
          {commandStats && <RuntimeOverviewCard stats={commandStats} />}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#6b7280]">
          {clients.length > 0
            ? `${clients.length} client${clients.length !== 1 ? 's' : ''} · ${enterpriseNodes.length} node${enterpriseNodes.length !== 1 ? 's' : ''} deployed`
            : 'Manage enterprise clients and their deployed nodes'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onNewClient}
            className="flex items-center gap-2 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Client
          </button>
          <button
            onClick={() => onDeployEnterprise()}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Enterprise Deployment
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <span>{error}</span>
          <button onClick={onRetry} className="ml-auto text-red-300 hover:text-white underline text-xs">Retry</button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <ClientSkeleton key={i} />)}
        </div>
      )}

      {!loading && clients.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#14151f] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl">
            🏢
          </div>
          <p className="text-white font-semibold text-lg">No enterprise clients yet</p>
          <p className="text-[#6b7280] text-sm max-w-xs">Add your first client to start deploying Nexus nodes to enterprise sites.</p>
          <button
            onClick={onNewClient}
            className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Client
          </button>
        </div>
      )}

      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              enterpriseNodes={enterpriseNodes}
              onEdit={onEditClient}
              onDelete={onDeleteClient}
              onDeploy={(clientName) => onDeployEnterprise(clientName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'my-nodes' | 'enterprise';

export default function NexusPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-nodes');

  const [nodes, setNodes] = useState<NexusNode[]>([]);
  const [stats, setStats] = useState<NexusStats | null>(null);
  const [billing, setBilling] = useState<NexusBillingSnapshot | null>(null);
  const [commandStats, setCommandStats] = useState<NexusCommandStats | null>(null);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [nodesError, setNodesError] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');

  const [deployOpen, setDeployOpen] = useState(false);
  const [deployMode, setDeployMode] = useState<'local' | 'enterprise' | undefined>(undefined);
  const [deployClientName, setDeployClientName] = useState<string | undefined>(undefined);
  const [deployProfileKey, setDeployProfileKey] = useState<string | undefined>(undefined);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
  const [deletingClient, setDeletingClient] = useState<Client | undefined>(undefined);
  const [deletingNode, setDeletingNode] = useState<NexusNode | undefined>(undefined);

  const fetchNodes = useCallback(async () => {
    setNodesLoading(true);
    setNodesError('');
    try {
      const data = await getNodes();
      setNodes(data.nodes ?? []);
      setStats(data.stats ?? null);
      setBilling(data.billing ?? null);
      setCommandStats(data.commandStats ?? null);
    } catch (err) {
      setNodesError(err instanceof Error ? err.message : 'Failed to load Nexus data. Please refresh.');
      setNodes([]);
      setBilling(null);
      setCommandStats(null);
    } finally {
      setNodesLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError('');
    try {
      const data = await getClients();
      setClients(data);
    } catch (err) {
      setClientsError(err instanceof Error ? err.message : 'Failed to load clients. Please refresh.');
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  useEffect(() => {
    if (activeTab === 'enterprise' && clients.length === 0 && !clientsLoading) {
      fetchClients();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterpriseNodes = nodes.filter((n) => n.mode === 'enterprise');

  const openDeployLocal = () => {
    setDeployMode('local');
    setDeployClientName(undefined);
    setDeployProfileKey(undefined);
    setDeployOpen(true);
  };

  const openDeployEnterprise = (clientName?: string, profileKey?: string) => {
    setDeployMode('enterprise');
    setDeployClientName(clientName);
    setDeployProfileKey(profileKey);
    setDeployOpen(true);
  };

  const handleDeployClose = () => {
    setDeployOpen(false);
    setDeployMode(undefined);
    setDeployClientName(undefined);
    setDeployProfileKey(undefined);
    fetchNodes();
  };

  useEffect(() => {
    const mode = searchParams.get('mode');
    const profile = searchParams.get('profile') || undefined;

    if (mode === 'enterprise') {
      setActiveTab('enterprise');
      setDeployMode('enterprise');
      setDeployProfileKey(profile);
      setDeployOpen(true);
      return;
    }

    if (mode === 'local') {
      setActiveTab('my-nodes');
      setDeployMode('local');
      setDeployProfileKey(undefined);
      setDeployOpen(true);
    }
  }, [searchParams]);

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setClientFormOpen(true);
  };

  const handleDeleteClient = (client: Client) => {
    setDeletingClient(client);
  };

  const handleDeleteNode = (node: NexusNode) => {
    setDeletingNode(node);
  };

  const handleClientSaved = () => {
    setClientFormOpen(false);
    setEditingClient(undefined);
    fetchClients();
  };

  const handleClientDeleted = async () => {
    if (!deletingClient) return;
    await deleteClient(deletingClient.id);
    setDeletingClient(undefined);
    fetchClients();
  };

  const handleNodeDeleted = async () => {
    if (!deletingNode) return;
    try {
      await deleteNode(deletingNode.id);
      setDeletingNode(undefined);
      await fetchNodes();
    } catch (err) {
      setNodesError(err instanceof Error ? err.message : 'Failed to delete node.');
      throw err;
    }
  };

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'my-nodes', label: 'My Nodes' },
    { id: 'enterprise', label: 'Enterprise' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Nexus</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage distributed agent deployments</p>
        </div>
        {activeTab === 'my-nodes' && (
          <button
            onClick={openDeployLocal}
            className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <span className="text-base leading-none">+</span> Deploy Local
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[rgba(255,255,255,0.07)] pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-[#6b7280] hover:text-[#9ca3af]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3b82f6] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'my-nodes' && (
        <MyNodesTab
          nodes={nodes}
          stats={stats}
          billing={billing}
          commandStats={commandStats}
          loading={nodesLoading}
          error={nodesError}
          onRetry={fetchNodes}
          onDeploy={openDeployLocal}
          onDeleteNode={handleDeleteNode}
        />
      )}

      {activeTab === 'enterprise' && (
        <EnterpriseTab
          clients={clients}
          enterpriseNodes={enterpriseNodes}
          billing={billing}
          commandStats={commandStats}
          loading={clientsLoading || nodesLoading}
          error={clientsError || nodesError}
          onRetry={() => { fetchClients(); fetchNodes(); }}
          onNewClient={() => { setEditingClient(undefined); setClientFormOpen(true); }}
          onEditClient={handleEditClient}
          onDeleteClient={handleDeleteClient}
          onDeployEnterprise={openDeployEnterprise}
        />
      )}

      {deployOpen && (
        <DeployModal
          initialMode={deployMode}
          initialClientName={deployClientName}
          billing={billing}
          onClose={handleDeployClose}
          initialProfileKey={deployProfileKey}
        />
      )}

      {clientFormOpen && (
        <ClientFormModal
          client={editingClient}
          onClose={() => { setClientFormOpen(false); setEditingClient(undefined); }}
          onSaved={handleClientSaved}
        />
      )}

      {deletingClient && (
        <DeleteConfirmModal
          title="Delete Client"
          label={deletingClient.name}
          onClose={() => setDeletingClient(undefined)}
          onConfirm={handleClientDeleted}
        />
      )}

      {deletingNode && (
        <DeleteConfirmModal
          title="Delete Local Node"
          label={deletingNode.name}
          description={(
            <>
              Delete <span className="text-white font-medium">{deletingNode.name}</span> from this workspace? This only removes the node record from Vutler and cannot be undone.
            </>
          )}
          confirmLabel="Delete Node"
          onClose={() => setDeletingNode(undefined)}
          onConfirm={handleNodeDeleted}
        />
      )}
    </div>
  );
}
