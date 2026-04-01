'use strict';

const {
  MAX_SANDBOX_SYNC_CODE_CHARS,
  MAX_SANDBOX_SYNC_TIMEOUT_MS,
  governOrchestrationDecision,
} = require('../../services/orchestration/policy');
const { buildOrchestrationDecision } = require('../../services/orchestration/types');

describe('orchestration policy', () => {
  function buildSandboxDecision(actionOverrides = {}) {
    return buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedTools: ['run_code_in_sandbox'],
      actions: [
        {
          id: 'act_sandbox_1',
          kind: 'tool',
          key: 'sandbox_code_exec',
          executor: 'sandbox-worker',
          mode: 'sync',
          approval: 'none',
          timeout_ms: MAX_SANDBOX_SYNC_TIMEOUT_MS,
          params: {
            language: 'python',
            code: 'print("hello")',
          },
          required_capabilities: ['code_execution'],
          risk_level: 'medium',
          ...actionOverrides,
        },
      ],
    });
  }

  test('denies sandbox execution when capability is missing', () => {
    const decision = governOrchestrationDecision(buildSandboxDecision(), {
      agent: { id: 'agent-1', capabilities: [] },
    });

    expect(decision).toMatchObject({
      allowed: false,
      decision: 'denied',
      reason: 'Sandbox execution is not allowed for this run.',
    });
  });

  test('requires approval when timeout or code size exceeds sync policy', () => {
    const decision = governOrchestrationDecision(buildSandboxDecision({
      timeout_ms: MAX_SANDBOX_SYNC_TIMEOUT_MS + 1,
      params: {
        language: 'python',
        code: 'x'.repeat(MAX_SANDBOX_SYNC_CODE_CHARS + 1),
      },
    }), {
      agent: { id: 'agent-1', capabilities: ['code_execution'] },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'approval_required',
      risk_level: 'high',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'sandbox-worker',
            approval: 'required',
          }),
        ],
      }),
    });
  });

  test('allows synchronous sandbox execution within policy', () => {
    const decision = governOrchestrationDecision(buildSandboxDecision(), {
      agent: { id: 'agent-1', capabilities: ['code_execution'] },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      risk_level: 'medium',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'sandbox-worker',
            mode: 'sync',
            approval: 'none',
          }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'sandbox-default-v1',
        }),
      }),
    });
  });

  test('allows skill execution when the skill is on the explicit run allowlist', () => {
    const decision = governOrchestrationDecision(buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedSkills: ['email_outreach'],
      actions: [
        {
          id: 'act_skill_1',
          kind: 'skill',
          key: 'skill_exec',
          executor: 'skill-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            skill_key: 'email_outreach',
            params: { recipient_email: 'client@example.com' },
          },
          allowed_agent_ids: ['agent-1'],
          risk_level: 'low',
        },
      ],
    }), {
      agent: { id: 'agent-1', capabilities: [] },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      risk_level: 'low',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'skill-executor',
            params: expect.objectContaining({
              skill_key: 'email_outreach',
            }),
          }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'skill-default-v1',
        }),
      }),
    });
  });

  test('allows nexus execution when an online node is available', () => {
    const decision = governOrchestrationDecision(buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedTools: ['search_files'],
      actions: [
        {
          id: 'act_nexus_1',
          kind: 'tool',
          key: 'nexus_tool_exec',
          executor: 'nexus-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            tool_name: 'search_files',
            args: { query: 'brief' },
          },
          allowed_agent_ids: ['agent-1'],
          risk_level: 'medium',
        },
      ],
    }), {
      agent: { id: 'agent-1' },
      nexusNodeId: 'node-1',
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      risk_level: 'medium',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'nexus-executor',
            params: expect.objectContaining({
              tool_name: 'search_files',
            }),
          }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'nexus-default-v1',
        }),
      }),
    });
  });

  test('allows social execution for authorized platforms', () => {
    const decision = governOrchestrationDecision(buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedTools: ['vutler_post_social_media'],
      actions: [
        {
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
          allowed_agent_ids: ['agent-1'],
          risk_level: 'medium',
        },
      ],
    }), {
      agent: { id: 'agent-1' },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'social-executor',
            params: expect.objectContaining({
              caption: 'Launch update',
            }),
          }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'social-default-v1',
        }),
      }),
    });
  });

  test('allows memory recall when bindings and mode are present', () => {
    const decision = governOrchestrationDecision(buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedTools: ['recall'],
      actions: [
        {
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
          allowed_agent_ids: ['agent-1'],
          risk_level: 'low',
        },
      ],
    }), {
      agent: { id: 'agent-1' },
      memoryMode: {
        mode: 'active',
        read: true,
        write: true,
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'memory-executor',
            params: expect.objectContaining({
              operation: 'recall',
            }),
          }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'memory-default-v1',
        }),
      }),
    });
  });

  test('governs multi-action plans without degrading into implicit execution', () => {
    const decision = governOrchestrationDecision(buildOrchestrationDecision({
      workspaceId: 'ws-1',
      selectedAgentId: 'agent-1',
      selectedAgentReason: 'test',
      allowedTools: ['remember', 'vutler_post_social_media'],
      actions: [
        {
          id: 'act_memory_remember_1',
          kind: 'tool',
          key: 'memory_remember',
          executor: 'memory-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            operation: 'remember',
            content: 'User prefers concise French replies.',
            memory_type: 'preference',
            importance: 7,
            bindings: {
              scope: 'agent',
              category: 'agent:agent-1',
              agent_id: 'agent-1',
            },
          },
          allowed_agent_ids: ['agent-1'],
          risk_level: 'low',
        },
        {
          id: 'act_social_1',
          kind: 'tool',
          key: 'social_post',
          executor: 'social-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            caption: 'Launch update',
            platforms: ['linkedin'],
            allowed_platforms: ['linkedin'],
            external_id: 'ws_ws-1',
          },
          allowed_agent_ids: ['agent-1'],
          risk_level: 'medium',
        },
      ],
    }), {
      agent: { id: 'agent-1', capabilities: [] },
      memoryMode: {
        mode: 'active',
        read: true,
        write: true,
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      decision: 'sync',
      risk_level: 'medium',
      decisionPayload: expect.objectContaining({
        actions: [
          expect.objectContaining({ key: 'memory_remember', executor: 'memory-executor' }),
          expect.objectContaining({ key: 'social_post', executor: 'social-executor' }),
        ],
        metadata: expect.objectContaining({
          policy_bundle: 'multi-action-v1',
          execution_mode: 'sync',
        }),
      }),
    });
  });
});
