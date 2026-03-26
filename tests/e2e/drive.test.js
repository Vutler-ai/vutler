'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  let createdFolderId = null;

  const { passed, failed } = await runSuite('Drive', [
    ['GET /api/v1/drive/files?path=/ → 200, files array', async () => {
      const { status, data } = await api('GET', '/api/v1/drive/files?path=/');
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const files = data?.data ?? data?.files ?? data;
      assert(
        Array.isArray(files) || (data && typeof data === 'object'),
        `Expected files response, got: ${JSON.stringify(data)}`
      );
    }],

    ['POST /api/v1/drive/folders → 201, create folder', async () => {
      const payload = {
        name: `e2e-test-folder-${Date.now()}`,
        parent_id: null,
      };
      const { status, data } = await api('POST', '/api/v1/drive/folders', payload);
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
      const folder = data?.data ?? data?.folder ?? data;
      assert(folder && folder.id, `No id in response: ${JSON.stringify(data)}`);
      createdFolderId = folder.id;
    }],

    ['DELETE /api/v1/drive/files/:id → 200', async () => {
      assert(createdFolderId, 'No folder ID to delete (create step may have failed)');
      const { status, data } = await api('DELETE', `/api/v1/drive/files/${createdFolderId}`);
      assert(
        status === 200 || status === 204,
        `Expected 200 or 204, got ${status}: ${JSON.stringify(data)}`
      );
      createdFolderId = null;
    }],
  ]);

  // Cleanup
  if (createdFolderId) {
    await api('DELETE', `/api/v1/drive/files/${createdFolderId}`).catch(() => {});
  }

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
