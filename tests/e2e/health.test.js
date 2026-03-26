'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  const { passed, failed } = await runSuite('Health', [
    ['GET /api/v1/health → 200, status: "healthy"', async () => {
      const { status, data } = await api('GET', '/api/v1/health');
      assert(status === 200, `Expected 200, got ${status}`);
      assert(
        data && (data.status === 'healthy' || data.status === 'ok'),
        `Expected status "healthy" or "ok", got: ${JSON.stringify(data)}`
      );
    }],
  ]);

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
