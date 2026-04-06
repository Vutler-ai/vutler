'use strict';

describe('SniparaTaskAdapter', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('claimTask joins swarm then retries claim when agent is not yet in swarm', async () => {
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(new Error('Agent not in swarm'))
      .mockResolvedValueOnce({ agent_id: 'joined-agent' })
      .mockResolvedValueOnce({ success: true, task_id: 'task-1' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache: jest.fn(),
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.claimTask('ws-1', { taskId: 'task-1', agentId: 'mike-local' });

    expect(result).toEqual({ success: true, task_id: 'task-1' });
    expect(callSniparaTool).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toolName: 'rlm_task_claim',
      args: expect.objectContaining({ agent_id: 'mike-local', task_id: 'task-1', swarm_id: 'swarm-1' }),
    }));
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_swarm_join',
      args: expect.objectContaining({ agent_id: 'mike-local', swarm_id: 'swarm-1' }),
    }));
    expect(callSniparaTool).toHaveBeenNthCalledWith(3, expect.objectContaining({
      toolName: 'rlm_task_claim',
      args: expect.objectContaining({ agent_id: 'mike-local', task_id: 'task-1', swarm_id: 'swarm-1' }),
    }));
  });

  test('unblockHtask retries without resolution for legacy handler signature', async () => {
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(new Error("unblock_task() got an unexpected keyword argument 'resolution'"))
      .mockResolvedValueOnce({ success: true, task_id: 'htask-1' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache: jest.fn(),
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.unblockHtask('ws-1', { taskId: 'htask-1', resolution: 'fixed' });

    expect(result).toEqual({ success: true, task_id: 'htask-1' });
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_htask_unblock',
      args: { swarm_id: 'swarm-1', task_id: 'htask-1' },
    }));
  });

  test('completeHtask retries without evidence when backend rejects string-like evidence handling', async () => {
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(new Error("'str' object has no attribute 'get'"))
      .mockResolvedValueOnce({ success: true, task_id: 'htask-1', status: 'COMPLETED' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache: jest.fn(),
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.completeHtask('ws-1', {
      taskId: 'htask-1',
      result: 'done',
      evidence: 'note',
    });

    expect(result).toEqual({ success: true, task_id: 'htask-1', status: 'COMPLETED' });
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_htask_complete',
      args: { swarm_id: 'swarm-1', task_id: 'htask-1', result: 'done' },
    }));
  });

  test('completeTask claims then retries completion when backend requires assignment first', async () => {
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(new Error('Task not found or not assigned to agent'))
      .mockResolvedValueOnce({ success: true, task_id: 'task-1' })
      .mockResolvedValueOnce({ success: true, task_id: 'task-1', status: 'completed' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache: jest.fn(),
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.completeTask('ws-1', {
      taskId: 'task-1',
      agentId: 'mike',
      output: 'done',
    });

    expect(result).toEqual({ success: true, task_id: 'task-1', status: 'completed' });
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_task_claim',
      args: expect.objectContaining({ swarm_id: 'swarm-1', task_id: 'task-1', agent_id: 'mike' }),
    }));
    expect(callSniparaTool).toHaveBeenNthCalledWith(3, expect.objectContaining({
      toolName: 'rlm_task_complete',
      args: expect.objectContaining({ swarm_id: 'swarm-1', task_id: 'task-1', agent_id: 'mike', output: 'done' }),
    }));
  });

  test('completeTask recovers when assignment failure is wrapped as an HTTP error preview', async () => {
    const clearSniparaFailureCache = jest.fn();
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Snipara rlm_task_complete HTTP 404'), {
        responsePreview: 'Task not found or not assigned to agent',
      }))
      .mockResolvedValueOnce({ success: true, task_id: 'task-1' })
      .mockResolvedValueOnce({ success: true, task_id: 'task-1', status: 'completed' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache,
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.completeTask('ws-1', {
      taskId: 'task-1',
      agentId: 'mike',
      output: 'done',
    });

    expect(result).toEqual({ success: true, task_id: 'task-1', status: 'completed' });
    expect(clearSniparaFailureCache).toHaveBeenCalledWith('ws-1');
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_task_claim',
      args: expect.objectContaining({ swarm_id: 'swarm-1', task_id: 'task-1', agent_id: 'mike' }),
    }));
  });

  test('claimTask recovers when agent-not-in-swarm is surfaced through a circuit-open wrapper', async () => {
    const clearSniparaFailureCache = jest.fn();
    const callSniparaTool = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Snipara rlm_task_claim short-circuited after recent failure'), {
        code: 'circuit_open',
        causeMessage: 'Agent not in swarm',
      }))
      .mockResolvedValueOnce({ agent_id: 'joined-agent' })
      .mockResolvedValueOnce({ success: true, task_id: 'task-1' });

    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_WORKSPACE: 'ws-1',
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
      resolveSniparaConfig: jest.fn().mockResolvedValue({
        configured: true,
        apiKey: 'key',
        apiUrl: 'https://snipara.test/mcp',
        swarmId: 'swarm-1',
      }),
      callSniparaTool,
      clearSniparaFailureCache,
    }));

    const { SniparaTaskAdapter } = require('../services/sniparaTaskAdapter');
    const adapter = new SniparaTaskAdapter();
    const result = await adapter.claimTask('ws-1', { taskId: 'task-1', agentId: 'mike-local' });

    expect(result).toEqual({ success: true, task_id: 'task-1' });
    expect(clearSniparaFailureCache).toHaveBeenCalledWith('ws-1');
    expect(callSniparaTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'rlm_swarm_join',
      args: expect.objectContaining({ agent_id: 'mike-local', swarm_id: 'swarm-1' }),
    }));
  });
});
