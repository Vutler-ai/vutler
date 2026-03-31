'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const API_URL = process.env.TEST_API_URL || 'http://localhost:3099';
const API_KEY = process.env.TEST_API_KEY || 'vutler_b66f9da0e01787a6a81a78a5c3154d99204c117c008ea248';
const BEARER_TOKEN = process.env.TEST_BEARER_TOKEN || '';

async function api(method, path, body) {
  const authHeader = BEARER_TOKEN
    ? `Bearer ${BEARER_TOKEN}`
    : `Bearer ${API_KEY}`;
  const opts = {
    method,
    headers: {
      'Authorization': authHeader,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTempDir(prefix = 'vutler-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitForMatch(proc, matcher, timeoutMs = 15000) {
  const done = createDeferred();
  const timer = setTimeout(() => done.reject(new Error(`Timed out waiting for process output: ${matcher}`)), timeoutMs);

  const onData = (chunk) => {
    const text = String(chunk);
    if ((matcher instanceof RegExp && matcher.test(text)) || (typeof matcher === 'string' && text.includes(matcher))) {
      clearTimeout(timer);
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
      done.resolve(text);
    }
  };

  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);

  proc.once('exit', (code) => {
    clearTimeout(timer);
    done.reject(new Error(`Process exited before match (${matcher}), code=${code}`));
  });

  return done.promise;
}

function spawnNodeProcess(args, options = {}) {
  const proc = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });

  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  proc.stderr?.on('data', (chunk) => { stderr += String(chunk); });

  proc.getOutput = () => ({ stdout, stderr });
  return proc;
}

async function stopProcess(proc, signal = 'SIGINT') {
  if (!proc || proc.exitCode !== null) return;
  proc.kill(signal);
  await Promise.race([
    new Promise((resolve) => proc.once('exit', resolve)),
    sleep(5000).then(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }),
  ]);
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

module.exports = {
  api,
  assert,
  runSuite,
  pass,
  fail,
  sleep,
  makeTempDir,
  waitForMatch,
  spawnNodeProcess,
  stopProcess,
  API_URL,
  API_KEY,
  BEARER_TOKEN,
};
