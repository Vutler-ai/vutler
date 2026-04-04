'use strict';

const {
  buildRollupPatch,
  computeRollupStates,
} = require('../services/taskHierarchyRollupService');

describe('taskHierarchyRollupService', () => {
  test('rolls N0 roots up from descendant leaves', () => {
    const states = computeRollupStates([
      {
        id: 'root-1',
        title: 'April publishing',
        status: 'pending',
        parent_id: null,
        metadata: { snipara_hierarchy_level: 'N0' },
      },
      {
        id: 'stream-1',
        title: 'Week 1',
        status: 'in_progress',
        parent_id: 'root-1',
        metadata: { snipara_hierarchy_level: 'N1_FEATURE' },
      },
      {
        id: 'leaf-1',
        title: 'Post 1',
        status: 'completed',
        parent_id: 'stream-1',
        due_date: '2026-04-05T08:00:00.000Z',
        metadata: { snipara_hierarchy_level: 'N3_TASK' },
      },
      {
        id: 'leaf-2',
        title: 'Post 2',
        status: 'pending',
        parent_id: 'stream-1',
        due_date: '2026-04-06T08:00:00.000Z',
        metadata: { snipara_hierarchy_level: 'N3_TASK' },
      },
    ]);

    const rootState = states.get('root-1');
    const rootPatch = buildRollupPatch(rootState);

    expect(rootPatch).toMatchObject({
      rollup_progress_total: 2,
      rollup_progress_done: 1,
      rollup_status: 'in_progress',
      rollup_next_due_at: '2026-04-06T08:00:00.000Z',
      visible_in_kanban: true,
      visible_in_agenda: true,
    });
  });

  test('marks parent blocked when one descendant leaf is blocked', () => {
    const states = computeRollupStates([
      {
        id: 'root-1',
        title: 'Campaign',
        status: 'pending',
        parent_id: null,
        metadata: { snipara_hierarchy_level: 'N0' },
      },
      {
        id: 'leaf-1',
        title: 'Blocked approval',
        status: 'blocked',
        parent_id: 'root-1',
        metadata: { snipara_blocker_reason: 'Waiting for human approval' },
      },
    ]);

    const rootPatch = buildRollupPatch(states.get('root-1'));
    expect(rootPatch).toMatchObject({
      rollup_status: 'blocked',
      rollup_primary_blocker: 'Waiting for human approval',
    });
  });
});
