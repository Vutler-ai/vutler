'use strict';

const {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  extractSkillKey,
  orchestrateToolCall,
} = require('../../services/orchestration/orchestrator');

describe('orchestration orchestrator', () => {
  test('builds an explicit sandbox orchestration decision', () => {
    const decision = orchestrateToolCall({
      toolName: 'run_code_in_sandbox',
      args: {
        language: 'py',
        code: 'print("hello")',
        timeout_ms: DEFAULT_SANDBOX_TIMEOUT_MS,
      },
      agent: { id: 'agent-1' },
      workspaceId: 'ws-1',
      chatActionContext: {
        requestedAgentId: 'agent-2',
        displayAgentId: 'agent-3',
      },
    });

    expect(decision).toMatchObject({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      allowed_tools: ['run_code_in_sandbox'],
      final_response_strategy: 'tool_then_agent',
      actions: [
        expect.objectContaining({
          id: 'act_sandbox_1',
          kind: 'tool',
          key: 'sandbox_code_exec',
          executor: 'sandbox-worker',
          mode: 'sync',
          approval: 'none',
          timeout_ms: DEFAULT_SANDBOX_TIMEOUT_MS,
          params: {
            language: 'python',
            code: 'print("hello")',
          },
          required_capabilities: ['code_execution'],
        }),
      ],
      metadata: expect.objectContaining({
        target: expect.objectContaining({
          requested_agent_id: 'agent-2',
        }),
        display_agent_id: 'agent-3',
      }),
    });
  });

  test('returns null for unsupported tools', () => {
    expect(orchestrateToolCall({ toolName: 'unknown_tool' })).toBeNull();
  });

  test('builds an explicit skill orchestration decision', () => {
    const decision = orchestrateToolCall({
      toolName: 'skill_email_outreach',
      args: {
        recipient_email: 'client@example.com',
      },
      adapter: 'skill',
      agent: { id: 'agent-1' },
      workspaceId: 'ws-1',
      chatActionContext: {
        requestedAgentId: 'agent-2',
        displayAgentId: 'agent-3',
      },
    });

    expect(extractSkillKey('skill_email_outreach')).toBe('email_outreach');
    expect(decision).toMatchObject({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      allowed_tools: [],
      allowed_skills: ['email_outreach'],
      actions: [
        expect.objectContaining({
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
        }),
      ],
      metadata: expect.objectContaining({
        target: expect.objectContaining({
          requested_agent_id: 'agent-2',
        }),
        display_agent_id: 'agent-3',
        tool_name: 'skill_email_outreach',
      }),
    });
  });

  test('builds an explicit nexus orchestration decision', () => {
    const decision = orchestrateToolCall({
      toolName: 'search_files',
      args: {
        query: 'brief',
      },
      adapter: 'nexus',
      agent: { id: 'agent-1' },
      workspaceId: 'ws-1',
      chatActionContext: {
        requestedAgentId: 'agent-2',
        displayAgentId: 'agent-3',
      },
      nexusNodeId: 'node-1',
    });

    expect(decision).toMatchObject({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      allowed_tools: ['search_files'],
      allowed_skills: [],
      actions: [
        expect.objectContaining({
          id: 'act_nexus_1',
          kind: 'tool',
          key: 'nexus_tool_exec',
          executor: 'nexus-executor',
          params: {
            tool_name: 'search_files',
            args: {
              query: 'brief',
            },
          },
        }),
      ],
      metadata: expect.objectContaining({
        nexus_node_id: 'node-1',
        tool_name: 'search_files',
      }),
    });
  });

  test('builds an explicit social orchestration decision', () => {
    const decision = orchestrateToolCall({
      toolName: 'vutler_post_social_media',
      args: {
        caption: 'Launch update',
        platforms: ['linkedin', 'x'],
        scheduled_at: '2026-04-02T09:00:00.000Z',
      },
      agent: { id: 'agent-1' },
      workspaceId: 'ws-1',
      chatActionContext: {
        requestedAgentId: 'agent-2',
        displayAgentId: 'agent-3',
      },
      allowedSocialPlatforms: ['linkedin', 'twitter'],
      allowedSocialAccountIds: ['social-local-1'],
      allowedSocialBrandIds: ['106026474'],
    });

    expect(decision).toMatchObject({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      allowed_tools: ['vutler_post_social_media'],
      actions: [
        expect.objectContaining({
          id: 'act_social_1',
          key: 'social_post',
          executor: 'social-executor',
          params: expect.objectContaining({
            caption: 'Launch update',
            scheduled_at: '2026-04-02T09:00:00.000Z',
            platforms: ['linkedin', 'twitter'],
            allowed_platforms: ['linkedin', 'twitter'],
            allowed_account_ids: ['social-local-1'],
            allowed_brand_ids: ['106026474'],
            external_id: 'ws_ws-1',
          }),
        }),
      ],
      metadata: expect.objectContaining({
        tool_name: 'vutler_post_social_media',
      }),
    });
  });

  test('builds explicit memory orchestration decisions', () => {
    const context = {
      toolName: 'remember',
      args: {
        content: 'User prefers concise French replies.',
        importance: 8,
        type: 'preference',
      },
      agent: { id: 'agent-1' },
      workspaceId: 'ws-1',
      chatActionContext: {
        requestedAgentId: 'agent-2',
        displayAgentId: 'agent-3',
      },
      memoryBindings: {
        instance: {
          scope: 'agent',
          category: 'agent:agent-1',
        },
        agentId: 'agent-1',
      },
      memoryMode: {
        mode: 'active',
        read: true,
        write: true,
      },
    };

    const rememberDecision = orchestrateToolCall(context);
    const recallDecision = orchestrateToolCall({
      ...context,
      toolName: 'recall',
      args: {
        query: 'language preference',
      },
    });

    expect(rememberDecision).toMatchObject({
      allowed_tools: ['remember'],
      actions: [
        expect.objectContaining({
          key: 'memory_remember',
          executor: 'memory-executor',
          params: expect.objectContaining({
            operation: 'remember',
            content: 'User prefers concise French replies.',
            importance: 8,
            memory_type: 'preference',
            bindings: expect.objectContaining({
              scope: 'agent',
              category: 'agent:agent-1',
              agent_id: 'agent-1',
            }),
          }),
        }),
      ],
    });
    expect(recallDecision).toMatchObject({
      allowed_tools: ['recall'],
      actions: [
        expect.objectContaining({
          key: 'memory_recall',
          executor: 'memory-executor',
          params: expect.objectContaining({
            operation: 'recall',
            query: 'language preference',
            bindings: expect.objectContaining({
              scope: 'agent',
              category: 'agent:agent-1',
              agent_id: 'agent-1',
            }),
          }),
        }),
      ],
    });
  });
});
