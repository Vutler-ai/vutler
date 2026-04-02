'use strict';

describe('orchestration run store', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
  });

  test('ensureRunForTask creates a queued run with an initial plan step', async () => {
    const db = {
      query: jest.fn(async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }

        if (sql.includes('FROM tenant_vutler.orchestration_runs') && sql.includes('root_task_id')) {
          return { rows: [] };
        }

        if (sql.includes('INSERT INTO tenant_vutler.orchestration_runs')) {
          return {
            rows: [{
              id: 'run-1',
              workspace_id: 'ws-1',
              status: 'queued',
              mode: 'autonomous',
              orchestrated_by: 'jarvis',
              root_task_id: 'task-1',
            }],
          };
        }

        if (sql.includes('INSERT INTO tenant_vutler.orchestration_run_steps')) {
          return {
            rows: [{
              id: 'step-1',
              run_id: 'run-1',
              sequence_no: 1,
              step_type: 'plan',
              title: 'Plan orchestration run',
              status: 'queued',
              executor: 'orchestrator',
            }],
          };
        }

        if (sql.includes('UPDATE tenant_vutler.orchestration_runs')) {
          return {
            rows: [{
              id: 'run-1',
              workspace_id: 'ws-1',
              status: 'queued',
              mode: 'autonomous',
              orchestrated_by: 'jarvis',
              root_task_id: 'task-1',
              current_step_id: 'step-1',
            }],
          };
        }

        if (sql.includes('INSERT INTO tenant_vutler.orchestration_run_events')) {
          return { rows: [{ id: 1 }] };
        }

        throw new Error(`Unexpected SQL in run store test: ${sql}`);
      }),
    };

    const { ensureRunForTask } = require('../../services/orchestration/runStore');
    const result = await ensureRunForTask({
      db,
      workspaceId: 'ws-1',
      task: {
        id: 'task-1',
        title: 'Implement autonomous execution',
        description: 'Create the durable runtime shell.',
        metadata: { workflow_mode: 'FULL', origin: 'task' },
      },
      requestedAgent: { id: 'agent-1', username: 'mike' },
      displayAgent: { id: 'agent-1', username: 'mike' },
      orchestratedBy: 'jarvis',
      plan: { goal: 'Implement autonomous execution' },
      context: { workspace_id: 'ws-1' },
    });

    expect(result.created).toBe(true);
    expect(result.run).toEqual(expect.objectContaining({
      id: 'run-1',
      current_step_id: 'step-1',
      status: 'queued',
    }));
    expect(result.step).toEqual(expect.objectContaining({
      id: 'step-1',
      step_type: 'plan',
      status: 'queued',
    }));
    expect(db.query).toHaveBeenCalledWith('BEGIN');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.orchestration_run_events'),
      expect.any(Array)
    );
    expect(db.query).toHaveBeenCalledWith('COMMIT');
  });
});
