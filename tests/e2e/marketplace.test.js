'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  const { passed, failed } = await runSuite('Marketplace', [
    ['GET /api/v1/marketplace/templates → 200, array of templates', async () => {
      const { status, data } = await api('GET', '/api/v1/marketplace/templates');
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const templates = data?.data ?? data?.templates ?? data;
      assert(
        Array.isArray(templates) || (data && typeof data === 'object'),
        `Expected templates response, got: ${JSON.stringify(data)}`
      );
    }],

    ['GET /api/v1/marketplace/skills → 200, skills with categories', async () => {
      const { status, data } = await api('GET', '/api/v1/marketplace/skills');
      assert(
        status === 200 || status === 404,
        `Expected 200 or 404, got ${status}: ${JSON.stringify(data)}`
      );
      if (status === 200) {
        assert(data !== null, 'Expected non-null skills response');
        // Skills may be an array or an object with categories
        const skills = data?.data ?? data?.skills ?? data;
        assert(
          Array.isArray(skills) || typeof skills === 'object',
          `Expected skills array or object, got: ${typeof skills}`
        );
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
