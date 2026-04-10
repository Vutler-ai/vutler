'use strict';

describe('SwarmCoordinator scheduling persistence', () => {
  let poolQuery;

  beforeEach(() => {
    jest.resetModules();
    poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes("table_name = 'tasks' AND column_name = 'snipara_task_id'")) {
        return { rows: [{}] };
      }

      if (sql.includes('SELECT id FROM tenant_vutler.tasks')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.tasks')) {
        return {
          rows: [{
            id: 'task-1',
            title: params[0],
            description: params[1],
            status: params[2] || 'pending',
            priority: params[3] || 'medium',
            assigned_agent: params[4],
            assignee: params[4],
            workspace_id: params[5],
            due_date: params[9],
            reminder_at: params[10],
            metadata: JSON.parse(params[8]),
          }],
        };
      }

      if (sql.includes('SELECT cm.channel_id')) {
        return { rows: [] };
      }

      if (sql.includes('SELECT id FROM tenant_vutler.chat_channels')) {
        return { rows: [{ id: 'team-channel-1' }] };
      }

      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../services/chatMessages', () => ({ insertChatMessage: jest.fn().mockResolvedValue({}) }));
    jest.doMock('../services/sniparaTaskAdapter', () => ({
      getSniparaTaskAdapter: jest.fn(() => ({
        createTask: jest.fn(),
      })),
    }));
    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        resolveConfig: jest.fn().mockResolvedValue({ configured: false }),
        call: jest.fn(),
      })),
    }));
    jest.doMock('../services/sniparaResolver', () => ({
      DEFAULT_SNIPARA_SWARM_ID: 'swarm-default',
    }));
    jest.doMock('../services/agentConfigPolicy', () => ({
      ALWAYS_ON_TOOL_SKILL_KEYS: [],
      buildInternalPlacementInstruction: jest.fn(() => ''),
      normalizeCapabilities: jest.fn((values = []) => values),
      splitCapabilities: jest.fn(() => ({})),
    }));
    jest.doMock('../services/drivePlacementPolicy', () => ({
      resolveWorkspaceDriveRoot: jest.fn().mockResolvedValue('/projects/Vutler'),
    }));
    jest.doMock('../services/agentDriveService', () => ({
      buildAgentDrivePlacementInstruction: jest.fn(() => ''),
      resolveAgentDriveRoot: jest.fn().mockResolvedValue('/projects/Vutler/Agents/Marketing/max'),
    }));
    jest.doMock('../services/orchestration/runSignals', () => ({
      signalRunFromTask: jest.fn().mockResolvedValue(),
    }));
    jest.doMock('../services/workspaceRealtime', () => ({
      publishTaskEvent: jest.fn(),
    }));
    jest.doMock('../services/taskHierarchyRollupService', () => ({
      refreshTaskHierarchyRollups: jest.fn().mockResolvedValue([]),
    }));
    jest.doMock('../services/taskCalendarSyncService', () => ({
      syncTaskCalendarEvent: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock('../services/smartDispatcher', () => ({
      getSmartDispatcher: jest.fn(() => ({
        dispatch: jest.fn().mockResolvedValue({ agentId: 'max' }),
      })),
    }));
    jest.doMock('../services/workflowMode', () => ({
      getWorkflowModeSelector: jest.fn(() => ({
        score: jest.fn(() => ({ mode: 'LITE', score: 0, reasons: [] })),
      })),
    }));
  });

  test('uses task.workspace_id fallback and persists scheduling timestamps', async () => {
    const { SwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = new SwarmCoordinator();

    const task = await coordinator.createTask({
      title: 'Publish day 2 post',
      description: 'Use the approved draft.',
      for_agent_id: 'max',
      workspace_id: 'ws-schedule',
      due_date: '2026-04-15T09:00:00.000Z',
      reminder_at: '2026-04-15T08:30:00.000Z',
    });

    const insertCall = poolQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO tenant_vutler.tasks'));

    expect(insertCall[0]).toContain('due_date');
    expect(insertCall[0]).toContain('reminder_at');
    expect(insertCall[1]).toEqual([
      'Publish day 2 post',
      'Use the approved draft.',
      'pending',
      'medium',
      'max',
      'ws-schedule',
      'vutler-api',
      null,
      expect.any(String),
      '2026-04-15T09:00:00.000Z',
      '2026-04-15T08:30:00.000Z',
      null,
    ]);
    expect(task.workspace_id).toBe('ws-schedule');
    expect(task.due_date).toBe('2026-04-15T09:00:00.000Z');
    expect(task.reminder_at).toBe('2026-04-15T08:30:00.000Z');
  });
});
