'use strict';

const {
  MEMORY_MODE_ACTIVE,
  MEMORY_MODE_DISABLED,
  MEMORY_MODE_PASSIVE,
  resolveMemoryMode,
} = require('../services/memory/modeResolver');

describe('memory mode resolver', () => {
  test('agent override wins over defaults', async () => {
    const resolved = await resolveMemoryMode({
      agent: { memory_mode: MEMORY_MODE_DISABLED },
      defaultMode: MEMORY_MODE_ACTIVE,
    });

    expect(resolved).toMatchObject({
      mode: MEMORY_MODE_DISABLED,
      source: 'agent',
      read: false,
      write: false,
      inject: false,
    });
  });

  test('passive writes but does not inject', async () => {
    const resolved = await resolveMemoryMode({
      defaultMode: MEMORY_MODE_PASSIVE,
    });

    expect(resolved).toMatchObject({
      mode: MEMORY_MODE_PASSIVE,
      write: true,
      inject: false,
    });
  });

  test('plan with snipara memory defaults to active when no explicit mode is set', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('key IN (\'memory_mode\', \'snipara_memory_mode\')')) {
          return { rows: [] };
        }
        if (sql.includes(`key = 'billing_plan'`)) {
          return { rows: [{ value: { plan: 'agents_pro' } }] };
        }
        return { rows: [] };
      }),
    };

    const resolved = await resolveMemoryMode({
      db,
      workspaceId: 'ws-1',
      agent: {},
      defaultMode: MEMORY_MODE_PASSIVE,
    });

    expect(resolved).toMatchObject({
      mode: MEMORY_MODE_ACTIVE,
      source: 'plan',
      read: true,
      write: true,
      inject: true,
    });
  });
});
