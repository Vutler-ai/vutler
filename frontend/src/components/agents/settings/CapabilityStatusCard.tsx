import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  AgentCapabilityKey,
  AgentCapabilityState,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';

export interface CapabilityDescriptor {
  label: string;
  description: string;
}

export const DEFAULT_CAPABILITY_DESCRIPTORS: Record<AgentCapabilityKey, CapabilityDescriptor> = {
  email: {
    label: 'Email',
    description: 'Outbound and inbound email execution for the agent.',
  },
  social: {
    label: 'Social',
    description: 'Publishing and social account execution resolved by orchestration.',
  },
  drive: {
    label: 'Drive',
    description: 'Shared workspace drive access and document actions.',
  },
  calendar: {
    label: 'Calendar',
    description: 'Calendar scheduling and event management.',
  },
  tasks: {
    label: 'Tasks',
    description: 'Task execution and async work lanes.',
  },
  memory: {
    label: 'Memory',
    description: 'Persistent contextual memory backed by Snipara.',
  },
  sandbox: {
    label: 'Sandbox',
    description: 'Governed code execution for technical agent types only.',
  },
};

function statusBadgeClass(active: boolean): string {
  return active
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border-slate-300/60 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
}

function effectiveBadgeClass(active: boolean): string {
  return active
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function formatScopeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const items = value.map((item) => formatScopeValue(item)).filter(Boolean) as string[];
    return items.length > 0 ? items.join(', ') : null;
  }
  if (typeof value === 'object') {
    return null;
  }
  return String(value);
}

function ScopeRows({ scope }: { scope?: Record<string, unknown> | null }) {
  if (!scope || typeof scope !== 'object') return null;

  const entries = Object.entries(scope)
    .map(([key, value]) => ({
      key,
      value: formatScopeValue(value),
    }))
    .filter((entry) => entry.value);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-muted-foreground">
            {entry.key.replace(/_/g, ' ')}
          </span>
          <span className="text-foreground sm:text-right">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

interface StatusChipProps {
  label: string;
  active: boolean;
}

function StatusChip({ label, active }: StatusChipProps) {
  return (
    <Badge variant="outline" className={cn('font-medium', statusBadgeClass(active))}>
      {label}: {active ? 'Yes' : 'No'}
    </Badge>
  );
}

export interface CapabilityStatusCardProps {
  capabilityKey: AgentCapabilityKey;
  state: AgentCapabilityState;
  descriptor?: Partial<CapabilityDescriptor>;
  action?: ReactNode;
  className?: string;
}

export function CapabilityStatusCard({
  capabilityKey,
  state,
  descriptor,
  action,
  className,
}: CapabilityStatusCardProps) {
  const fallbackDescriptor = DEFAULT_CAPABILITY_DESCRIPTORS[capabilityKey];
  const label = descriptor?.label || fallbackDescriptor.label;
  const description = descriptor?.description || fallbackDescriptor.description;

  return (
    <Card className={cn('gap-4 py-5', className)}>
      <CardHeader className="gap-3 px-5 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="outline" className={cn('font-medium', effectiveBadgeClass(state.effective))}>
            {state.effective ? 'Effective' : 'Blocked'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap gap-2">
          <StatusChip label="Workspace" active={state.workspace_available} />
          <StatusChip label="Allowed" active={state.agent_allowed} />
          <StatusChip label="Provisioned" active={state.provisioned} />
        </div>

        {state.reason ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {state.reason}
          </div>
        ) : null}

        <ScopeRows scope={state.scope} />

        {action ? <div className="border-t border-border/60 pt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
