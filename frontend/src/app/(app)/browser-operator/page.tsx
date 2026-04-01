'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  browserOperatorApi,
} from '@/lib/api/index';
import type {
  BrowserOperatorFlow,
  BrowserOperatorProfile,
  BrowserOperatorRun,
  BrowserOperatorRunEvidence,
  BrowserOperatorRunReport,
} from '@/lib/api/types';

const integrationCards = [
  {
    title: 'Cloud Browser',
    description: 'Headless browser runtime with bounded actions, screenshots, logs, and network evidence.',
  },
  {
    title: 'Agent Mailbox',
    description: 'Magic-link and email-code flows read the agent mailbox directly instead of asking the user.',
  },
  {
    title: 'Reporting',
    description: 'Each run exports a report, evidence pack, screenshots, logs, and session results.',
  },
];

function statusClass(status: string) {
  if (status === 'completed') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (status === 'failed') return 'bg-red-500/15 text-red-400 border-red-500/20';
  if (status === 'running') return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return 'bg-[rgba(255,255,255,0.05)] text-[#9ca3af] border-[rgba(255,255,255,0.1)]';
}

export default function BrowserOperatorPage() {
  const [profiles, setProfiles] = useState<BrowserOperatorProfile[]>([]);
  const [flows, setFlows] = useState<BrowserOperatorFlow[]>([]);
  const [runs, setRuns] = useState<BrowserOperatorRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BrowserOperatorRun | null>(null);
  const [selectedReport, setSelectedReport] = useState<BrowserOperatorRunReport | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<BrowserOperatorRunEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileKey, setProfileKey] = useState('');
  const [flowKey, setFlowKey] = useState('');
  const [targetUrl, setTargetUrl] = useState('https://vutler.ai');
  const [appKey, setAppKey] = useState('browser_app');
  const [credentialsRef, setCredentialsRef] = useState('');
  const [sessionMode, setSessionMode] = useState<'ephemeral' | 'named'>('ephemeral');
  const [sessionKey, setSessionKey] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextProfiles, nextFlows, nextRuns] = await Promise.all([
        browserOperatorApi.getBrowserOperatorProfiles(),
        browserOperatorApi.getBrowserOperatorFlows(),
        browserOperatorApi.getBrowserOperatorRuns(20),
      ]);
      setProfiles(nextProfiles);
      setFlows(nextFlows);
      setRuns(nextRuns);

      if (!profileKey && nextProfiles[0]) {
        setProfileKey(nextProfiles[0].key);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Browser Operator');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.key === profileKey) || null,
    [profiles, profileKey]
  );

  const availableFlows = useMemo(
    () => flows.filter((flow) => selectedProfile?.definition.supported_flows.includes(flow.key)),
    [flows, selectedProfile]
  );

  useEffect(() => {
    if (!availableFlows.length) {
      setFlowKey('');
      return;
    }
    if (!availableFlows.find((flow) => flow.key === flowKey)) {
      setFlowKey(availableFlows[0].key);
    }
  }, [availableFlows, flowKey]);

  async function openRun(run: BrowserOperatorRun) {
    setSelectedRun(run);
    try {
      const [report, evidence] = await Promise.all([
        browserOperatorApi.getBrowserOperatorRunReport(run.id).catch(() => null),
        browserOperatorApi.getBrowserOperatorRunEvidence(run.id).catch(() => []),
      ]);
      setSelectedReport(report);
      setSelectedEvidence(evidence);
    } catch (_) {
      setSelectedReport(null);
      setSelectedEvidence([]);
    }
  }

  async function handleLaunchRun() {
    if (!profileKey || !flowKey || !targetUrl.trim()) {
      setError('Profile, flow, and target URL are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const run = await browserOperatorApi.createBrowserOperatorRun({
        runtimeMode: 'cloud-browser',
        profileKey,
        flowKey,
        target: {
          appKey: appKey.trim() || 'browser_app',
          baseUrl: targetUrl.trim(),
        },
        credentialsRef: credentialsRef.trim() || undefined,
        sessionMode,
        sessionKey: sessionMode === 'named' ? (sessionKey.trim() || `${appKey || profileKey}-session`) : undefined,
        governance: {
          agentEmail: agentEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        reportFormat: 'full',
      });
      await load();
      await openRun(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch browser run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Browser Operator"
        description="Deployable browser testing agents with browser runtime, agent mailbox, and reporting."
      >
        <Button
          variant="outline"
          className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]"
          onClick={load}
        >
          Refresh
        </Button>
      </PageHeader>

      <div className="px-6 pb-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {integrationCards.map((item) => (
            <Card key={item.title} className="border-[rgba(255,255,255,0.08)] bg-[#14151f] text-white">
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription className="text-[#9ca3af]">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-[rgba(255,255,255,0.08)] bg-[#14151f] text-white">
            <CardHeader>
              <CardTitle>Deployable Agent Profile</CardTitle>
              <CardDescription className="text-[#9ca3af]">
                The user deploys an agent profile. Integrations and bounded browser actions stay behind that product surface.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                {profiles.map((profile) => {
                  const active = profile.key === profileKey;
                  return (
                    <button
                      key={profile.key}
                      type="button"
                      onClick={() => setProfileKey(profile.key)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-[rgba(255,255,255,0.08)] bg-[#0f1017] hover:border-[rgba(255,255,255,0.16)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{profile.definition.name}</div>
                          <div className="text-xs text-[#9ca3af]">{profile.key}</div>
                        </div>
                        <Badge className="bg-[rgba(255,255,255,0.05)] text-[#d1d5db] border-[rgba(255,255,255,0.1)]">
                          Agent
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300">
                          Browser
                        </span>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                          Mailbox
                        </span>
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                          Reporting
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flow-select">Flow</Label>
                  <select
                    id="flow-select"
                    value={flowKey}
                    onChange={(event) => setFlowKey(event.target.value)}
                    className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0f1017] px-3 text-sm text-white"
                  >
                    {availableFlows.map((flow) => (
                      <option key={flow.key} value={flow.key}>
                        {flow.definition.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-url">Target URL</Label>
                  <Input id="target-url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="app-key">App Key</Label>
                  <Input id="app-key" value={appKey} onChange={(event) => setAppKey(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credentials-ref">Credentials Ref</Label>
                  <Input
                    id="credentials-ref"
                    placeholder="vault://workspace/browser-login-smoke"
                    value={credentialsRef}
                    onChange={(event) => setCredentialsRef(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-mode">Session Mode</Label>
                  <select
                    id="session-mode"
                    value={sessionMode}
                    onChange={(event) => setSessionMode(event.target.value as 'ephemeral' | 'named')}
                    className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0f1017] px-3 text-sm text-white"
                  >
                    <option value="ephemeral">Ephemeral</option>
                    <option value="named">Named Session</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="session-key">Session Key</Label>
                  <Input
                    id="session-key"
                    disabled={sessionMode !== 'named'}
                    placeholder="synthetic-user-qa-session"
                    value={sessionKey}
                    onChange={(event) => setSessionKey(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="agent-email">Agent Mailbox</Label>
                  <Input
                    id="agent-email"
                    placeholder="agent mailbox used for magic-link and email-code flows"
                    value={agentEmail}
                    onChange={(event) => setAgentEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Run Notes</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    placeholder="Optional run notes or process scope context"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={submitting || loading}
                  onClick={handleLaunchRun}
                >
                  {submitting ? 'Launching...' : 'Launch Browser Agent Run'}
                </Button>
                <span className="text-xs text-[#9ca3af]">
                  Seen by the user as an agent profile. Browser, mailbox, and reporting stay underneath as integrations.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[rgba(255,255,255,0.08)] bg-[#14151f] text-white">
            <CardHeader>
              <CardTitle>Run Detail</CardTitle>
              <CardDescription className="text-[#9ca3af]">
                Latest report and evidence for the selected browser agent run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedRun ? (
                <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.1)] px-4 py-8 text-center text-sm text-[#6b7280]">
                  Select a run to inspect its report and evidence pack.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{selectedRun.profile_key}</div>
                      <div className="text-xs text-[#9ca3af]">{selectedRun.flow_key}</div>
                    </div>
                    <Badge className={statusClass(selectedRun.status)}>{selectedRun.status}</Badge>
                  </div>

                  {selectedReport && (
                    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0f1017] p-4">
                      <div className="mb-2 text-sm font-semibold text-white">Report</div>
                      <div className="grid grid-cols-3 gap-3 text-xs text-[#9ca3af]">
                        <div>
                          <div className="text-white">{selectedReport.totals.steps}</div>
                          <div>Steps</div>
                        </div>
                        <div>
                          <div className="text-white">{selectedReport.totals.passed}</div>
                          <div>Passed</div>
                        </div>
                        <div>
                          <div className="text-white">{selectedReport.totals.failed}</div>
                          <div>Failed</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-white">Evidence</div>
                    <div className="max-h-64 space-y-2 overflow-auto pr-1">
                      {selectedEvidence.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0f1017] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white">{item.artifact_kind}</span>
                            <span className="text-[#6b7280]">{item.mime_type || 'artifact'}</span>
                          </div>
                          {item.metadata?.download_url && (
                            <a
                              href={String(item.metadata.download_url)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block text-blue-400 hover:text-blue-300"
                            >
                              Open artifact
                            </a>
                          )}
                          {item.metadata?.file_path && (
                            <div className="mt-1 break-all text-[#9ca3af]">{String(item.metadata.file_path)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[rgba(255,255,255,0.08)] bg-[#14151f] text-white">
          <CardHeader>
            <CardTitle>Recent Browser Agent Runs</CardTitle>
            <CardDescription className="text-[#9ca3af]">
              Agent-first execution history. Each run is backed by browser, mailbox, and evidence integrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] text-left text-[#9ca3af]">
                    <th className="pb-3 pr-4 font-medium">Agent Profile</th>
                    <th className="pb-3 pr-4 font-medium">Flow</th>
                    <th className="pb-3 pr-4 font-medium">Target</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Session</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-[rgba(255,255,255,0.05)]">
                      <td className="py-3 pr-4 text-white">{run.profile_key}</td>
                      <td className="py-3 pr-4 text-[#d1d5db]">{run.flow_key}</td>
                      <td className="py-3 pr-4 text-[#9ca3af]">{String(run.target?.baseUrl || '—')}</td>
                      <td className="py-3 pr-4">
                        <Badge className={statusClass(run.status)}>{run.status}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-[#9ca3af]">
                        {run.session_mode === 'named' ? (run.session_key || 'named') : 'ephemeral'}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                          onClick={() => openRun(run)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!runs.length && !loading && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-[#6b7280]">
                        No browser agent runs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
