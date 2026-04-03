'use strict';

jest.mock('../services/memoryTelemetryService', () => ({
  logMemoryEvent: jest.fn(),
}));

jest.mock('../services/sniparaMemoryService', () => ({
  buildAgentMemoryBindings: jest.fn((agent, workspaceId, humanContext) => ({
    instance: {
      scope: 'agent',
      category: `${workspaceId}-agent-${agent.username}`,
    },
    human: humanContext
      ? {
          scope: 'project',
          category: `${workspaceId}-human-${humanContext.id || humanContext.name}`,
        }
      : null,
    human_agent: humanContext
      ? {
          scope: 'agent',
          category: `${workspaceId}-agent-${agent.username}-human-${humanContext.id || humanContext.name}`,
        }
      : null,
  })),
  listAgentMemories: jest.fn(),
}));

jest.mock('../services/memoryConsolidationService', () => ({
  findRecentDuplicate: jest.fn(),
}));

jest.mock('../services/sniparaResolver', () => ({
  callSniparaTool: jest.fn(),
}));

const {
  listAgentMemories,
} = require('../services/sniparaMemoryService');
const { findRecentDuplicate } = require('../services/memoryConsolidationService');
const { callSniparaTool } = require('../services/sniparaResolver');
const {
  BACKFILL_SOURCE,
  buildHumanScopeBackfillCandidate,
  collectHumanScopeBackfillCandidates,
  runHumanMemoryBackfill,
} = require('../services/memoryBackfillService');

describe('memoryBackfillService', () => {
  beforeEach(() => {
    listAgentMemories.mockReset();
    findRecentDuplicate.mockReset();
    callSniparaTool.mockReset();
  });

  test('builds a human candidate for misplaced user profile memories', () => {
    const candidate = buildHumanScopeBackfillCandidate({
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'mike' },
      memory: {
        id: 'mem-1',
        text: 'User preference/context: Alex prefers concise answers in French.',
        type: 'user_profile',
        scope: 'agent',
        scope_key: 'instance',
        category: 'ws-1-agent-mike',
        metadata: {
          user_id: 'user-1',
          user_name: 'Alex',
          memory_scope_key: 'human',
          memory_lane: 'user_profile',
        },
      },
    });

    expect(candidate).toMatchObject({
      desiredScopeKey: 'human',
      humanContext: { id: 'user-1', name: 'Alex' },
      target: {
        scope: 'project',
        category: 'ws-1-human-user-1',
      },
    });
  });

  test('collects relationship candidates for old user-bound action logs', () => {
    const candidates = collectHumanScopeBackfillCandidates({
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'mike' },
      memories: [{
        id: 'mem-2',
        text: 'Conversation note: User said "hello" and agent replied "hi"',
        type: 'action_log',
        scope: 'agent',
        scope_key: 'instance',
        category: 'ws-1-agent-mike',
        visibility: 'internal',
        metadata: {
          user_id: 'user-1',
          user_name: 'Alex',
          memory_lane: 'conversation_log',
        },
      }],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].desiredScopeKey).toBe('human_agent');
    expect(candidates[0].target.category).toBe('ws-1-agent-mike-human-user-1');
  });

  test('migrates misplaced memories and forgets the source when apply=true', async () => {
    listAgentMemories.mockResolvedValue({
      agent: { id: 'agent-1', username: 'mike', workspace_id: 'ws-1' },
      memories: [{
        id: 'mem-1',
        text: 'User preference/context: Alex prefers concise answers in French.',
        type: 'user_profile',
        importance: 0.8,
        scope: 'agent',
        scope_key: 'instance',
        category: 'ws-1-agent-mike',
        visibility: 'reviewable',
        metadata: {
          user_id: 'user-1',
          user_name: 'Alex',
          memory_scope_key: 'human',
          memory_lane: 'user_profile',
        },
      }],
      has_more: false,
      count_is_estimate: false,
    });
    findRecentDuplicate.mockResolvedValue(null);
    callSniparaTool
      .mockResolvedValueOnce({ success: true, id: 'new-memory' })
      .mockResolvedValueOnce({ success: true });

    const db = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
          return {
            rows: [{
              id: 'agent-1',
              username: 'mike',
              role: 'engineering',
              workspace_id: params[0],
            }],
          };
        }
        return { rows: [] };
      }),
    };

    const result = await runHumanMemoryBackfill(db, {
      workspaceId: 'ws-1',
      apply: true,
      scanLimit: 100,
    });

    expect(result.migrated).toBe(1);
    expect(result.deleted_sources).toBe(1);
    expect(callSniparaTool).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toolName: 'rlm_remember',
      args: expect.objectContaining({
        scope: 'project',
        category: 'ws-1-human-user-1',
        metadata: expect.objectContaining({
          source: BACKFILL_SOURCE,
          migrated_from_memory_id: 'mem-1',
          memory_scope_key: 'human',
        }),
      }),
    }));
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_forget',
      args: { memory_id: 'mem-1' },
    }));
  });

  test('forgets the old source without rewriting when a target duplicate already exists', async () => {
    listAgentMemories.mockResolvedValue({
      agent: { id: 'agent-1', username: 'mike', workspace_id: 'ws-1' },
      memories: [{
        id: 'mem-1',
        text: 'User preference/context: Alex prefers concise answers in French.',
        type: 'user_profile',
        importance: 0.8,
        scope: 'agent',
        scope_key: 'instance',
        category: 'ws-1-agent-mike',
        visibility: 'reviewable',
        metadata: {
          user_id: 'user-1',
          user_name: 'Alex',
          memory_scope_key: 'human',
          memory_lane: 'user_profile',
        },
      }],
      has_more: false,
      count_is_estimate: false,
    });
    findRecentDuplicate.mockResolvedValue({
      id: 'mem-target',
      text: 'User preference/context: Alex prefers concise answers in French.',
      type: 'user_profile',
    });
    callSniparaTool.mockResolvedValue({ success: true });

    const db = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
          return {
            rows: [{
              id: 'agent-1',
              username: 'mike',
              role: 'engineering',
              workspace_id: params[0],
            }],
          };
        }
        return { rows: [] };
      }),
    };

    const result = await runHumanMemoryBackfill(db, {
      workspaceId: 'ws-1',
      apply: true,
    });

    expect(result.migrated).toBe(0);
    expect(result.duplicate_targets).toBe(1);
    expect(result.deleted_sources).toBe(1);
    expect(callSniparaTool).toHaveBeenCalledTimes(1);
    expect(callSniparaTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'rlm_forget',
      args: { memory_id: 'mem-1' },
    }));
  });
});
