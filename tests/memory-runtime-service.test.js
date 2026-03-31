'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  buildRuntimeMemoryBundle: jest.fn(async () => ({
    memories: [{ id: 'm1', type: 'fact', text: 'User prefers concise French answers.' }],
    stats: { runtime: 'chat', query: 'French answers', selected: { total: 1, instance: 1, template: 0, global: 0 } },
    sections: {
      instance: [{ id: 'm1', type: 'fact', text: 'User prefers concise French answers.' }],
      template: [],
      global: [],
    },
  })),
}));

const { MemoryRuntimeService } = require('../services/memory/runtime');

describe('memory runtime service', () => {
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
        sharedContext: jest.fn(async () => 'Always respect workspace conventions.'),
      },
      summaries: {
        list: jest.fn(async () => []),
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
});
