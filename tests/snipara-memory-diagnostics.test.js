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

  test('applies lifecycle markers to memories and hides governance markers from the dashboard list', async () => {
    const callSniparaTool = jest.fn().mockResolvedValue({
      memories: [
        {
          id: 'mem-1',
          text: 'Primary deployment target is the VPS cluster in Geneva.',
          type: 'fact',
          scope: 'agent',
          category: 'ws-4-agent-andrea',
          created_at: '2026-04-10T10:00:00.000Z',
          metadata: {
            needs_verification: true,
          },
        },
        {
          id: 'marker-1',
          text: '[ATTACH_SOURCE memory mem-1] deploy-checklist.md',
          type: 'fact',
          scope: 'agent',
          category: 'ws-4-agent-andrea',
          created_at: '2026-04-10T11:00:00.000Z',
          metadata: {
            lifecycle_event: 'attach_source',
            memory_target_id: 'mem-1',
            source_ref: 'deploy-checklist.md',
            evidence_note: 'Confirmed during VPS hardening pass.',
          },
        },
        {
          id: 'marker-2',
          text: '[VERIFY memory mem-1] validated',
          type: 'fact',
          scope: 'agent',
          category: 'ws-4-agent-andrea',
          created_at: '2026-04-10T12:00:00.000Z',
          metadata: {
            lifecycle_event: 'verify',
            memory_target_id: 'mem-1',
            verified_at: '2026-04-10T12:00:00.000Z',
            verification_note: 'Validated against the deployment runbook.',
            needs_verification: false,
          },
        },
      ],
    });

    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool,
      serializeSniparaError: jest.fn((error) => ({
        message: error.message,
        status_code: error.statusCode || null,
        tool_name: error.toolName || null,
      })),
    }));

    const { listAgentMemories } = require('../services/sniparaMemoryService');
    const result = await listAgentMemories({
      db: null,
      workspaceId: 'ws-4',
      agentIdOrUsername: 'andrea',
      fallbackAgent: { id: 'agent-1', username: 'andrea', role: 'Engineering' },
      limit: 5,
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]).toEqual(expect.objectContaining({
      id: 'mem-1',
      status: 'active',
      verified_at: '2026-04-10T12:00:00.000Z',
      source_count: 1,
      sources: [
        expect.objectContaining({
          source_ref: 'deploy-checklist.md',
        }),
      ],
    }));
  });

  test('falls back to local lifecycle markers when the remote lifecycle tool is not available', async () => {
    const unsupportedError = Object.assign(new Error('Snipara rlm_memory_verify HTTP 404'), {
      name: 'SniparaToolError',
      statusCode: 404,
      toolName: 'rlm_memory_verify',
      workspaceId: 'ws-5',
      apiUrl: 'https://workspace.snipara.test/mcp',
      responsePreview: 'tool not found',
      code: 'http_error',
    });
    const callSniparaTool = jest.fn()
      .mockRejectedValueOnce(unsupportedError)
      .mockResolvedValueOnce({ ok: true });

    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool,
      serializeSniparaError: jest.fn((error) => ({
        message: error.message,
        status_code: error.statusCode || null,
        tool_name: error.toolName || null,
        response_preview: error.responsePreview || null,
      })),
    }));

    const { verifyAgentMemory } = require('../services/sniparaMemoryService');
    const result = await verifyAgentMemory({
      db: null,
      workspaceId: 'ws-5',
      agent: { id: 'agent-1', username: 'andrea', role: 'Engineering' },
      memoryId: 'mem-55',
      evidenceNote: 'Validated locally',
    });

    expect(result).toEqual(expect.objectContaining({
      memory_id: 'mem-55',
      remote_synced: false,
      status: 'active',
    }));
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolName: 'rlm_memory_verify',
      })
    );
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: 'rlm_remember',
      })
    );
  });
});
