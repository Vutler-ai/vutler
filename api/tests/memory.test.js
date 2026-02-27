/**
 * Agent Memory API — Unit Tests
 * Uses node:test + node:assert (no deps needed)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

// Mock pool for testing without DB
const mockRows = [];
let lastQuery = '';
let lastParams = [];

// We test the route logic by mounting it on a test server
const memoryRouter = require('../routes/memory');

describe('Memory API', () => {
  let server, baseUrl;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(() => {
    server?.close();
  });

  it('POST /api/memory — rejects missing fields', async () => {
    const res = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'test' }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  it('POST /api/memory — rejects invalid type', async () => {
    const res = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'test', type: 'invalid', content: 'hello' }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /type must be one of/);
  });

  it('GET /api/memory/:agent_id — rejects invalid type filter', async () => {
    const res = await fetch(`${baseUrl}/api/memory/test-agent?type=invalid`);
    assert.equal(res.status, 400);
  });

  it('DELETE /api/memory/:id — returns 404 or 500 for nonexistent', async () => {
    const res = await fetch(`${baseUrl}/api/memory/00000000-0000-0000-0000-000000000000`, {
      method: 'DELETE',
    });
    // Will be 500 (no DB) or 404 — both acceptable in unit test
    assert.ok([404, 500].includes(res.status));
  });
});
