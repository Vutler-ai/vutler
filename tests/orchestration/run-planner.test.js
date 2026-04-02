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

  test('prefers swarm-suggested phases when they are provided', () => {
    const plan = buildRunPlan({
      run: {
        requested_agent_username: 'mike',
      },
      rootTask: {
        title: 'Ship orchestration',
        description: 'Do the thing end to end.',
      },
      suggestedPhases: [
        {
          title: 'Inspect current runtime',
          description: 'Map existing orchestration gaps.',
          agent: 'oscar',
          execution_overlay: {
            integrationProviders: ['sandbox'],
            skillKeys: [],
            toolCapabilities: ['code_execution'],
          },
        },
        {
          title: 'Implement the durable flow',
          description: 'Wire run state into the scheduler and engine.',
          agent_username: 'mike',
          verification_focus: 'State transitions and retries are covered.',
        },
      ],
    });

    expect(plan.strategy).toBe('multi_phase_sequential');
    expect(plan.phases).toEqual([
      expect.objectContaining({
        title: 'Inspect current runtime',
        objective: 'Map existing orchestration gaps.',
        agent_username: 'oscar',
        execution_overlay: expect.objectContaining({
          integrationProviders: ['sandbox'],
          toolCapabilities: ['code_execution'],
        }),
      }),
      expect.objectContaining({
        title: 'Implement the durable flow',
        verification_focus: 'State transitions and retries are covered.',
        agent_username: 'mike',
      }),
    ]);
  });
});
