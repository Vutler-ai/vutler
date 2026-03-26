'use strict';

const API_URL = process.env.TEST_API_URL || 'http://localhost:3099';
const API_KEY = process.env.TEST_API_KEY || 'vutler_b66f9da0e01787a6a81a78a5c3154d99204c117c008ea248';

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`${API_URL}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

// Colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function pass(name) {
  console.log(`  ${GREEN}✓${RESET} ${name}`);
}

function fail(name, err) {
  console.log(`  ${RED}✗${RESET} ${name}`);
  console.log(`    ${RED}${err.message}${RESET}`);
}

async function runSuite(suiteName, tests) {
  console.log(`\n${BOLD}${suiteName}${RESET}`);
  let passed = 0;
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      pass(name);
      passed++;
    } catch (err) {
      fail(name, err);
      failed++;
    }
  }
  return { passed, failed };
}

module.exports = { api, assert, runSuite, pass, fail, API_URL, API_KEY };
