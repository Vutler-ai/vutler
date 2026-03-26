'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  let createdTaskId = null;
  let createdSubtaskId = null;

  const { passed, failed } = await runSuite('Tasks', [
    ['GET /api/v1/tasks-v2 → 200, array', async () => {
      const { status, data } = await api('GET', '/api/v1/tasks-v2');
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const tasks = data?.data ?? data?.tasks ?? data;
      assert(Array.isArray(tasks), `Expected array, got: ${JSON.stringify(data)}`);
    }],

    ['POST /api/v1/tasks-v2 → 201, create task', async () => {
      const payload = {
        title: `E2E Test Task ${Date.now()}`,
        description: 'Created by e2e test suite',
        status: 'pending',
        priority: 'low',
      };
      const { status, data } = await api('POST', '/api/v1/tasks-v2', payload);
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
      const task = data?.data ?? data?.task ?? data;
      assert(task && task.id, `No id in response: ${JSON.stringify(data)}`);
      createdTaskId = task.id;
    }],

    ['PATCH /api/v1/tasks-v2/:id → 200, update status', async () => {
      assert(createdTaskId, 'No task ID available (create step may have failed)');
      const { status, data } = await api('PATCH', `/api/v1/tasks-v2/${createdTaskId}`, {
        status: 'in_progress',
      });
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const task = data?.data ?? data?.task ?? data;
      assert(
        task && (task.status === 'in_progress' || data?.success),
        `Status not updated: ${JSON.stringify(data)}`
      );
    }],

    ['GET /api/v1/tasks-v2/:id/subtasks → 200', async () => {
      assert(createdTaskId, 'No task ID available');
      const { status, data } = await api('GET', `/api/v1/tasks-v2/${createdTaskId}/subtasks`);
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const subtasks = data?.data ?? data?.subtasks ?? data;
      assert(Array.isArray(subtasks), `Expected array, got: ${JSON.stringify(data)}`);
    }],

    ['POST /api/v1/tasks-v2/:id/subtasks → 201, create subtask', async () => {
      assert(createdTaskId, 'No parent task ID available');
      const payload = {
        title: `E2E Subtask ${Date.now()}`,
        status: 'pending',
      };
      const { status, data } = await api('POST', `/api/v1/tasks-v2/${createdTaskId}/subtasks`, payload);
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
      const subtask = data?.data ?? data?.subtask ?? data;
      assert(subtask && subtask.id, `No id in response: ${JSON.stringify(data)}`);
      createdSubtaskId = subtask.id;
    }],
  ]);

  // Cleanup
  if (createdTaskId) {
    await api('DELETE', `/api/v1/tasks-v2/${createdTaskId}`).catch(() => {});
  }

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
