'use strict';

describe('SniparaGateway workspace requirements', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadGateway({
    callSniparaTool = jest.fn().mockResolvedValue({ ok: true }),
    resolveSniparaConfig = jest.fn().mockResolvedValue({ configured: true }),
    buildAgentMemoryBindings = jest.fn(() => ({
      instance: { scope: 'agent', category: 'ws-1-agent-mike' },
      agentId: 'agent-1',
      sniparaInstanceId: 'agent-1',
      agentRef: 'mike',
    })),
  } = {}) {
    jest.doMock('../services/sniparaResolver', () => ({
      callSniparaTool,
      resolveSniparaConfig,
    }));
    jest.doMock('../services/sniparaMemoryService', () => ({
      buildAgentMemoryBindings,
      normalizeImportance: jest.fn((value) => value),
    }));

    const gatewayModule = require('../services/snipara/gateway');
    return {
      ...gatewayModule,
      callSniparaTool,
      resolveSniparaConfig,
      buildAgentMemoryBindings,
    };
  }

  test('call rejects missing workspace context', async () => {
    const { createSniparaGateway, callSniparaTool } = loadGateway();

    await expect(createSniparaGateway().call('rlm_recall', { query: 'hello' }))
      .rejects
      .toThrow('workspaceId is required for Snipara gateway calls');

    expect(callSniparaTool).not.toHaveBeenCalled();
  });

  test('recallForAgent propagates the workspace id to bindings and tool call', async () => {
    const { createSniparaGateway, callSniparaTool, buildAgentMemoryBindings } = loadGateway();
    const gateway = createSniparaGateway({ workspaceId: 'ws-1' });

    await gateway.memory.recallForAgent(
      { username: 'mike', snipara_instance_id: 'agent-1' },
      { query: 'recent task' }
    );

    expect(buildAgentMemoryBindings).toHaveBeenCalledWith(
      { username: 'mike', snipara_instance_id: 'agent-1' },
      'ws-1'
    );
    expect(callSniparaTool).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      toolName: 'rlm_recall',
    }));
  });

  test('resolveConfig rejects missing workspace context', async () => {
    const { createSniparaGateway, resolveSniparaConfig } = loadGateway();

    await expect(createSniparaGateway().resolveConfig())
      .rejects
      .toThrow('workspaceId is required for Snipara gateway calls');

    expect(resolveSniparaConfig).not.toHaveBeenCalled();
  });

  test('exposes memory lifecycle and analytics wrappers through the shared workspace context', async () => {
    const { createSniparaGateway, callSniparaTool } = loadGateway();
    const gateway = createSniparaGateway({ workspaceId: 'ws-9' });

    await gateway.memory.verify({ memory_id: 'mem-1', note: 'validated from runbook' });
    await gateway.analytics.indexHealth({});
    await gateway.coordination.htaskMetrics({ days: 7 });

    expect(callSniparaTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: 'ws-9',
        toolName: 'rlm_memory_verify',
        args: { memory_id: 'mem-1', note: 'validated from runbook' },
      })
    );
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: 'ws-9',
        toolName: 'rlm_index_health',
        args: {},
      })
    );
    expect(callSniparaTool).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        workspaceId: 'ws-9',
        toolName: 'rlm_htask_metrics',
        args: { days: 7 },
      })
    );
  });
});
