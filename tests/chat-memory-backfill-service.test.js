'use strict';

jest.mock('../services/memoryConsolidationService', () => ({
  filterNovelMemories: jest.fn(async ({ memories }) => memories),
}));

jest.mock('../services/sniparaMemoryService', () => ({
  rememberScopedMemory: jest.fn(async () => ({ success: true })),
}));

jest.mock('../services/memoryTelemetryService', () => ({
  logMemoryEvent: jest.fn(),
}));

const { filterNovelMemories } = require('../services/memoryConsolidationService');
const { rememberScopedMemory } = require('../services/sniparaMemoryService');
const {
  agentMessageMatches,
  buildConversationEpisodes,
  deriveChatHistoryMemories,
  runChatHistoryMemoryBackfill,
} = require('../services/chatMemoryBackfillService');

describe('chatMemoryBackfillService', () => {
  beforeEach(() => {
    filterNovelMemories.mockClear();
    rememberScopedMemory.mockClear();
  });

  test('matches agent messages on id or username', () => {
    const agent = { id: 'agent-1', username: 'nora', name: 'Nora' };

    expect(agentMessageMatches({ sender_id: 'agent-1' }, agent)).toBe(true);
    expect(agentMessageMatches({ sender_id: 'nora' }, agent)).toBe(true);
    expect(agentMessageMatches({ sender_name: 'Nora' }, agent)).toBe(true);
    expect(agentMessageMatches({ sender_id: 'user-1', sender_name: 'Alex' }, agent)).toBe(false);
  });

  test('pairs user turns with the next agent response', () => {
    const { episodes, standalone } = buildConversationEpisodes([
      { id: 'm1', sender_id: 'user', sender_name: 'Alex', content: 'Je prefere le francais.', created_at: '2026-04-01T10:00:00Z' },
      { id: 'm2', sender_id: 'nora', sender_name: 'Nora', content: 'Compris, je repondrai en francais.', created_at: '2026-04-01T10:00:05Z' },
      { id: 'm3', sender_id: 'user', sender_name: 'Alex', content: 'Merci.', created_at: '2026-04-01T10:00:10Z' },
    ], { id: 'agent-1', username: 'nora', name: 'Nora' });

    expect(episodes).toHaveLength(1);
    expect(episodes[0].userMessage.id).toBe('m1');
    expect(episodes[0].assistantMessage.id).toBe('m2');
    expect(standalone).toHaveLength(1);
    expect(standalone[0].userMessage.id).toBe('m3');
  });

  test('derives human and relationship memories from chat history', () => {
    const memories = deriveChatHistoryMemories({
      messages: [
        {
          id: 'm1',
          channel_id: 'chan-1',
          sender_id: 'user',
          sender_name: 'alex@starbox-group.com',
          content: 'Je prefere des reponses courtes en francais.',
          created_at: '2026-04-01T10:00:00Z',
        },
        {
          id: 'm2',
          channel_id: 'chan-1',
          sender_id: 'nora',
          sender_name: 'Nora',
          content: 'Compris, je garderai des reponses courtes en francais pour toi.',
          created_at: '2026-04-01T10:00:05Z',
        },
      ],
      humanContext: { id: 'user-1' },
      agent: { id: 'agent-1', username: 'nora', name: 'Nora' },
    });

    expect(memories.some((memory) => memory.scopeKey === 'human' && /User contact: alex@starbox-group.com/.test(memory.text))).toBe(true);
    expect(memories.some((memory) => memory.scopeKey === 'human' && /reponses courtes/i.test(memory.text))).toBe(true);
    expect(memories.some((memory) => memory.scopeKey === 'human_agent' && memory.type === 'action_log')).toBe(true);
  });

  test('replays direct-message history into scoped memories', async () => {
    const db = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM tenant_vutler.chat_channels')) {
          return {
            rows: [
              {
                channel_id: 'chan-1',
                type: 'dm',
                created_by: 'user-1',
                created_at: '2026-04-01T10:00:00Z',
                updated_at: '2026-04-01T10:00:10Z',
                user_id: 'user-1',
                agent_id: null,
                agent_username: null,
                agent_name: null,
              },
              {
                channel_id: 'chan-1',
                type: 'dm',
                created_by: 'user-1',
                created_at: '2026-04-01T10:00:00Z',
                updated_at: '2026-04-01T10:00:10Z',
                user_id: 'agent-1',
                agent_id: 'agent-1',
                agent_username: 'nora',
                agent_name: 'Nora',
              },
            ],
          };
        }
        if (sql.includes('FROM tenant_vutler.chat_messages')) {
          return {
            rows: [
              {
                id: 'm1',
                channel_id: 'chan-1',
                sender_id: 'user-1',
                sender_name: 'alex@starbox-group.com',
                content: 'Je prefere des reponses courtes en francais.',
                created_at: '2026-04-01T10:00:00Z',
              },
              {
                id: 'm2',
                channel_id: 'chan-1',
                sender_id: 'agent-1',
                sender_name: 'Nora',
                content: 'Compris, je garderai des reponses courtes en francais pour toi.',
                created_at: '2026-04-01T10:00:05Z',
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    const result = await runChatHistoryMemoryBackfill(db, {
      workspaceId: 'ws-1',
      apply: true,
      scanLimit: 50,
    });

    expect(result.channels).toBe(1);
    expect(result.persisted_memories).toBeGreaterThan(0);
    expect(filterNovelMemories).toHaveBeenCalled();
    expect(rememberScopedMemory).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      agent: expect.objectContaining({ username: 'nora' }),
      source: 'chat-history-memory-backfill',
    }));
    expect(rememberScopedMemory.mock.calls.some(([input]) => input.scopeKey === 'human')).toBe(true);
    expect(rememberScopedMemory.mock.calls.some(([input]) => input.scopeKey === 'human_agent')).toBe(true);
  });
});
