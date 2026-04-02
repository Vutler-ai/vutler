'use strict';

const {
  buildRunPlan,
  resolveNextPlanPhase,
  resolvePlanPhase,
} = require('../../services/orchestration/runPlanner');

describe('runPlanner', () => {
  test('builds a multi-phase sequential plan with Snipara context', () => {
    const plan = buildRunPlan({
      run: {
        requested_agent_username: 'mike',
        display_agent_username: 'jarvis',
      },
      rootTask: {
        title: 'Ship autonomous orchestration',
        description: [
          '- Audit the current runtime flow',
          '- Implement the orchestration controller',
          '- Verify rollout and approvals',
        ].join('\n'),
        metadata: {
          approval_required: true,
        },
      },
      workspaceContext: 'Workspace standard: keep swarm state in Snipara and route escalations through Mike.',
      snipara: {
        configured: true,
        swarmId: 'swarm-1',
        projectId: 'project-1',
        rootTaskId: 'remote-root-1',
      },
    });

    expect(plan.strategy).toBe('multi_phase_sequential');
    expect(plan.phase_count).toBe(3);
    expect(plan.controls).toEqual(expect.objectContaining({
      verification: true,
      approval: true,
      finalize: true,
    }));
    expect(plan.snipara).toEqual(expect.objectContaining({
      enabled: true,
      swarm_id: 'swarm-1',
      project_id: 'project-1',
      root_task_id: 'remote-root-1',
    }));
    expect(plan.workspace_context_excerpt).toContain('Snipara');
    expect(resolvePlanPhase(plan, 1)).toEqual(expect.objectContaining({
      title: 'Implement the orchestration controller',
    }));
    expect(resolveNextPlanPhase(plan, 1)).toEqual(expect.objectContaining({
      title: 'Verify rollout and approvals',
    }));
  });
});
