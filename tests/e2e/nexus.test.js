'use strict';

const fs = require('fs');
const path = require('path');
const {
  api,
  assert,
  runSuite,
  sleep,
  API_KEY,
  API_URL,
  makeTempDir,
  waitForMatch,
  spawnNodeProcess,
  stopProcess,
} = require('./helpers');

async function waitForNodeOnline(nodeId, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { status, data } = await api('GET', `/api/v1/nexus/nodes/${nodeId}`);
    if (status === 200 && data?.node?.status === 'online') return data.node;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for node ${nodeId} to become online`);
}

async function waitForNodeByName(nodeName, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { status, data } = await api('GET', '/api/v1/nexus/status');
    if (status === 200) {
      const node = (data?.nodes || []).find((entry) => entry.name === nodeName);
      if (node?.id) return node;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for node ${nodeName} to register`);
}

async function main() {
  const { passed, failed } = await runSuite('Nexus', [
    ['GET /api/v1/nexus/status → 200', async () => {
      const { status, data } = await api('GET', '/api/v1/nexus/status');
      assert(
        status === 200,
        `Expected 200, got ${status}: ${JSON.stringify(data)}`
      );
      assert(data !== null, 'Expected non-null response');
      assert(data?.billing?.planId, `Expected Nexus billing snapshot, got ${JSON.stringify(data)}`);
      assert(typeof data?.commandStats?.queued === 'number', `Expected Nexus command stats, got ${JSON.stringify(data)}`);
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

    ['POST /api/v1/nexus/nodes/:id/dispatch waits for node command completion', async () => {
      const nodeName = `e2e-enterprise-node-${Date.now()}`;
      const created = await api('POST', '/api/v1/nexus', {
        name: nodeName,
        type: 'docker',
        config: {
          mode: 'enterprise',
          max_seats: 2,
          client_name: 'E2E Client',
        },
      });

      assert(
        created.status === 201 || created.status === 200,
        `Expected 200/201 creating node, got ${created.status}: ${JSON.stringify(created.data)}`
      );

      const nodeId = created.data?.data?.id || created.data?.id;
      assert(nodeId, `Expected node id in create response: ${JSON.stringify(created.data)}`);

      try {
        const caps = await api('GET', `/api/v1/nexus/nodes/${nodeId}/capabilities`);
        assert(caps.status === 200, `Expected 200 capabilities response, got ${caps.status}: ${JSON.stringify(caps.data)}`);
        assert(caps.data?.providerSources?.mail?.active, `Expected providerSources.mail.active, got ${JSON.stringify(caps.data)}`);

        const dispatchPromise = api('POST', `/api/v1/nexus/nodes/${nodeId}/dispatch`, {
          command: 'read_contacts',
          args: { limit: 3 },
        });

        await sleep(500);

        const claimed = await api('GET', `/api/v1/nexus/${nodeId}/commands?claim=1&limit=1`);
        assert(claimed.status === 200, `Expected 200 claiming commands, got ${claimed.status}: ${JSON.stringify(claimed.data)}`);
        const command = claimed.data?.commands?.[0];
        assert(command, `Expected queued command: ${JSON.stringify(claimed.data)}`);
        assert(command.type === 'dispatch_action', `Expected dispatch_action, got ${command.type}`);

        const completed = await api('POST', `/api/v1/nexus/${nodeId}/commands/${command.id}/result`, {
          status: 'completed',
          result: {
            taskId: command.id,
            status: 'completed',
            data: {
              contacts: [
                { name: 'Alice Example', email: 'alice@example.com', company: 'E2E Client' },
              ],
            },
            metadata: { action: 'read_contacts', durationMs: 42 },
          },
        });
        assert(completed.status === 200, `Expected 200 completing command, got ${completed.status}: ${JSON.stringify(completed.data)}`);

        const dispatchResult = await dispatchPromise;
        assert(dispatchResult.status === 200, `Expected 200 dispatch response, got ${dispatchResult.status}: ${JSON.stringify(dispatchResult.data)}`);
        assert(dispatchResult.data?.status === 'completed', `Expected completed dispatch status, got ${JSON.stringify(dispatchResult.data)}`);
        assert(Array.isArray(dispatchResult.data?.data?.contacts), `Expected contacts array, got ${JSON.stringify(dispatchResult.data)}`);

        const history = await api('GET', `/api/v1/nexus/nodes/${nodeId}/commands?limit=5`);
        assert(history.status === 200, `Expected 200 command history response, got ${history.status}: ${JSON.stringify(history.data)}`);
        assert(Array.isArray(history.data?.commands), `Expected command history array, got ${JSON.stringify(history.data)}`);
        assert(history.data?.commands?.[0]?.attempts >= 1, `Expected command attempts in history, got ${JSON.stringify(history.data)}`);
      } finally {
        await api('DELETE', `/api/v1/nexus/${nodeId}`);
      }
    }],

    ['Queued commands expire and stale leases are reclaimable', async () => {
      const nodeName = `e2e-hardening-node-${Date.now()}`;
      const created = await api('POST', '/api/v1/nexus', {
        name: nodeName,
        type: 'docker',
        config: {
          mode: 'enterprise',
          max_seats: 1,
          client_name: 'E2E Hardening',
        },
      });

      assert(
        created.status === 201 || created.status === 200,
        `Expected 200/201 creating node, got ${created.status}: ${JSON.stringify(created.data)}`
      );

      const nodeId = created.data?.data?.id || created.data?.id;
      assert(nodeId, `Expected node id in create response: ${JSON.stringify(created.data)}`);

      try {
        const requeue = await api('POST', `/api/v1/nexus/nodes/${nodeId}/dispatch?wait=0`, {
          command: 'read_contacts',
          args: { limit: 1 },
          leaseMs: 150,
          timeoutMs: 2000,
          maxAttempts: 2,
          wait: false,
        });
        assert(requeue.status === 202, `Expected 202 queued dispatch, got ${requeue.status}: ${JSON.stringify(requeue.data)}`);

        const firstClaim = await api('GET', `/api/v1/nexus/${nodeId}/commands?claim=1&limit=1`);
        const firstCommand = firstClaim.data?.commands?.[0];
        assert(firstClaim.status === 200 && firstCommand, `Expected first claimed command, got ${JSON.stringify(firstClaim.data)}`);

        await sleep(250);

        const secondClaim = await api('GET', `/api/v1/nexus/${nodeId}/commands?claim=1&limit=1`);
        const reclaimed = secondClaim.data?.commands?.[0];
        assert(secondClaim.status === 200 && reclaimed, `Expected reclaimed command after lease expiry, got ${JSON.stringify(secondClaim.data)}`);
        assert(reclaimed.id === firstCommand.id, `Expected same command to be reclaimed, got ${JSON.stringify(secondClaim.data)}`);

        const expiring = await api('POST', `/api/v1/nexus/nodes/${nodeId}/dispatch?wait=0`, {
          command: 'read_contacts',
          args: { limit: 1 },
          timeoutMs: 150,
          maxAttempts: 1,
          wait: false,
        });
        const expiringId = expiring.data?.commandId;
        assert(expiring.status === 202 && expiringId, `Expected queued expiring command, got ${JSON.stringify(expiring.data)}`);

        await sleep(250);

        const expiredStatus = await api('GET', `/api/v1/nexus/nodes/${nodeId}/commands/${expiringId}`);
        assert(expiredStatus.status === 200, `Expected 200 reading expired command, got ${expiredStatus.status}: ${JSON.stringify(expiredStatus.data)}`);
        assert(expiredStatus.data?.command?.status === 'expired', `Expected expired command status, got ${JSON.stringify(expiredStatus.data)}`);
      } finally {
        await api('DELETE', `/api/v1/nexus/${nodeId}`);
      }
    }],

    ['Nexus runtime executes a real queued command end-to-end', async () => {
      const runtimeHome = makeTempDir('vutler-nexus-home-');
      const allowedDir = path.join(runtimeHome, 'fixtures');
      fs.mkdirSync(allowedDir, { recursive: true });
      fs.writeFileSync(path.join(allowedDir, 'hello.txt'), 'nexus-e2e\n', 'utf8');
      const nodeName = `e2e-runtime-${Date.now()}`;
      const cliPath = path.join(process.cwd(), 'packages/nexus/bin/cli.js');
      const port = String(3200 + Math.floor(Math.random() * 200));
      const runtimeProc = spawnNodeProcess([cliPath, 'start', '--key', API_KEY, '--name', nodeName, '--port', port, '--type', 'docker', '--server', API_URL], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: runtimeHome,
          NEXUS_PORT: port,
          NEXUS_TYPE: 'docker',
          NEXUS_MODE: 'enterprise',
          NEXUS_PERMISSIONS: JSON.stringify({
            allowedFolders: [allowedDir],
            allowedActions: ['list_dir', 'read_document'],
          }),
        },
      });

      let nodeId = null;
      try {
        await waitForMatch(runtimeProc, /Node ".*" online/);
        const node = await waitForNodeByName(nodeName);
        nodeId = node.id;
        await waitForNodeOnline(nodeId);

        const dispatchResult = await api('POST', `/api/v1/nexus/nodes/${nodeId}/dispatch`, {
          command: 'list_dir',
          args: { path: allowedDir },
        });

        assert(
          dispatchResult.status === 200,
          `Expected 200 dispatch response, got ${dispatchResult.status}: ${JSON.stringify(dispatchResult.data)}\nRuntime: ${JSON.stringify(runtimeProc.getOutput())}`
        );
        assert(dispatchResult.data?.status === 'completed', `Expected completed dispatch, got ${JSON.stringify(dispatchResult.data)}`);

        const entries = dispatchResult.data?.data?.entries || [];
        assert(Array.isArray(entries), `Expected entries array, got ${JSON.stringify(dispatchResult.data)}`);
        assert(entries.some((entry) => entry.name === 'hello.txt'), `Expected hello.txt in entries, got ${JSON.stringify(entries)}`);
      } finally {
        await stopProcess(runtimeProc);
        if (nodeId) {
          await api('DELETE', `/api/v1/nexus/${nodeId}`);
        }
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
