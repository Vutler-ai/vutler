'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  buildRuntimeMemoryBundle: jest.fn(() => Promise.resolve({
    memories: [{ id: 'm1', type: 'fact', text: 'User prefers concise French answers.' }],
    stats: { runtime: 'chat', query: 'French answers', selected: { total: 1, instance: 1, template: 0, global: 0 } },
    sections: {
      instance: [{ id: 'm1', type: 'fact', text: 'User prefers concise French answers.' }],
      template: [],
      global: [],
    },
  })),
}));

jest.mock('../services/sessionContinuityService', () => ({
  listRuntimeContinuitySummaries: jest.fn(() => Promise.resolve([
    { type: 'workspace-session', text: 'Current workspace priority: keep answers concise.' },
  ])),
}));

jest.mock('../services/groupMemoryService', () => ({
  listRuntimeGroupMemories: jest.fn(() => Promise.resolve([
    { id: 'ops', name: 'Operations', content: 'Platform operations use controlled deploy windows.' },
  ])),
}));

jest.mock('../services/journalCompactionService', () => ({
  runJournalAutomationRuntimeRefresh: jest.fn(() => Promise.resolve(null)),
}));

const { MemoryRuntimeService } = require('../services/memory/runtime');
const { listRuntimeContinuitySummaries } = require('../services/sessionContinuityService');
const { listRuntimeGroupMemories } = require('../services/groupMemoryService');
const { runJournalAutomationRuntimeRefresh } = require('../services/journalCompactionService');

describe('memory runtime service', () => {
  beforeEach(() => {
    runJournalAutomationRuntimeRefresh.mockClear();
  });

  test('returns empty prompt in passive mode', async () => {
    const service = new MemoryRuntimeService();
    const result = await service.preparePromptContext({
      agent: { memory_mode: 'passive' },
      runtime: 'chat',
      query: 'French answers',
    });

    expect(result.prompt).toBe('');
    expect(result.mode.mode).toBe('passive');
  });

  test('builds a prompt in active mode', async () => {
    const gatewayFactory = () => ({
      knowledge: {
        sharedContext: jest.fn(() => Promise.resolve('Always respect workspace conventions.')),
      },
      summaries: {
        list: jest.fn(() => Promise.resolve([])),
      },
    });

    const service = new MemoryRuntimeService({ gatewayFactory });
    const result = await service.preparePromptContext({
      agent: { memory_mode: 'active' },
      runtime: 'chat',
      query: 'French answers',
      includeSummaries: false,
    });

    expect(result.prompt).toContain('Shared Context');
    expect(result.prompt).toContain('Agent Memory');
    expect(result.mode.mode).toBe('active');
  });

  test('uses targeted continuity summaries by default', async () => {
    const gatewayFactory = () => ({
      knowledge: {
        sharedContext: jest.fn(() => Promise.resolve('Always respect workspace conventions.')),
      },
      summaries: {
        list: jest.fn(() => Promise.resolve([])),
      },
    });

    const service = new MemoryRuntimeService({ gatewayFactory });
    const result = await service.preparePromptContext({
      db: { query: jest.fn() },
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', memory_mode: 'active' },
      runtime: 'chat',
      query: 'resume work',
      includeSummaries: true,
    });

    expect(listRuntimeContinuitySummaries).toHaveBeenCalledWith({
      db: { query: expect.any(Function) },
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', memory_mode: 'active' },
    });
    expect(runJournalAutomationRuntimeRefresh).toHaveBeenCalledWith({
      db: { query: expect.any(Function) },
      workspaceId: 'ws-1',
      agentIdOrUsername: 'agent-1',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      runtime: 'chat',
    });
    expect(listRuntimeGroupMemories).toHaveBeenCalledWith({
      db: { query: expect.any(Function) },
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', memory_mode: 'active' },
      recordUsage: true,
      runtime: 'chat',
    });
    expect(result.prompt).toContain('## Group Memory');
    expect(result.prompt).toContain('### Operations');
    expect(result.prompt).toContain('## Summaries');
    expect(result.prompt).toContain('Current workspace priority: keep answers concise.');
  });
});
