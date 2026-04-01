import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentCapabilityState,
} from '@/lib/api/types';

import {
  CapabilityStatusCard,
  DEFAULT_CAPABILITY_DESCRIPTORS,
  type CapabilityDescriptor,
} from './CapabilityStatusCard';

export const CAPABILITY_ORDER: AgentCapabilityKey[] = [
  'email',
  'social',
  'drive',
  'calendar',
  'tasks',
  'memory',
  'sandbox',
];

export interface CapabilityMatrixSectionProps {
  matrix?: AgentCapabilityMatrix | null;
  title?: string;
  description?: string;
  capabilityMeta?: Partial<Record<AgentCapabilityKey, Partial<CapabilityDescriptor>>>;
  renderAction?: (capabilityKey: AgentCapabilityKey, state: AgentCapabilityState) => ReactNode;
  visibleKeys?: AgentCapabilityKey[];
  className?: string;
}

export function CapabilityMatrixSection({
  matrix,
  title = 'Capability Matrix',
  description = 'Runtime availability is resolved from workspace integrations, agent access policy, and provisioning state.',
  capabilityMeta,
  renderAction,
  visibleKeys = CAPABILITY_ORDER,
  className,
}: CapabilityMatrixSectionProps) {
  if (!matrix) return null;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {matrix.metadata?.plan_id ? (
            <Badge variant="outline" className="font-medium">
              Plan: {matrix.metadata.plan_id}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {matrix.warnings.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Configuration warnings
          </div>
          <div className="space-y-2">
            {matrix.warnings.map((warning) => (
              <div key={warning.key} className="text-sm text-amber-900 dark:text-amber-200">
                {warning.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleKeys.map((capabilityKey) => {
          const state = matrix.capabilities[capabilityKey];
          const descriptor = {
            ...DEFAULT_CAPABILITY_DESCRIPTORS[capabilityKey],
            ...(capabilityMeta?.[capabilityKey] || {}),
          };

          return (
            <CapabilityStatusCard
              key={capabilityKey}
              capabilityKey={capabilityKey}
              state={state}
              descriptor={descriptor}
              action={renderAction?.(capabilityKey, state)}
            />
          );
        })}
      </div>
    </section>
  );
}
