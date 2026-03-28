'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotifSetting {
  key: string;
  label: string;
  desc: string;
}

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  priority?: number;
  description?: string;
}

interface DomainVerification {
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  fullyVerified: boolean;
  verifiedAt?: string;
}

interface WorkspaceDomain {
  id: string;
  domain: string;
  verification: DomainVerification;
  dnsRecords: Record<string, DnsRecord>;
  createdAt: string;
}

interface EmailRoute {
  id: string;
  emailAddress: string;
  agentId: string;
  agentName: string;
  agentUsername: string;
  agentAvatar?: string;
  autoReply: boolean;
  approvalRequired: boolean;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatar?: string;
}

interface EmailGroupMember {
  id: string;
  memberType: 'agent' | 'human';
  agentId?: string;
  agentName?: string;
  agentUsername?: string;
  humanEmail?: string;
  humanName?: string;
  role: 'owner' | 'member';
}

interface EmailGroup {
  id: string;
  name: string;
  emailAddress: string;
  description?: string;
  autoReply: boolean;
  approvalRequired: boolean;
  memberCount: number;
  members?: EmailGroupMember[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const notifTypes: NotifSetting[] = [
  { key: 'agent_error', label: 'Agent Errors', desc: 'Get notified when an agent encounters an error' },
  { key: 'deployment_offline', label: 'Deployment Offline', desc: 'Alert when a deployment goes offline' },
  { key: 'daily_digest', label: 'Daily Digest', desc: 'Daily summary of activity and stats' },
  { key: 'security_alert', label: 'Security Alerts', desc: 'Important security notifications' },
];

const DNS_RECORD_LABELS: Record<string, string> = {
  mx: 'MX',
  spf: 'SPF (TXT)',
  dkim: 'DKIM (CNAME)',
  dmarc: 'DMARC (TXT)',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium">
      <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
      Not verified
    </span>
  );
}

function DnsRecordRow({ label, record, verified }: { label: string; record: DnsRecord; verified: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(record.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border border-[rgba(255,255,255,0.07)] rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{label}</span>
        <VerificationBadge verified={verified} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-[#64748b]">Type</span>
        <span className="text-white font-mono">{record.type}{record.priority ? ` (priority ${record.priority})` : ''}</span>
        <span className="text-[#64748b]">Host</span>
        <span className="text-white font-mono">{record.host}</span>
        <span className="text-[#64748b]">Value</span>
        <div className="flex items-start gap-1">
          <span className="text-white font-mono break-all">{record.value}</span>
          <button
            onClick={copy}
            className="shrink-0 text-[#64748b] hover:text-white transition-colors cursor-pointer"
            title="Copy value"
          >
            {copied ? '✓' : '⎘'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DomainCard({
  domain,
  onVerify,
  onDelete,
}: {
  domain: WorkspaceDomain;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(!domain.verification.fullyVerified);
  const { verification, dnsRecords } = domain;

  return (
    <div className="bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-medium text-white">{domain.domain}</p>
            <p className="text-xs text-[#64748b] mt-0.5">
              {verification.fullyVerified ? (
                <span className="text-green-400">All records verified</span>
              ) : (
                <span className="text-yellow-400">DNS configuration pending</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVerify(domain.id)}
            className="px-3 py-1.5 text-xs bg-[#334155] hover:bg-[#475569] rounded-lg transition-colors cursor-pointer"
          >
            Verify DNS
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="px-3 py-1.5 text-xs bg-[#334155] hover:bg-[#475569] rounded-lg transition-colors cursor-pointer"
          >
            {expanded ? 'Hide' : 'Show'} records
          </button>
          <button
            onClick={() => onDelete(domain.id)}
            className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors cursor-pointer"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Verification indicators */}
      <div className="px-4 pb-3 flex gap-4">
        {(['mx', 'spf', 'dkim', 'dmarc'] as const).map(k => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${verification[k] ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-xs text-[#94a3b8] uppercase">{k}</span>
          </div>
        ))}
      </div>

      {/* DNS Records */}
      {expanded && dnsRecords && (
        <div className="px-4 pb-4 space-y-2 border-t border-[rgba(255,255,255,0.05)] pt-3">
          <p className="text-xs text-[#64748b] mb-3">
            Add these records to your DNS provider, then click "Verify DNS" to confirm.
          </p>
          {(Object.keys(DNS_RECORD_LABELS) as Array<keyof typeof DNS_RECORD_LABELS>).map(key => (
            dnsRecords[key] ? (
              <DnsRecordRow
                key={key}
                label={DNS_RECORD_LABELS[key]}
                record={dnsRecords[key]}
                verified={verification[key as keyof DomainVerification] as boolean}
              />
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EmailSettingsPage() {
  // Notification settings state
  const [email, setEmail] = useState('');
  const [settings, setSettings] = useState<Record<string, boolean>>({
    agent_error: true,
    deployment_offline: true,
    daily_digest: false,
    security_alert: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Domains state
  const [domains, setDomains] = useState<WorkspaceDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, string>>({});

  // Agent email routes state
  const [routes, setRoutes] = useState<EmailRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newRouteAgentId, setNewRouteAgentId] = useState('');
  const [newRoutePrefix, setNewRoutePrefix] = useState('');
  const [addingRoute, setAddingRoute] = useState(false);
  const [routeError, setRouteError] = useState('');

  // Email groups state
  const [emailGroups, setEmailGroups] = useState<EmailGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrefix, setNewGroupPrefix] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [newMemberAgentId, setNewMemberAgentId] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    authFetch('/api/v1/settings/notifications')
      .then(r => r.json())
      .then(data => {
        if (data.email) setEmail(data.email);
        if (data.settings) setSettings(s => ({ ...s, ...data.settings }));
      })
      .catch(() => {});
  }, []);

  const loadDomains = useCallback(() => {
    setDomainsLoading(true);
    authFetch('/api/v1/email/domains')
      .then(r => r.ok ? r.json() : Promise.reject('not ok'))
      .then(data => setDomains(Array.isArray(data?.domains) ? data.domains : []))
      .catch(() => setDomains([]))
      .finally(() => setDomainsLoading(false));
  }, []);

  const loadRoutes = useCallback(() => {
    setRoutesLoading(true);
    authFetch('/api/v1/email/routes')
      .then(r => r.ok ? r.json() : Promise.reject('not ok'))
      .then(data => setRoutes(Array.isArray(data?.routes) ? data.routes : []))
      .catch(() => setRoutes([]))
      .finally(() => setRoutesLoading(false));
  }, []);

  const loadAgents = useCallback(() => {
    authFetch('/api/v1/agents')
      .then(r => r.json())
      .then(data => setAgents(data.agents || []))
      .catch(() => setAgents([]));
  }, []);

  const loadGroups = useCallback(() => {
    setGroupsLoading(true);
    authFetch('/api/v1/email/groups')
      .then(r => r.ok ? r.json() : Promise.reject('not ok'))
      .then(data => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.groups) ? data.groups : [];
        setEmailGroups(list);
      })
      .catch(() => setEmailGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  const loadGroupMembers = useCallback(async (groupId: string) => {
    try {
      const res = await authFetch(`/api/v1/email/groups/${groupId}`);
      if (!res.ok) return;
      const data = await res.json();
      const group = data.group || data;
      const members = Array.isArray(group?.members) ? group.members : [];
      setEmailGroups(prev => prev.map(g => g.id === groupId ? { ...g, members } : g));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadDomains();
    loadRoutes();
    loadAgents();
    loadGroups();
  }, [loadDomains, loadRoutes, loadAgents, loadGroups]);

  // ---------------------------------------------------------------------------
  // Notification handlers
  // ---------------------------------------------------------------------------

  const save = async () => {
    setSaving(true);
    try {
      await authFetch('/api/v1/settings/notifications', {
        method: 'PUT',
        body: JSON.stringify({ email, settings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await authFetch('/api/v1/notifications/test-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch (e) {
      console.error(e);
    }
    setTesting(false);
  };

  // ---------------------------------------------------------------------------
  // Domain handlers
  // ---------------------------------------------------------------------------

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    setDomainError('');
    setAddingDomain(true);
    try {
      const res = await authFetch('/api/v1/email/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to add domain');
      setNewDomain('');
      loadDomains();
    } catch (err: unknown) {
      setDomainError(err instanceof Error ? err.message : 'Failed to add domain');
    }
    setAddingDomain(false);
  };

  const verifyDomain = async (id: string) => {
    setVerifyingId(id);
    setVerifyResult(r => ({ ...r, [id]: '' }));
    try {
      const res = await authFetch(`/api/v1/email/domains/${id}/verify`, { method: 'POST' });
      const data = await res.json();
      setVerifyResult(r => ({
        ...r,
        [id]: data.verification?.fullyVerified
          ? 'All records verified!'
          : data.message || 'Some records are still missing.',
      }));
      loadDomains();
    } catch {
      setVerifyResult(r => ({ ...r, [id]: 'Verification check failed.' }));
    }
    setVerifyingId(null);
  };

  const deleteDomain = async (id: string) => {
    if (!confirm('Remove this domain? Agents using it will fall back to the default address.')) return;
    try {
      await authFetch(`/api/v1/email/domains/${id}`, { method: 'DELETE' });
      loadDomains();
    } catch {
      /* silent */
    }
  };

  // ---------------------------------------------------------------------------
  // Route handlers
  // ---------------------------------------------------------------------------

  const addRoute = async () => {
    if (!newRouteAgentId || !newRoutePrefix.trim()) return;
    setRouteError('');
    setAddingRoute(true);
    try {
      const res = await authFetch('/api/v1/email/routes', {
        method: 'POST',
        body: JSON.stringify({ agent_id: newRouteAgentId, email_prefix: newRoutePrefix.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create route');
      setNewRouteAgentId('');
      setNewRoutePrefix('');
      loadRoutes();
      loadAgents(); // refresh agent email fields
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : 'Failed to create route');
    }
    setAddingRoute(false);
  };

  const deleteRoute = async (id: string) => {
    if (!confirm('Remove this email route?')) return;
    try {
      await authFetch(`/api/v1/email/routes/${id}`, { method: 'DELETE' });
      loadRoutes();
    } catch {
      /* silent */
    }
  };

  // ---------------------------------------------------------------------------
  // Group handlers
  // ---------------------------------------------------------------------------

  const addGroup = async () => {
    if (!newGroupName.trim() || !newGroupPrefix.trim()) return;
    setGroupError('');
    setAddingGroup(true);
    try {
      const res = await authFetch('/api/v1/email/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newGroupName.trim(), email_prefix: newGroupPrefix.trim() }),
      });
      const data = await res.json();
      if (!data.success && data.error) throw new Error(data.error);
      setNewGroupName('');
      setNewGroupPrefix('');
      loadGroups();
    } catch (err: unknown) {
      setGroupError(err instanceof Error ? err.message : 'Failed to create group');
    }
    setAddingGroup(false);
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this email group? Members will no longer receive emails at this address.')) return;
    try {
      await authFetch(`/api/v1/email/groups/${id}`, { method: 'DELETE' });
      loadGroups();
    } catch { /* silent */ }
  };

  const toggleGroupExpand = async (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    } else {
      setExpandedGroupId(groupId);
      await loadGroupMembers(groupId);
    }
  };

  const addMemberToGroup = async (groupId: string, memberType: 'agent' | 'human') => {
    setAddingMember(true);
    try {
      const body = memberType === 'agent'
        ? { member_type: 'agent', agent_id: newMemberAgentId }
        : { member_type: 'human', email: newMemberEmail.trim() };
      await authFetch(`/api/v1/email/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNewMemberAgentId('');
      setNewMemberEmail('');
      await loadGroupMembers(groupId);
      loadGroups();
    } catch { /* silent */ }
    setAddingMember(false);
  };

  const removeMember = async (groupId: string, memberId: string) => {
    try {
      await authFetch(`/api/v1/email/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
      await loadGroupMembers(groupId);
      loadGroups();
    } catch { /* silent */ }
  };

  // When an agent is selected for a new route, pre-fill the prefix from their username
  const handleAgentSelect = (agentId: string) => {
    setNewRouteAgentId(agentId);
    if (agentId) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) setNewRoutePrefix(agent.username);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-12">

        {/* ── Notification Settings ──────────────────────────────────────── */}
        <section>
          <h1 className="text-3xl font-bold mb-2">Email Notifications</h1>
          <p className="text-[#94a3b8] mb-8">Configure which notifications you receive by email.</p>

          <div className="mb-8">
            <label className="block text-sm font-medium text-[#94a3b8] mb-2">Email Address</label>
            <div className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="flex-1 px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <button
                onClick={testEmail}
                disabled={testing || !email}
                className="px-4 py-2.5 bg-[#1e293b] hover:bg-[#334155] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {testing ? 'Sending...' : testSent ? '✓ Sent!' : 'Send Test'}
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {notifTypes.map(t => (
              <div key={t.key} className="flex items-center justify-between p-4 bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
                <div>
                  <h3 className="font-medium">{t.label}</h3>
                  <p className="text-sm text-[#64748b]">{t.desc}</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, [t.key]: !s[t.key] }))}
                  className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${settings[t.key] ? 'bg-[#3b82f6]' : 'bg-[#334155]'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings[t.key] ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </section>

        {/* ── Custom Domains ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Custom Domains</h2>
          <p className="text-[#94a3b8] mb-6">
            Use your own domain for agent email addresses (e.g. <span className="text-white font-mono">jarvis@yourcompany.com</span>).
            Without a custom domain, agents use <span className="text-white font-mono">agent@workspace.vutler.ai</span>.
          </p>

          {/* Add domain */}
          <div className="mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDomain()}
                placeholder="yourcompany.com"
                className="flex-1 px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <button
                onClick={addDomain}
                disabled={addingDomain || !newDomain.trim()}
                className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {addingDomain ? 'Adding...' : 'Add Domain'}
              </button>
            </div>
            {domainError && <p className="mt-2 text-sm text-red-400">{domainError}</p>}
          </div>

          {/* Domain list */}
          {domainsLoading ? (
            <p className="text-[#64748b] text-sm">Loading domains...</p>
          ) : domains.length === 0 ? (
            <div className="p-6 text-center bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
              <p className="text-[#64748b]">No custom domains configured.</p>
              <p className="text-xs text-[#475569] mt-1">Agents will use the default <span className="font-mono">workspace.vutler.ai</span> domain.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map(d => (
                <div key={d.id}>
                  <DomainCard
                    domain={d}
                    onVerify={async (id) => { await verifyDomain(id); }}
                    onDelete={deleteDomain}
                  />
                  {verifyResult[d.id] && (
                    <p className={`mt-2 text-sm px-1 ${verifyResult[d.id].includes('verified!') ? 'text-green-400' : 'text-yellow-400'}`}>
                      {verifyingId === d.id ? 'Checking DNS...' : verifyResult[d.id]}
                    </p>
                  )}
                  {verifyingId === d.id && (
                    <p className="mt-2 text-sm px-1 text-[#64748b]">Checking DNS records...</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Agent Email Assignments ────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Agent Email Addresses</h2>
          <p className="text-[#94a3b8] mb-6">
            Assign email addresses to agents. Incoming emails to these addresses will be routed to the assigned agent.
          </p>

          {/* Add route */}
          <div className="bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)] p-4 mb-6">
            <p className="text-sm font-medium text-[#94a3b8] mb-3">Assign new email to agent</p>
            <div className="flex gap-3 flex-wrap">
              <select
                value={newRouteAgentId}
                onChange={e => handleAgentSelect(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6] cursor-pointer"
              >
                <option value="">Select agent...</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (@{a.username})</option>
                ))}
              </select>
              <input
                type="text"
                value={newRoutePrefix}
                onChange={e => setNewRoutePrefix(e.target.value)}
                placeholder="email-prefix"
                className="flex-1 min-w-[140px] px-3 py-2.5 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <button
                onClick={addRoute}
                disabled={addingRoute || !newRouteAgentId || !newRoutePrefix.trim()}
                className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {addingRoute ? 'Assigning...' : 'Assign'}
              </button>
            </div>
            {routeError && <p className="mt-2 text-sm text-red-400">{routeError}</p>}
            <p className="mt-2 text-xs text-[#475569]">
              The final address will be <span className="font-mono text-[#94a3b8]">prefix@your-domain-or-workspace.vutler.ai</span>
            </p>
          </div>

          {/* Route list */}
          {routesLoading ? (
            <p className="text-[#64748b] text-sm">Loading agent emails...</p>
          ) : routes.length === 0 ? (
            <div className="p-6 text-center bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
              <p className="text-[#64748b]">No agent email addresses assigned yet.</p>
              <p className="text-xs text-[#475569] mt-1">Agents created via the Agents page are auto-assigned a default address.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
                  <div className="flex items-center gap-3">
                    {r.agentAvatar && (
                      <img src={r.agentAvatar} alt={r.agentName} className="w-8 h-8 rounded-full object-cover" />
                    )}
                    <div>
                      <p className="font-medium text-white">{r.agentName || r.agentUsername}</p>
                      <p className="text-sm font-mono text-[#3b82f6]">{r.emailAddress}</p>
                      <div className="flex gap-3 mt-1">
                        <span className={`text-xs ${r.autoReply ? 'text-green-400' : 'text-[#64748b]'}`}>
                          {r.autoReply ? 'Auto-reply on' : 'Auto-reply off'}
                        </span>
                        <span className={`text-xs ${r.approvalRequired ? 'text-yellow-400' : 'text-green-400'}`}>
                          {r.approvalRequired ? 'Approval required' : 'Sends automatically'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRoute(r.id)}
                    className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Email Groups ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Email Groups</h2>
          <p className="text-[#94a3b8] mb-6">
            Create shared email addresses (e.g. <span className="text-white font-mono">info@yourcompany.com</span>) and assign agents or team members to receive and respond.
          </p>

          {/* Add group */}
          <div className="bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)] p-4 mb-6">
            <p className="text-sm font-medium text-[#94a3b8] mb-3">Create new group</p>
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Support)"
                className="flex-1 min-w-[180px] px-3 py-2.5 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <input
                type="text"
                value={newGroupPrefix}
                onChange={e => setNewGroupPrefix(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGroup()}
                placeholder="email prefix (e.g. info)"
                className="flex-1 min-w-[140px] px-3 py-2.5 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <button
                onClick={addGroup}
                disabled={addingGroup || !newGroupName.trim() || !newGroupPrefix.trim()}
                className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {addingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
            {groupError && <p className="mt-2 text-sm text-red-400">{groupError}</p>}
            <p className="mt-2 text-xs text-[#475569]">
              The address will be <span className="font-mono text-[#94a3b8]">prefix@your-domain-or-workspace.vutler.ai</span>
            </p>
          </div>

          {/* Group list */}
          {groupsLoading ? (
            <p className="text-[#64748b] text-sm">Loading groups...</p>
          ) : emailGroups.length === 0 ? (
            <div className="p-6 text-center bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
              <p className="text-[#64748b]">No email groups created yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {emailGroups.map(g => (
                <div key={g.id} className="bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-white">{g.name}</p>
                      <p className="text-sm font-mono text-[#3b82f6]">{g.emailAddress}</p>
                      <p className="text-xs text-[#64748b] mt-1">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleGroupExpand(g.id)}
                        className="px-3 py-1.5 text-xs bg-[#334155] hover:bg-[#475569] rounded-lg transition-colors cursor-pointer"
                      >
                        {expandedGroupId === g.id ? 'Hide' : 'Manage'} members
                      </button>
                      <button
                        onClick={() => deleteGroup(g.id)}
                        className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded: members management */}
                  {expandedGroupId === g.id && (
                    <div className="px-4 pb-4 border-t border-[rgba(255,255,255,0.05)] pt-3 space-y-3">
                      {/* Current members */}
                      {g.members && g.members.length > 0 ? (
                        <div className="space-y-2">
                          {g.members.map(m => (
                            <div key={m.id} className="flex items-center justify-between py-1.5 px-2 bg-[#0f172a] rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${m.memberType === 'agent' ? 'bg-violet-900/40 text-violet-300' : 'bg-blue-900/40 text-blue-300'}`}>
                                  {m.memberType === 'agent' ? 'Agent' : 'Human'}
                                </span>
                                <span className="text-sm text-white">
                                  {m.memberType === 'agent' ? (m.agentName || m.agentUsername || 'Agent') : (m.humanName || m.humanEmail || 'Member')}
                                </span>
                              </div>
                              <button
                                onClick={() => removeMember(g.id, m.id)}
                                className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#64748b]">No members yet.</p>
                      )}

                      {/* Add agent member */}
                      <div className="flex gap-2 items-center">
                        <select
                          value={newMemberAgentId}
                          onChange={e => setNewMemberAgentId(e.target.value)}
                          className="flex-1 px-2 py-2 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6] cursor-pointer"
                        >
                          <option value="">Add an agent...</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => addMemberToGroup(g.id, 'agent')}
                          disabled={addingMember || !newMemberAgentId}
                          className="px-3 py-2 text-xs bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
                        >
                          Add
                        </button>
                      </div>

                      {/* Add human member */}
                      <div className="flex gap-2 items-center">
                        <input
                          type="email"
                          value={newMemberEmail}
                          onChange={e => setNewMemberEmail(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && newMemberEmail.trim() && addMemberToGroup(g.id, 'human')}
                          placeholder="Add a human email..."
                          className="flex-1 px-2 py-2 bg-[#0f172a] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
                        />
                        <button
                          onClick={() => addMemberToGroup(g.id, 'human')}
                          disabled={addingMember || !newMemberEmail.trim()}
                          className="px-3 py-2 text-xs bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
