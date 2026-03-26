import { apiFetch } from '../client';
import type { Memory, AgentContext, RememberPayload, SuccessResponse } from '../types';

// ─── Recall ───────────────────────────────────────────────────────────────────

/**
 * Recall instance-scope memories for an agent.
 * Optionally pass a query string for semantic search.
 */
export async function recallMemories(agentId: string, query?: string): Promise<Memory[]> {
  const params = new URLSearchParams({ limit: '20' });
  if (query) params.set('q', query);
  const data = await apiFetch<{ memories?: Memory[] }>(`/api/v1/agents/${agentId}/memories?${params}`);
  return data.memories ?? [];
}

/**
 * Recall template-scope memories shared by agents of the same role.
 */
export async function recallTemplateMemories(agentId: string, role?: string): Promise<Memory[]> {
  const params = new URLSearchParams({ limit: '20' });
  if (role) params.set('role', role);
  const data = await apiFetch<{ memories?: Memory[] }>(
    `/api/v1/agents/${agentId}/memories/template?${params}`
  );
  return data.memories ?? [];
}

// ─── Remember ─────────────────────────────────────────────────────────────────

/**
 * Store a new instance-scope memory for an agent.
 */
export async function rememberMemory(
  agentId: string,
  payload: RememberPayload
): Promise<void> {
  await apiFetch<SuccessResponse>(`/api/v1/agents/${agentId}/memories`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete an instance-scope memory (tombstone write via Snipara).
 */
export async function deleteMemory(agentId: string, memoryId: string): Promise<void> {
  await apiFetch<SuccessResponse>(`/api/v1/agents/${agentId}/memories/${memoryId}`, {
    method: 'DELETE',
  });
}

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * Get full agent context: instance memories, template count, soul doc, etc.
 */
export async function getAgentContext(agentId: string, role?: string): Promise<AgentContext> {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<AgentContext>(`/api/v1/agents/${agentId}/memories/context${qs}`);
}

// ─── Promote ──────────────────────────────────────────────────────────────────

/**
 * Promote an instance memory to template scope (shared with all agents of same role).
 */
export async function promoteMemory(
  agentId: string,
  memoryId: string,
  role?: string
): Promise<void> {
  await apiFetch<SuccessResponse>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/promote`,
    {
      method: 'POST',
      body: JSON.stringify({ role: role ?? 'general' }),
    }
  );
}
