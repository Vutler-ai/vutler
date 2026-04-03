'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authFetch } from '@/lib/authFetch';
import type {
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentIntegrationReadinessEntry,
  AgentIntegrationReadinessPayload,
} from '@/lib/api/types';
import { CapabilityMatrixSection } from '@/components/agents/settings/CapabilityMatrixSection';

interface AgentSummary {
  id: string;
  name: string;
}

function statusTone(active: boolean, blockedTone = 'border-slate-700 bg-slate-900 text-slate-300') {
  return active
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : blockedTone;
}

function capabilityLabel(key: AgentCapabilityKey): string {
  return key.replace(/_/g, ' ');
}

function ConnectorStateCard({ connector }: { connector: AgentIntegrationReadinessEntry }) {
  return (
    <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl">{connector.icon}</span>
            <div className="space-y-1">
              <CardTitle className="text-base">{connector.name}</CardTitle>
              <CardDescription className="text-[#9ca3af]">{connector.description}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className={connector.connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-300'}>
              {connector.connected ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge variant="outline" className={
              connector.readiness === 'operational'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : connector.readiness === 'partial'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
            }>
              {connector.readiness_label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={statusTone(connector.state.workspace_available)}>
            Workspace: {connector.state.workspace_available ? 'Yes' : 'No'}
          </Badge>
          <Badge variant="outline" className={statusTone(connector.state.agent_allowed, 'border-amber-500/30 bg-amber-500/10 text-amber-300')}>
            Allowed: {connector.state.agent_allowed ? 'Yes' : 'No'}
          </Badge>
          <Badge variant="outline" className={statusTone(connector.state.provisioned, 'border-amber-500/30 bg-amber-500/10 text-amber-300')}>
            Provisioned: {connector.state.provisioned ? 'Yes' : 'No'}
          </Badge>
          <Badge variant="outline" className={connector.state.effective ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}>
            {connector.state.effective ? 'Effective' : 'Blocked'}
          </Badge>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-[#9ca3af]">
          {connector.state.reason || 'No runtime explanation available.'}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={connector.access_model === 'local-first' ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-white/10 bg-white/5 text-[#d1d5db]'}>
            {connector.access_model_label}
          </Badge>
          {connector.related_capabilities.length > 0 ? connector.related_capabilities.map((capability) => (
            <Badge key={capability} variant="outline" className="border-white/10 bg-white/5 text-[#d1d5db]">
              {capabilityLabel(capability)}
            </Badge>
          )) : (
            <Badge variant="outline" className="border-white/10 bg-white/5 text-[#d1d5db]">
              Workspace-scoped tool path
            </Badge>
          )}
        </div>

        <p className="text-xs leading-relaxed text-[#6b7280]">
          {connector.access_model_description}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" asChild className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <Link href={`/settings/integrations/${connector.provider}`}>Open connector</Link>
          </Button>
          <Button variant="outline" asChild className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <Link href="/settings/integrations">Workspace integrations</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentIntegrationsPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [matrix, setMatrix] = useState<AgentCapabilityMatrix | null>(null);
  const [connectors, setConnectors] = useState<AgentIntegrationReadinessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      authFetch(`/api/v1/agents/${id}`).then((response) => response.json()),
      authFetch(`/api/v1/agents/${id}/capability-matrix`).then((response) => response.json()),
      authFetch(`/api/v1/integrations/agent/${id}/readiness`).then((response) => response.json()),
    ])
      .then(([agentResponse, matrixResponse, readinessResponse]) => {
        if (cancelled) return;

        setAgent(agentResponse?.agent ? { id: agentResponse.agent.id, name: agentResponse.agent.name } : null);
        setMatrix(matrixResponse?.data || null);
        setConnectors((readinessResponse?.data as AgentIntegrationReadinessPayload | undefined)?.connectors || []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load agent integration readiness.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const blockedCount = useMemo(
    () => connectors.filter((connector) => !connector.state.effective).length,
    [connectors]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="h-64 rounded-xl border border-white/10 bg-[#14151f] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-[#6b7280]">Agent integrations</p>
          <h1 className="text-2xl font-semibold text-white">
            {agent?.name || 'Agent'} runtime readiness
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#9ca3af]">
            Workspace connectors stay global. This screen shows whether those connectors are actually usable by this agent, based on agent access, provisioning, and runtime effectiveness.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/agents/${id}/config`}>Open Agent Settings</Link>
          </Button>
          <Button variant="outline" asChild className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <Link href="/settings/integrations">Open Workspace Integrations</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-red-500/20 bg-red-500/10 text-red-200">
          <AlertTitle>Readiness unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-blue-500/20 bg-blue-500/5 text-blue-100">
        <AlertTitle>Configuration model</AlertTitle>
        <AlertDescription>
          Workspace integrations do not belong to one agent. This screen is read-only and explains runtime readiness through four states: workspace availability, agent allowance, provisioning, and effective execution.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
          <CardHeader>
            <CardTitle>What blocks an agent</CardTitle>
            <CardDescription className="text-[#9ca3af]">
              A connector can be connected at workspace level and still remain unusable for this agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[#9ca3af]">
            <p>`workspace_available` means the workspace connected the provider or exposes the runtime path.</p>
            <p>`agent_allowed` means the access policy allows this agent to use the related runtime capability.</p>
            <p>`provisioned` means concrete setup exists for the agent or connector path.</p>
            <p>`effective` is the only state that means the agent can use the connector now.</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
          <CardHeader>
            <CardTitle>Current snapshot</CardTitle>
            <CardDescription className="text-[#9ca3af]">
              Focus review on connectors that are connected but still blocked for this agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#0f1117] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#6b7280]">Connectors</div>
              <div className="mt-2 text-3xl font-semibold text-white">{connectors.length}</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Blocked</div>
              <div className="mt-2 text-3xl font-semibold text-white">{blockedCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CapabilityMatrixSection
        matrix={matrix}
        className="rounded-2xl border border-white/10 bg-[#14151f] p-6"
        title="Agent capability matrix"
        description="The matrix remains the source of truth for runtime capability gating. Connector cards below map those capabilities back to concrete workspace integrations."
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Workspace connector entry points</h2>
          <p className="mt-1 text-sm text-[#9ca3af]">
            These cards explain whether each workspace connector is usable by this agent and why a connector stays blocked when it does.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {connectors.map((connector) => (
            <ConnectorStateCard key={connector.provider} connector={connector} />
          ))}
        </div>
      </section>
    </div>
  );
}
