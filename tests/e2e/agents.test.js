'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  let createdId = null;

  const { passed, failed } = await runSuite('Agents', [
    ['GET /api/v1/agents → 200, array', async () => {
      const { status, data } = await api('GET', '/api/v1/agents');
      assert(status === 200, `Expected 200, got ${status}`);
      const agents = data?.data ?? data;
      assert(Array.isArray(agents), `Expected array, got: ${JSON.stringify(data)}`);
    }],

    ['POST /api/v1/agents → 201, creates agent', async () => {
      const payload = {
        name: `E2E Test Agent ${Date.now()}`,
        username: `e2e_agent_${Date.now()}`,
        model: 'gpt-5.4-mini',
        provider: 'openai',
        system_prompt: 'You are a test agent created by e2e tests.',
      };
      const { status, data } = await api('POST', '/api/v1/agents', payload);
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
      const agent = data?.data ?? data?.agent ?? data;
      assert(agent && (agent.id || agent._id), `No id in response: ${JSON.stringify(data)}`);
      createdId = agent.id || agent._id;
    }],

    ['GET /api/v1/agents/:id → 200, agent details', async () => {
      if (!createdId) {
        // Try to get any existing agent
        const { data } = await api('GET', '/api/v1/agents');
        const agents = data?.data ?? data;
        if (Array.isArray(agents) && agents.length > 0) {
          createdId = agents[0].id || agents[0]._id;
        }
      }
      assert(createdId, 'No agent ID available for lookup');
      const { status, data } = await api('GET', `/api/v1/agents/${createdId}`);
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const agent = data?.data ?? data?.agent ?? data;
      assert(agent && (agent.id || agent._id), `No agent in response: ${JSON.stringify(data)}`);
    }],

    ['DELETE /api/v1/agents/:id → 200 or 204', async () => {
      assert(createdId, 'No agent ID to delete (create step may have failed)');
      const { status, data } = await api('DELETE', `/api/v1/agents/${createdId}`);
      assert(
        status === 200 || status === 204,
        `Expected 200 or 204, got ${status}: ${JSON.stringify(data)}`
      );
      createdId = null;
    }],
  ]);

  // Cleanup in case delete test was skipped
  if (createdId) {
    await api('DELETE', `/api/v1/agents/${createdId}`).catch(() => {});
  }

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
