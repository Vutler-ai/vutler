'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  DEFAULT_COUNT_LIMIT: 200,
  listAgentMemories: jest.fn(async () => ({ agent: { username: 'alex' }, memories: [] })),
  softDeleteAgentMemory: jest.fn(async () => ({ success: true })),
}));

jest.mock('../services/memoryTelemetryService', () => ({
  logMemoryEvent: jest.fn(),
}));

const {
  listAgentMemories,
  softDeleteAgentMemory,
} = require('../services/sniparaMemoryService');
const {
  collectMaintenanceCandidates,
  maintainAgentMemories,
} = require('../services/memoryMaintenanceService');

describe('memoryMaintenanceService', () => {
  beforeEach(() => {
    listAgentMemories.mockClear();
    softDeleteAgentMemory.mockClear();
  });

  test('collects expired short-lived memories and duplicate durable memories', () => {
    const candidates = collectMaintenanceCandidates([
      {
        id: 'm1',
        type: 'action_log',
        text: 'Conversation note: short-lived',
        importance: 0.1,
        metadata: { expires_at: '2020-01-01T00:00:00.000Z' },
      },
      {
        id: 'm2',
        type: 'user_profile',
        text: 'User preference/context: Alex prefers concise answers in French',
        importance: 0.8,
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'm3',
        type: 'user_profile',
        text: 'User preference/context: Alex prefers concise answers in french.',
        importance: 0.6,
        created_at: '2026-02-01T00:00:00.000Z',
      },
    ]);

    expect(candidates.map((item) => item.id).sort()).toEqual(['m1', 'm3']);
  });

  test('soft-deletes maintenance candidates for an agent', async () => {
    listAgentMemories.mockResolvedValue({
      agent: { username: 'alex', id: 'agent-1' },
      memories: [
        {
          id: 'm1',
          type: 'tool_observation',
          text: 'Tool observation: fetch_docs -> done',
          importance: 0.2,
          metadata: { expires_at: '2020-01-01T00:00:00.000Z' },
        },
        {
          id: 'm2',
          type: 'decision',
          text: 'Decision: Always use Codex for engineering tasks.',
          importance: 0.8,
          created_at: '2026-03-10T00:00:00.000Z',
        },
        {
          id: 'm3',
          type: 'decision',
          text: 'Decision: Always use Codex for engineering tasks.',
          importance: 0.5,
          created_at: '2026-02-10T00:00:00.000Z',
        },
      ],
    });

    const result = await maintainAgentMemories({
      db: {},
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'alex', role: 'engineering' },
    });

    expect(result.deleted).toHaveLength(2);
    expect(softDeleteAgentMemory).toHaveBeenCalledTimes(2);
  });
});
