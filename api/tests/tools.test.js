/**
 * Agent Tools API — Unit Tests
 * Uses node:test + node:assert
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const toolsRouter = require('../routes/tools');
const { ALLOWED_COMMANDS, _checkRateLimit, _rateLimits } = toolsRouter;

describe('Tools API', () => {
  let server, baseUrl;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/tools', toolsRouter);
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server?.close();
  });

  beforeEach(() => {
    _rateLimits.clear();
  });

  describe('ALLOWED_COMMANDS', () => {
    it('contains expected commands', () => {
      assert.ok(ALLOWED_COMMANDS.includes('ls'));
      assert.ok(ALLOWED_COMMANDS.includes('cat'));
      assert.ok(ALLOWED_COMMANDS.includes('grep'));
      assert.ok(!ALLOWED_COMMANDS.includes('rm'));
      assert.ok(!ALLOWED_COMMANDS.includes('sudo'));
    });
  });

  describe('Rate Limiting', () => {
    it('allows 10 calls then blocks', () => {
      for (let i = 0; i < 10; i++) {
        assert.ok(_checkRateLimit('test-agent'));
      }
      assert.equal(_checkRateLimit('test-agent'), false);
    });

    it('different agents have separate limits', () => {
      for (let i = 0; i < 10; i++) _checkRateLimit('agent-a');
      assert.equal(_checkRateLimit('agent-a'), false);
      assert.ok(_checkRateLimit('agent-b')); // different agent still OK
    });
  });

  describe('POST /api/tools/web-search', () => {
    it('rejects missing query', async () => {
      const res = await fetch(`${baseUrl}/api/tools/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 503 when no Brave API key set', async () => {
      const res = await fetch(`${baseUrl}/api/tools/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', query: 'hello' }),
      });
      // 503 if no BRAVE_SEARCH_API_KEY, or 200 if it is set
      assert.ok([200, 503].includes(res.status));
    });
  });

  describe('POST /api/tools/file-read', () => {
    it('rejects missing file_path', async () => {
      const res = await fetch(`${baseUrl}/api/tools/file-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    it('blocks path traversal', async () => {
      const res = await fetch(`${baseUrl}/api/tools/file-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', file_path: '../../../etc/passwd' }),
      });
      assert.ok([403, 404].includes(res.status));
    });
  });

  describe('POST /api/tools/shell-exec', () => {
    it('rejects missing command', async () => {
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test' }),
      });
      assert.equal(res.status, 400);
    });

    it('blocks disallowed commands', async () => {
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', command: 'rm -rf /' }),
      });
      assert.equal(res.status, 403);
    });

    it('blocks dangerous patterns', async () => {
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', command: 'echo hello; rm -rf /' }),
      });
      assert.equal(res.status, 403);
    });

    it('executes allowed commands', async () => {
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', command: 'echo hello world' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.exit_code, 0);
      assert.match(data.stdout, /hello world/);
    });

    it('executes date command', async () => {
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'test', command: 'date' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it('enforces rate limit', async () => {
      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        _checkRateLimit('rate-test');
      }
      const res = await fetch(`${baseUrl}/api/tools/shell-exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: 'rate-test', command: 'echo hi' }),
      });
      assert.equal(res.status, 429);
    });
  });
});
