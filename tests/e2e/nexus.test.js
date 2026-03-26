'use strict';

const { api, assert, runSuite, API_KEY } = require('./helpers');

async function main() {
  const { passed, failed } = await runSuite('Nexus', [
    ['GET /api/v1/nexus/status → 200', async () => {
      const { status, data } = await api('GET', '/api/v1/nexus/status');
      assert(
        status === 200,
        `Expected 200, got ${status}: ${JSON.stringify(data)}`
      );
      assert(data !== null, 'Expected non-null response');
    }],

    ['POST /api/v1/nexus/register (with valid API key) → 200', async () => {
      const payload = {
        name: `e2e-test-node-${Date.now()}`,
        version: '1.0.0-e2e',
        capabilities: ['test'],
        api_key: API_KEY,
      };
      const { status, data } = await api('POST', '/api/v1/nexus/register', payload);
      assert(
        status === 200 || status === 201 || status === 400 || status === 409,
        `Expected 200/201 (success) or 400/409 (validation/conflict), got ${status}: ${JSON.stringify(data)}`
      );
      // If successful, response should include a node id or token
      if (status === 200 || status === 201) {
        assert(data !== null, 'Expected non-null registration response');
      }
    }],
  ]);

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
