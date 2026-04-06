'use strict';

describe('sniparaMemoryService diagnostics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('propagates Snipara read errors instead of silently returning a clean empty state', async () => {
    const resolverError = Object.assign(new Error('Snipara rlm_memories HTTP 404'), {
      name: 'SniparaToolError',
      statusCode: 404,
      toolName: 'rlm_memories',
      workspaceId: 'ws-1',
      apiUrl: 'https://workspace.snipara.test/mcp',
      responsePreview: '404 page not found',
      code: 'http_error',
    });

    const recallError = Object.assign(new Error('Snipara rlm_recall HTTP 404'), {
      name: 'SniparaToolError',
      statusCode: 404,
      toolName: 'rlm_recall',
      workspaceId: 'ws-1',
      apiUrl: 'https://workspace.snipara.test/mcp',
      responsePreview: '404 page not found',
      code: 'http_error',
    });

    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool: jest.fn()
        .mockRejectedValueOnce(resolverError)
        .mockRejectedValueOnce(recallError),
      serializeSniparaError: jest.fn((error) => ({
        message: error.message,
        status_code: error.statusCode || null,
        tool_name: error.toolName || null,
        workspace_id: error.workspaceId || null,
        api_url: error.apiUrl || null,
        response_preview: error.responsePreview || null,
        code: error.code || null,
      })),
    }));

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { listAgentMemories } = require('../services/sniparaMemoryService');

    const result = await listAgentMemories({
      db: null,
      workspaceId: 'ws-1',
      agentIdOrUsername: 'mike',
      fallbackAgent: { id: 'agent-1', username: 'mike', role: 'Engineering' },
      limit: 5,
    });

    expect(result.count).toBe(0);
    expect(result.memories).toEqual([]);
    expect(result.snipara_error).toMatchObject({
      status_code: 404,
      tool_name: 'rlm_memories',
      response_preview: '404 page not found',
    });

    warn.mockRestore();
  });

  test('uses longer dedicated timeouts for memory reads and writes', async () => {
    const callSniparaTool = jest.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce([]);

    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool,
      serializeSniparaError: jest.fn((error) => ({
        message: error.message,
        status_code: error.statusCode || null,
        tool_name: error.toolName || null,
      })),
    }));

    const { rememberAgentMemory, listAgentMemories } = require('../services/sniparaMemoryService');

    await rememberAgentMemory({
      db: null,
      workspaceId: 'ws-2',
      agent: { id: 'agent-1', username: 'mike', role: 'Engineering' },
      text: 'Remember this preference',
      type: 'fact',
    });

    await listAgentMemories({
      db: null,
      workspaceId: 'ws-2',
      agentIdOrUsername: 'mike',
      fallbackAgent: { id: 'agent-1', username: 'mike', role: 'Engineering' },
      limit: 5,
    });

    expect(callSniparaTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolName: 'rlm_remember',
        timeoutMs: 20000,
      })
    );
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: 'rlm_memories',
        timeoutMs: 30000,
      })
    );
  });

  test('retries memory writes once when the failure cache is stale', async () => {
    const circuitOpen = Object.assign(new Error('Snipara rlm_remember short-circuited after recent failure'), {
      name: 'SniparaToolError',
      statusCode: 503,
      toolName: 'rlm_remember',
      workspaceId: 'ws-3',
      code: 'circuit_open',
    });
    const callSniparaTool = jest.fn()
      .mockRejectedValueOnce(circuitOpen)
      .mockResolvedValueOnce({ ok: true });

    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool,
      serializeSniparaError: jest.fn((error) => ({
        message: error.message,
        status_code: error.statusCode || null,
        tool_name: error.toolName || null,
        code: error.code || null,
      })),
    }));

    const { rememberAgentMemory } = require('../services/sniparaMemoryService');

    await expect(rememberAgentMemory({
      db: null,
      workspaceId: 'ws-3',
      agent: { id: 'agent-1', username: 'mike', role: 'Engineering' },
      text: 'Remember this after a stale circuit breaker',
      type: 'fact',
    })).resolves.toMatchObject({
      scope: 'agent',
    });

    expect(callSniparaTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolName: 'rlm_remember',
      })
    );
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: 'rlm_remember',
        bypassFailureCache: true,
      })
    );
  });
});
