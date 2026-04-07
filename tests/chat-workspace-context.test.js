'use strict';

describe('chat workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../services/llmRouter', () => ({
      chat: jest.fn(),
    }));
    jest.doMock('../services/memory/runtime', () => ({
      createMemoryRuntimeService: jest.fn(() => ({
        preparePromptContext: jest.fn(),
      })),
    }));
    jest.doMock('../services/sniparaMemoryService', () => ({
      resolveAgentRecord: jest.fn(),
    }));

    return require('../api/chat');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();

    expect(router._private.getWorkspaceId({ headers: {} })).toBeNull();
  });

  test('rejects chat routes without workspace context', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  });

  test('accepts explicit x-workspace-id for chat requests', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-chat ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBe('ws-chat');
    expect(req.chatWorkspaceId).toBe('ws-chat');
  });
});
