'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('chat workspace isolation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function mockChatDependencies(query) {
    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../services/memory/runtime', () => ({
      createMemoryRuntimeService: jest.fn(() => ({
        preparePromptContext: jest.fn(async () => ({ prompt: '' })),
      })),
    }));
    jest.doMock('../services/sniparaMemoryService', () => ({
      resolveAgentRecord: jest.fn(async (_db, _workspaceId, _agentRef, fallback) => fallback || null),
    }));
  }

  test('messages route filters by workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      expect(sql).toContain('WHERE channel_id = $1 AND workspace_id = $2');
      expect(params).toEqual(['chan-1', 'ws-1', 50]);
      return { rows: [] };
    });

    mockChatDependencies(query);
    const router = require('../api/chat');
    const handler = findRouteHandler(router, 'get', '/messages');
    const req = {
      workspaceId: 'ws-1',
      query: { channel_id: 'chan-1' },
      headers: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  test('send route rejects channels outside the authenticated workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.chat_channels')) {
        expect(params).toEqual(['chan-1', 'ws-1']);
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    mockChatDependencies(query);
    const router = require('../api/chat');
    const handler = findRouteHandler(router, 'post', '/send');
    const req = {
      workspaceId: 'ws-1',
      headers: {},
      body: {
        channel_id: 'chan-1',
        content: 'hello',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Channel not found' });
  });

  test('channel members route filters by workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      expect(sql).toContain('JOIN tenant_vutler.chat_channels c ON c.id = cm.channel_id');
      expect(sql).toContain('WHERE cm.channel_id = $1 AND c.workspace_id = $2');
      expect(params).toEqual(['chan-1', 'ws-1']);
      return { rows: [] };
    });

    mockChatDependencies(query);
    const router = require('../api/chat');
    const handler = findRouteHandler(router, 'get', '/channels/:id/members');
    const req = {
      workspaceId: 'ws-1',
      headers: {},
      params: { id: 'chan-1' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});
