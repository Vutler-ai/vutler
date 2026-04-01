/**
 * UI Pack contracts regression tests
 */

const assert = require('assert');
const { _test } = require('../api/ui-pack');

async function run() {
  const invalid = _test.validateDeployPayload({
    environment: 'production',
    config: { workspaceId: 1 },
    unknown: true
  });

  assert.ok(invalid.length >= 3, 'strict validation should return field errors');
  assert.ok(invalid.some((x) => x.field === 'root'));
  assert.ok(invalid.some((x) => x.field === 'environment'));
  assert.ok(invalid.some((x) => x.field === 'config.workspaceId'));

  const valid = _test.validateDeployPayload({
    environment: 'staging',
    config: { workspaceId: 'ws-1', name: 'Starter' },
    notes: 'ok',
    requestedBy: 'agent-1'
  });
  assert.equal(valid.length, 0);

  const data = {
    inbox_threads: [{ _id: 'th-1', subject: 'Hello' }],
    calendar_events: [{ _id: 'ev-1', title: 'Standup', start: new Date() }],
    template_deployments: [{ _id: 'dep-2', templateId: 'tpl-1', request: { config: { workspaceId: 'ws-2' } } }],
    marketplace_templates: [{ id: 'tpl-1', version: '1.2.3' }]
  };

  const db = {
    client: null,
    collection: (name) => ({
      insertOne: async (doc) => {
        doc._id = 'dep-1';
        return { insertedId: doc._id };
      },
      updateOne: async (q, update) => {
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOne: async (q) => {
        const rows = data[name] || [];
        return rows.find((row) => Object.keys(q).every((k) => row[k] === q[k])) || null;
      },
      find: () => ({
        limit: () => ({
          toArray: async () => data[name] || []
        })
      })
    })
  };

  const result = await _test.withTransactionalDeploymentRecord(
    db,
    { templateId: 'tpl-1' },
    async () => ({ route: '/workspace/ws-1' })
  );

  assert.ok(result.deploymentId.startsWith('stub_'));
  assert.equal(result.deployResult.route, '/workspace/ws-1');

  process.env.VUTLER_INBOX_PROVIDER = 'db';
  process.env.VUTLER_CALENDAR_PROVIDER = 'db';
  const inbox = await _test.getInboxThreads(db, {});
  const calendar = await _test.getCalendarEvents(db, {});
  assert.equal(inbox.provider, 'none');
  assert.equal(inbox.threads.length, 0);
  assert.equal(calendar.provider, 'none');
  assert.equal(calendar.events.length, 0);

  delete process.env.VUTLER_MARKETPLACE_DEPLOY_EXECUTOR_URL;
  const deployResult = await _test.runDeploymentExecutor(db, 'dep-2');
  assert.equal(deployResult.executor, 'stub');
  assert.equal(deployResult.workspaceId, 'default');

  console.log('✅ UI pack contract tests passed');
}

if (require.main === module) {
  run().catch((error) => {
    console.error('❌ UI pack contract tests failed');
    console.error(error);
    process.exit(1);
  });
}

if (typeof test === 'function') {
  describe('UI pack contract regression script', () => {
    test('runs without error', async () => {
      await run();
    });
  });
}
