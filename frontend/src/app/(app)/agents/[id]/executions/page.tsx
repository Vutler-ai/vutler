'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { getAgentExecutions } from '@/lib/api/endpoints/agents';
import type { AgentExecution } from '@/lib/api/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function ExecutionDetailModal({
  execution,
  onClose,
}: {
  execution: AgentExecution;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
          <div>
            <h2 className="text-base font-semibold text-white">Execution Detail</h2>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              {new Date(execution.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {execution.tokens_used != null && (
              <span className="text-xs text-[#6b7280] bg-[#0e0f1a] px-2 py-1 rounded">
                {execution.tokens_used} tokens
              </span>
            )}
            {execution.latency_ms != null && (
              <span className="text-xs text-[#6b7280] bg-[#0e0f1a] px-2 py-1 rounded">
                {execution.latency_ms}ms
              </span>
            )}
            <button
              onClick={onClose}
              className="text-[#6b7280] hover:text-white text-2xl leading-none transition-colors"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wider">Input</label>
            <pre className="bg-[#0a0b14] rounded-lg p-4 text-sm text-white font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
              {execution.input || '(empty)'}
            </pre>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wider">Output</label>
            <pre className="bg-[#0a0b14] rounded-lg p-4 text-sm text-white font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
              {execution.output || '(no output)'}
            </pre>
          </div>
          {execution.model && (
            <p className="text-xs text-[#6b7280]">Model: {execution.model}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i} className="border-[rgba(255,255,255,0.05)]">
          <TableCell className="px-4 py-3"><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell className="px-4 py-3"><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell className="px-4 py-3"><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell className="px-4 py-3"><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell className="px-4 py-3"><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutionsPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [selected, setSelected] = useState<AgentExecution | null>(null);

  const { data: executions, isLoading, error, mutate } = useApi<AgentExecution[]>(
    `/api/v1/agents/${agentId}/executions`,
    () => getAgentExecutions(agentId),
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const truncate = (str: string, n = 60) =>
    str && str.length > n ? str.slice(0, n) + '…' : (str || '—');

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-white">Execution History</h2>
          {!isLoading && executions && (
            <p className="text-sm text-[#9ca3af] mt-0.5">{executions.length} executions</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          className="border-[rgba(255,255,255,0.1)] bg-transparent text-white hover:bg-[rgba(255,255,255,0.05)]"
        >
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-6 text-center text-red-400">
          Failed to load executions.{' '}
          <button onClick={() => mutate()} className="underline ml-1">Retry</button>
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[rgba(255,255,255,0.07)] hover:bg-transparent">
                <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Timestamp</TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Input</TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Output</TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Duration</TableHead>
                <TableHead className="px-4 py-3 text-xs font-medium text-[#6b7280] uppercase tracking-wider">Model</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton />}

              {!isLoading && (!executions || executions.length === 0) && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={5} className="text-center py-16 text-[#6b7280]">
                    No executions yet.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && executions && executions.map((ex, i) => (
                <TableRow
                  key={ex.id || i}
                  onClick={() => setSelected(ex)}
                  className="border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
                >
                  <TableCell className="px-4 py-3 text-sm text-[#9ca3af] whitespace-nowrap">
                    {formatDate(ex.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-white font-mono max-w-[220px]">
                    {truncate(ex.input)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-[#9ca3af] font-mono max-w-[220px]">
                    {truncate(ex.output)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-[#9ca3af] whitespace-nowrap">
                    {ex.latency_ms != null ? `${ex.latency_ms}ms` : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-[#9ca3af]">
                    {ex.model || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <ExecutionDetailModal execution={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
