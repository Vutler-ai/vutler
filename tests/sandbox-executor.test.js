'use strict';

describe('sandboxExecutor', () => {
  let executeInSandboxMock;
  let resolveRlmRuntimeDecisionMock;
  let executeRlmRuntimePlanMock;
  let executeSandboxPlan;

  beforeEach(() => {
    jest.resetModules();
    executeInSandboxMock = jest.fn().mockResolvedValue({
      execution_id: 'sandbox-1',
      language: 'python',
      status: 'completed',
      stdout: 'sandbox\n',
      stderr: '',
      exit_code: 0,
    });
    resolveRlmRuntimeDecisionMock = jest.fn().mockResolvedValue({
      allowed: false,
      reason: 'workspace_policy_disabled',
      workspacePolicy: {
        enabled: false,
        default_backend: 'native',
      },
      agentPreference: 'inherit',
    });
    executeRlmRuntimePlanMock = jest.fn().mockResolvedValue({
      execution_id: 'rlm-1',
      language: 'python',
      status: 'completed',
      stdout: 'rlm\n',
      stderr: '',
      exit_code: 0,
    });

    jest.doMock('../services/sandbox', () => ({
      executeInSandbox: executeInSandboxMock,
    }));
    jest.doMock('../services/executors/rlmRuntimeExecutor', () => ({
      resolveRlmRuntimeDecision: resolveRlmRuntimeDecisionMock,
      executeRlmRuntimePlan: executeRlmRuntimePlanMock,
    }));

    ({ executeSandboxPlan } = require('../services/executors/sandboxExecutor'));
  });

  test('uses the native sandbox when RLM Runtime is not enabled', async () => {
    const result = await executeSandboxPlan({
      params: {
        language: 'python',
        code: 'print("hello")',
      },
      timeout_ms: 15000,
      workspace_id: 'ws-1',
      id: 'act-1',
    }, {
      workspaceId: 'ws-1',
    });

    expect(resolveRlmRuntimeDecisionMock).toHaveBeenCalled();
    expect(executeRlmRuntimePlanMock).not.toHaveBeenCalled();
    expect(executeInSandboxMock).toHaveBeenCalledWith(
      'python',
      'print("hello")',
      null,
      15000,
      expect.objectContaining({
        workspaceId: 'ws-1',
        source: 'orchestration',
      })
    );
    expect(result.execution_id).toBe('sandbox-1');
  });

  test('uses RLM Runtime for eligible technical python executions', async () => {
    resolveRlmRuntimeDecisionMock.mockResolvedValue({
      allowed: true,
      reason: 'workspace_default_backend',
      workspacePolicy: {
        enabled: true,
        default_backend: 'rlm',
      },
      agentPreference: 'inherit',
    });

    const result = await executeSandboxPlan({
      params: {
        language: 'python',
        code: 'print("hello from rlm")',
      },
      timeout_ms: 12000,
    }, {
      agent: {
        id: 'agent-1',
        type: ['engineering'],
      },
    });

    expect(executeRlmRuntimePlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          language: 'python',
          code: 'print("hello from rlm")',
        },
      }),
      expect.objectContaining({
        agent: expect.objectContaining({ id: 'agent-1' }),
        rlmRuntimeDecision: expect.objectContaining({
          allowed: true,
        }),
      })
    );
    expect(executeInSandboxMock).not.toHaveBeenCalled();
    expect(result.execution_id).toBe('rlm-1');
  });

  test('falls back to the native sandbox when RLM Runtime fails', async () => {
    resolveRlmRuntimeDecisionMock.mockResolvedValue({
      allowed: true,
      reason: 'agent_forces_rlm',
      workspacePolicy: {
        enabled: true,
        default_backend: 'native',
      },
      agentPreference: 'rlm',
    });
    executeRlmRuntimePlanMock.mockRejectedValue(new Error('rlm binary missing'));

    const result = await executeSandboxPlan({
      params: {
        language: 'python',
        code: 'print("fallback")',
      },
      timeout_ms: 9000,
      workspace_id: 'ws-2',
      agentId: 'agent-2',
    }, {
      agent: {
        id: 'agent-2',
        type: ['technical'],
      },
    });

    expect(executeRlmRuntimePlanMock).toHaveBeenCalled();
    expect(executeInSandboxMock).toHaveBeenCalledWith(
      'python',
      'print("fallback")',
      'agent-2',
      9000,
      expect.objectContaining({
        workspaceId: 'ws-2',
      })
    );
    expect(result.execution_id).toBe('sandbox-1');
  });
});
