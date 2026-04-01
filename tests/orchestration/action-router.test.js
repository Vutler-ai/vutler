'use strict';

describe('orchestration action router', () => {
  let executeOrchestrationDecision;
  let executeSandboxPlanMock;
  let executeSkillPlanMock;
  let executeNexusPlanMock;
  let executeSocialPlanMock;
  let executeMemoryPlanMock;

  beforeEach(() => {
    jest.resetModules();
    executeSandboxPlanMock = jest.fn().mockResolvedValue({
      execution_id: 'exec-1',
      language: 'python',
      stdout: 'ok\n',
      stderr: '',
      exit_code: 0,
      status: 'completed',
    });
    executeSkillPlanMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        draftId: 'draft-1',
        status: 'pending_approval',
      },
    });
    executeNexusPlanMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        matches: [{ path: '/tmp/brief.md' }],
      },
    });
    executeSocialPlanMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        account_count: 2,
        post_id: 'post-1',
      },
    });
    executeMemoryPlanMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        text: 'User prefers concise answers in French.',
      },
    });

    jest.doMock('../../services/executors/sandboxExecutor', () => ({
      executeSandboxPlan: executeSandboxPlanMock,
    }));
    jest.doMock('../../services/executors/skillExecutor', () => ({
      executeSkillPlan: executeSkillPlanMock,
    }));
    jest.doMock('../../services/executors/nexusExecutor', () => ({
      executeNexusPlan: executeNexusPlanMock,
    }));
    jest.doMock('../../services/executors/socialExecutor', () => ({
      executeSocialPlan: executeSocialPlanMock,
    }));
    jest.doMock('../../services/executors/memoryExecutor', () => ({
      executeMemoryPlan: executeMemoryPlanMock,
    }));

    ({ executeOrchestrationDecision } = require('../../services/orchestration/actionRouter'));
  });

  test('returns a normalized awaiting approval result without starting the executor', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['run_code_in_sandbox'],
      allowed_skills: [],
      actions: [{
        id: 'act_sandbox_1',
        kind: 'tool',
        key: 'sandbox_code_exec',
        executor: 'sandbox-worker',
        mode: 'sync',
        approval: 'required',
        timeout_ms: 15000,
        params: {
          language: 'python',
          code: 'print(\"ok\")',
        },
        required_capabilities: ['code_execution'],
        risk_level: 'high',
      }],
    });

    expect(result).toEqual([{
      action_id: 'act_sandbox_1',
      success: true,
      status: 'awaiting_approval',
      output_json: {
        key: 'sandbox_code_exec',
        executor: 'sandbox-worker',
        mode: 'sync',
        approval: 'required',
        timeout_ms: 15000,
        params: {
          language: 'python',
          code: 'print(\"ok\")',
        },
        risk_level: 'high',
      },
      error: null,
      artifacts: [],
    }]);
    expect(executeSandboxPlanMock).not.toHaveBeenCalled();
  });

  test('dispatches sandbox actions to the sandbox executor and normalizes the result', async () => {
    const decision = {
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['run_code_in_sandbox'],
      allowed_skills: [],
      actions: [{
        id: 'act_sandbox_1',
        kind: 'tool',
        key: 'sandbox_code_exec',
        executor: 'sandbox-worker',
        mode: 'sync',
        approval: 'none',
        timeout_ms: 15000,
        params: {
          language: 'python',
          code: 'print(\"ok\")',
        },
        required_capabilities: ['code_execution'],
        risk_level: 'medium',
      }],
    };

    const result = await executeOrchestrationDecision(decision, { db: {} });

    expect(executeSandboxPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'sandbox-worker',
        params: {
          language: 'python',
          code: 'print(\"ok\")',
        },
        timeout_ms: 15000,
      }),
      expect.objectContaining({ db: {} })
    );
    expect(result).toEqual([{
      action_id: 'act_sandbox_1',
      success: true,
      status: 'completed',
      output_json: {
        execution_id: 'exec-1',
        language: 'python',
        status: 'completed',
        stdout: 'ok\n',
        stderr: '',
        exit_code: 0,
        duration_ms: null,
      },
      error: null,
      artifacts: [],
      usage: {
        duration_ms: expect.any(Number),
      },
    }]);
  });

  test('dispatches skill actions to the skill executor and normalizes the result', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: [],
      allowed_skills: ['email_outreach'],
      actions: [{
        id: 'act_skill_1',
        kind: 'skill',
        key: 'skill_exec',
        executor: 'skill-executor',
        mode: 'sync',
        approval: 'none',
        params: {
          skill_key: 'email_outreach',
          params: {
            recipient_email: 'client@example.com',
          },
        },
        required_capabilities: ['email_outreach'],
        risk_level: 'low',
      }],
    }, { model: 'gpt-5.4', provider: 'openai' });

    expect(executeSkillPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'skill-executor',
        params: {
          skill_key: 'email_outreach',
          params: {
            recipient_email: 'client@example.com',
          },
        },
      }),
      expect.objectContaining({
        model: 'gpt-5.4',
        provider: 'openai',
      })
    );
    expect(result).toEqual([{
      action_id: 'act_skill_1',
      success: true,
      status: 'completed',
      output_json: {
        draftId: 'draft-1',
        status: 'pending_approval',
      },
      error: null,
      artifacts: [],
    }]);
  });

  test('dispatches nexus actions to the nexus executor and normalizes the result', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['search_files'],
      allowed_skills: [],
      actions: [{
        id: 'act_nexus_1',
        kind: 'tool',
        key: 'nexus_tool_exec',
        executor: 'nexus-executor',
        mode: 'sync',
        approval: 'none',
        params: {
          tool_name: 'search_files',
          args: {
            query: 'brief',
          },
        },
        risk_level: 'medium',
      }],
    }, { nexusNodeId: 'node-1', wsConnections: new Map() });

    expect(executeNexusPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'nexus-executor',
        params: {
          tool_name: 'search_files',
          args: {
            query: 'brief',
          },
        },
      }),
      expect.objectContaining({
        nexusNodeId: 'node-1',
      })
    );
    expect(result).toEqual([{
      action_id: 'act_nexus_1',
      success: true,
      status: 'completed',
      output_json: {
        matches: [{ path: '/tmp/brief.md' }],
      },
      error: null,
      artifacts: [],
    }]);
  });

  test('dispatches social actions to the social executor and normalizes the result', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['vutler_post_social_media'],
      allowed_skills: [],
      actions: [{
        id: 'act_social_1',
        kind: 'tool',
        key: 'social_post',
        executor: 'social-executor',
        mode: 'sync',
        approval: 'none',
        params: {
          caption: 'Launch update',
          platforms: ['linkedin'],
          allowed_platforms: ['linkedin', 'twitter'],
          external_id: 'ws_ws-1',
        },
        risk_level: 'medium',
      }],
    }, { db: {} });

    expect(executeSocialPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'social-executor',
        params: expect.objectContaining({
          caption: 'Launch update',
        }),
      }),
      expect.objectContaining({
        db: {},
      })
    );
    expect(result).toEqual([{
      action_id: 'act_social_1',
      success: true,
      status: 'completed',
      output_json: {
        account_count: 2,
        post_id: 'post-1',
      },
      error: null,
      artifacts: [],
    }]);
  });

  test('dispatches memory actions to the memory executor and normalizes the result', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['recall'],
      allowed_skills: [],
      actions: [{
        id: 'act_memory_recall_1',
        kind: 'tool',
        key: 'memory_recall',
        executor: 'memory-executor',
        mode: 'sync',
        approval: 'none',
        params: {
          operation: 'recall',
          query: 'language preference',
          bindings: {
            scope: 'agent',
            category: 'agent:agent-1',
            agent_id: 'agent-1',
          },
        },
        risk_level: 'low',
      }],
    }, { db: {} });

    expect(executeMemoryPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executor: 'memory-executor',
        params: expect.objectContaining({
          operation: 'recall',
        }),
      }),
      expect.objectContaining({
        db: {},
      })
    );
    expect(result).toEqual([{
      action_id: 'act_memory_recall_1',
      success: true,
      status: 'completed',
      output_json: {
        text: 'User prefers concise answers in French.',
      },
      error: null,
      artifacts: [],
    }]);
  });

  test('does not start any executor when a multi-action plan requires approval', async () => {
    const result = await executeOrchestrationDecision({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['remember', 'vutler_post_social_media'],
      allowed_skills: [],
      actions: [{
        id: 'act_memory_remember_1',
        kind: 'tool',
        key: 'memory_remember',
        executor: 'memory-executor',
        mode: 'approval_required',
        approval: 'required',
        params: {
          operation: 'remember',
          content: 'User prefers concise answers in French.',
        },
        risk_level: 'low',
      }, {
        id: 'act_social_1',
        kind: 'tool',
        key: 'social_post',
        executor: 'social-executor',
        mode: 'approval_required',
        approval: 'required',
        params: {
          caption: 'Launch update',
        },
        risk_level: 'medium',
      }],
      metadata: {
        execution_mode: 'approval_required',
      },
    });

    expect(executeMemoryPlanMock).not.toHaveBeenCalled();
    expect(executeSocialPlanMock).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        action_id: 'act_memory_remember_1',
        status: 'awaiting_approval',
      }),
      expect.objectContaining({
        action_id: 'act_social_1',
        status: 'awaiting_approval',
      }),
    ]);
  });
});
