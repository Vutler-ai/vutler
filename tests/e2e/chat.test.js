'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  let createdChannelId = null;

  const { passed, failed } = await runSuite('Chat', [
    ['GET /api/v1/chat/channels → 200', async () => {
      const { status, data } = await api('GET', '/api/v1/chat/channels');
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const channels = data?.data ?? data?.channels ?? data;
      assert(Array.isArray(channels), `Expected array, got: ${JSON.stringify(data)}`);
    }],

    ['POST /api/v1/chat/channels → 201, create channel', async () => {
      const payload = {
        name: `e2e-test-${Date.now()}`,
        type: 'channel',
        description: 'Created by e2e test suite',
      };
      const { status, data } = await api('POST', '/api/v1/chat/channels', payload);
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
      const channel = data?.data ?? data?.channel ?? data;
      assert(channel && channel.id, `No id in response: ${JSON.stringify(data)}`);
      createdChannelId = channel.id;
    }],

    ['POST /api/v1/chat/channels/:id/messages → 201, send message', async () => {
      assert(createdChannelId, 'No channel ID available (create step may have failed)');
      const { status, data } = await api(
        'POST',
        `/api/v1/chat/channels/${createdChannelId}/messages`,
        { content: 'Hello from e2e test!' }
      );
      assert(
        status === 201 || status === 200,
        `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`
      );
    }],

    ['GET /api/v1/chat/channels/:id/messages → 200, messages array', async () => {
      assert(createdChannelId, 'No channel ID available');
      const { status, data } = await api('GET', `/api/v1/chat/channels/${createdChannelId}/messages`);
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      const messages = data?.data ?? data?.messages ?? data;
      assert(Array.isArray(messages), `Expected array, got: ${JSON.stringify(data)}`);
    }],
  ]);

  // Cleanup
  if (createdChannelId) {
    await api('DELETE', `/api/v1/chat/channels/${createdChannelId}`).catch(() => {});
  }

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
