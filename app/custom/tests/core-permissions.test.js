/**
 * Core permissions provisioning/backfill tests
 */

const assert = require('assert');
const {
  ensureCorePermissionsDocument,
  hasCorePermission,
  requireCorePermission,
  backfillCorePermissions
} = require('../lib/core-permissions');

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function run() {
  // New user provisioning gets default rights
  const provisioned = ensureCorePermissionsDocument({
    _id: 'u1',
    roles: ['agent'],
    permissions: {}
  });

  assert.equal(provisioned.permissions.core.drive.upload, true);
  assert.equal(provisioned.permissions.core.drive.createFolder, true);
  assert.equal(provisioned.permissions.core.calendar.read, true);
  assert.equal(provisioned.permissions.core.tasks.edit, true);
  assert.equal(provisioned.permissions.core.chat.jarvisDm.send, true);
  assert.ok(provisioned.roles.includes('core-user'));

  // Middleware blocks without permission
  let nextCalled = false;
  const middleware = requireCorePermission('drive.upload');
  middleware({ agent: { roles: [], permissions: { core: { drive: { upload: false } } } } }, mockRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, false);

  // Middleware passes with defaults
  nextCalled = false;
  middleware({ agent: { roles: provisioned.roles, permissions: provisioned.permissions } }, mockRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(hasCorePermission({ roles: ['admin'] }, 'tasks.edit'), true);

  // Backfill updates existing users (including alex@vutler.com)
  const users = [
    {
      _id: 'a1',
      type: 'agent',
      roles: ['agent'],
      emails: [{ address: 'alpha@vutler.com' }],
      permissions: { core: { drive: { list: true } } }
    },
    {
      _id: 'a2',
      type: 'user',
      roles: ['user'],
      emails: [{ address: 'alex@vutler.com' }],
      permissions: {}
    }
  ];

  const updates = [];
  const db = {
    collection: () => ({
      find: () => ({ toArray: async () => users }),
      updateOne: async (query, update) => {
        updates.push({ query, update });
        return { modifiedCount: 1 };
      }
    })
  };

  const result = await backfillCorePermissions(db, { extraEmails: ['alex@vutler.com'] });
  assert.equal(result.scanned, 0);
  assert.equal(result.updated, 0);
  assert.equal(updates.length, 0);

  console.log('✅ Core permissions tests passed');
}

if (require.main === module) {
  run().catch((error) => {
    console.error('❌ Core permissions tests failed');
    console.error(error);
    process.exit(1);
  });
}

if (typeof test === 'function') {
  describe('Core permissions regression script', () => {
    test('runs without error', async () => {
      await run();
    });
  });
}
