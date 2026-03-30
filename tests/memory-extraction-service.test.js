'use strict';

jest.mock('../services/memoryConsolidationService', () => ({
  filterNovelMemories: jest.fn(async ({ memories }) => memories),
}));

jest.mock('../services/memoryPromotionService', () => ({
  maybeAutoPromoteMemories: jest.fn(async () => []),
}));

const consolidation = require('../services/memoryConsolidationService');
const promotion = require('../services/memoryPromotionService');
const {
  deriveMemoriesFromConversation,
  deriveTaskEpisodeMemory,
  deriveToolObservationMemory,
  extractUserProfileMemoriesFromMessages,
  inferDecisionScope,
  extractConversationMemories,
} = require('../services/memoryExtractionService');

describe('memoryExtractionService', () => {
  beforeEach(() => {
    consolidation.filterNovelMemories.mockClear();
    promotion.maybeAutoPromoteMemories.mockClear();
  });

  test('extracts user profile and template decision from conversation', () => {
    const memories = deriveMemoriesFromConversation({
      userMessage: 'Je m\'appelle Alex et je prefere des reponses courtes. On utilise toujours Codex pour le dev.',
      assistantMessage: 'Compris, on garde Codex comme standard.',
      userName: 'Alex',
    });

    expect(memories.some((memory) => memory.type === 'user_profile' && /Alex/.test(memory.text))).toBe(true);
    expect(memories.some((memory) => memory.type === 'decision' && memory.scopeKey === 'template')).toBe(true);
  });

  test('extracts user profile memories from a message history', () => {
    const memories = extractUserProfileMemoriesFromMessages([
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: "Hi, I'm Mike and I prefer concise answers in English." },
      { role: 'user', content: 'My timezone is Europe/Zurich and I work in operations.' },
    ], 'Mike');

    expect(memories.some((memory) => memory.type === 'user_profile' && /Mike/.test(memory.text))).toBe(true);
    expect(memories.some((memory) => memory.type === 'user_profile' && /timezone/i.test(memory.text))).toBe(true);
  });

  test('creates internal task episode memory from completed task output', () => {
    const memory = deriveTaskEpisodeMemory({
      task: { id: 'task-1', title: 'Audit memory layer', priority: 'high' },
      response: 'Identified the main bug and fixed the counting path across the dashboard.',
    });

    expect(memory).toMatchObject({
      type: 'task_episode',
      visibility: 'internal',
      scopeKey: 'instance',
    });
    expect(memory.text).toContain('Audit memory layer');
  });

  test('creates internal tool observation memory', () => {
    const memory = deriveToolObservationMemory({
      toolName: 'skill_sync_docs',
      args: { path: '/tmp/report.md' },
      result: { success: true, data: { updated: 3 } },
    });

    expect(memory).toMatchObject({
      type: 'tool_observation',
      visibility: 'internal',
      scopeKey: 'instance',
    });
    expect(memory.text).toContain('skill_sync_docs');
  });

  test('infers global scope for workspace-wide decisions', () => {
    expect(inferDecisionScope('This is now a workspace policy for all agents')).toBe('global');
  });

  test('runs extracted memories through consolidation before persist', async () => {
    consolidation.filterNovelMemories.mockResolvedValue([]);
    const result = await extractConversationMemories({
      db: {},
      workspaceId: 'ws-1',
      agent: { username: 'mike', role: 'engineering' },
      userMessage: 'My name is Alex and I prefer concise answers.',
      assistantMessage: 'Understood.',
      userName: 'Alex',
    });

    expect(consolidation.filterNovelMemories).toHaveBeenCalled();
    expect(promotion.maybeAutoPromoteMemories).toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
