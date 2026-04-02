'use strict';

describe('orchestration autonomy metrics', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
  });

  test('aggregates blocked autonomy signals by agent and capability', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.orchestration_runs')) {
          return {
            rows: [
              {
                id: 'run-1',
                status: 'blocked',
                display_agent_id: 'agent-1',
                display_agent_username: 'mike',
                requested_agent_id: 'agent-1',
                requested_agent_username: 'mike',
                created_at: '2026-04-01T10:00:00.000Z',
                updated_at: '2026-04-01T10:05:00.000Z',
              },
              {
                id: 'run-2',
                status: 'awaiting_approval',
                display_agent_id: 'agent-2',
                display_agent_username: 'philip',
                requested_agent_id: 'agent-2',
                requested_agent_username: 'philip',
                created_at: '2026-04-01T12:00:00.000Z',
                updated_at: '2026-04-01T12:15:00.000Z',
              },
            ],
          };
        }

        if (sql.includes('FROM tenant_vutler.orchestration_run_events')) {
          return {
            rows: [
              {
                run_id: 'run-1',
                created_at: '2026-04-01T10:01:00.000Z',
                payload: {
                  blocked_overlay: {
                    providers: ['email'],
                    toolCapabilities: ['code_execution'],
                    skills: [],
                  },
                  suggestions: ['Connect email provider'],
                },
              },
              {
                run_id: 'run-2',
                created_at: '2026-04-01T12:10:00.000Z',
                payload: {
                  blocked_overlay: {
                    providers: ['sandbox'],
                    toolCapabilities: [],
                    skills: ['compliance_review'],
                  },
                  suggestions: ['Use a technical agent'],
                },
              },
            ],
          };
        }

        throw new Error(`Unexpected SQL in autonomy metrics test: ${sql}`);
      }),
    };

    const { getAutonomyMetrics } = require('../../services/orchestration/runStore');
    const metrics = await getAutonomyMetrics(db, 'ws-1', { windowDays: 14 });

    expect(metrics.totals).toEqual(expect.objectContaining({
      total_runs: 2,
      autonomy_limited_runs: 2,
      blocked_runs: 1,
      awaiting_approval_runs: 1,
    }));

    expect(metrics.blocker_counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email', kind: 'provider', count: 1 }),
      expect.objectContaining({ key: 'code_execution', kind: 'tool_capability', count: 1 }),
      expect.objectContaining({ key: 'sandbox', kind: 'provider', count: 1 }),
    ]));

    expect(metrics.suggestion_counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Connect email provider', count: 1 }),
      expect.objectContaining({ key: 'Use a technical agent', count: 1 }),
    ]));

    const mike = metrics.agent_breakdown.find((entry) => entry.agent_username === 'mike');
    const philip = metrics.agent_breakdown.find((entry) => entry.agent_username === 'philip');

    expect(mike).toEqual(expect.objectContaining({
      run_count: 1,
      autonomy_limited_runs: 1,
      blocked_runs: 1,
    }));
    expect(mike.blocker_counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email', count: 1 }),
      expect.objectContaining({ key: 'code_execution', count: 1 }),
    ]));

    expect(philip).toEqual(expect.objectContaining({
      run_count: 1,
      autonomy_limited_runs: 1,
      awaiting_approval_runs: 1,
    }));
    expect(philip.suggestion_counts).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Use a technical agent', count: 1 }),
    ]));
  });
});
