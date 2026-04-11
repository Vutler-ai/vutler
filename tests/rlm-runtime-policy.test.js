'use strict';

const {
  normalizeWorkspaceRlmRuntimePolicy,
  resolveWorkspaceRlmRuntimePolicy,
} = require('../services/executors/rlmRuntimePolicy');
const {
  resolveRlmRuntimeDecision,
} = require('../services/executors/rlmRuntimeExecutor');

describe('rlmRuntimePolicy', () => {
  const originalEnv = process.env.RLM_RUNTIME_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RLM_RUNTIME_ENABLED;
    } else {
      process.env.RLM_RUNTIME_ENABLED = originalEnv;
    }
  });

  test('normalizes workspace policy objects with explicit backend', () => {
    expect(normalizeWorkspaceRlmRuntimePolicy({
      enabled: true,
      default_backend: 'rlm',
      runtime_env: 'docker',
    })).toEqual({
      enabled: true,
      default_backend: 'rlm',
      runtime_env: 'docker',
    });
  });

  test('resolves workspace policy from key/value settings', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ value: { enabled: true, default_backend: 'native' } }],
      }),
    };

    await expect(resolveWorkspaceRlmRuntimePolicy({
      workspaceId: 'ws-1',
      db,
    })).resolves.toEqual({
      enabled: true,
      default_backend: 'native',
      runtime_env: null,
    });
  });

  test('uses workspace default backend when agent inherits', async () => {
    process.env.RLM_RUNTIME_ENABLED = 'true';

    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ value: { enabled: true, default_backend: 'rlm' } }],
      }),
    };

    await expect(resolveRlmRuntimeDecision({
      params: { language: 'python' },
      workspace_id: 'ws-1',
    }, {
      db,
      agent: {
        id: 'agent-1',
        type: ['engineering'],
        config: {
          governance: {
            sandbox_backend: 'inherit',
          },
        },
      },
    })).resolves.toEqual(expect.objectContaining({
      allowed: true,
      reason: 'workspace_default_backend',
      agentPreference: 'inherit',
      workspacePolicy: expect.objectContaining({
        enabled: true,
        default_backend: 'rlm',
      }),
    }));
  });

  test('allows agent-level opt-in when workspace only permits RLM Runtime', async () => {
    process.env.RLM_RUNTIME_ENABLED = 'true';

    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ value: { enabled: true, default_backend: 'native' } }],
      }),
    };

    await expect(resolveRlmRuntimeDecision({
      params: { language: 'python' },
      workspace_id: 'ws-2',
    }, {
      db,
      agent: {
        id: 'agent-2',
        type: ['technical'],
        config: {
          governance: {
            sandbox_backend: 'rlm',
          },
        },
      },
    })).resolves.toEqual(expect.objectContaining({
      allowed: true,
      reason: 'agent_forces_rlm',
      agentPreference: 'rlm',
    }));
  });

  test('blocks non-technical agents even when they force RLM Runtime', async () => {
    process.env.RLM_RUNTIME_ENABLED = 'true';

    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ value: { enabled: true, default_backend: 'rlm' } }],
      }),
    };

    await expect(resolveRlmRuntimeDecision({
      params: { language: 'python' },
      workspace_id: 'ws-3',
    }, {
      db,
      agent: {
        id: 'agent-3',
        type: ['marketing'],
        config: {
          governance: {
            sandbox_backend: 'rlm',
          },
        },
      },
    })).resolves.toEqual(expect.objectContaining({
      allowed: false,
      reason: 'agent_not_technical',
    }));
  });
});
