'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { TerminalSessionProvider } = require('../packages/nexus/lib/providers/terminal-session');

function makeTempDir(prefix = 'vutler-terminal-session-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('Nexus terminal session provider', () => {
  let provider;
  let rootDir;

  beforeEach(() => {
    rootDir = makeTempDir();
    provider = new TerminalSessionProvider({
      idle_timeout_ms: 5_000,
      buffer_limit_bytes: 64 * 1024,
    }, {
      defaultCwd: rootDir,
    });
  });

  afterEach(() => {
    provider.shutdown();
  });

  test('opens a persistent shell session and returns incremental output', async () => {
    const opened = await provider.open({ cwd: rootDir });
    expect(opened.sessionId).toBeTruthy();
    expect(opened.cwd).toBe(rootDir);

    const first = await provider.exec({
      sessionId: opened.sessionId,
      input: 'echo hello-from-terminal',
      waitMs: 150,
    });
    expect(first.output).toContain('hello-from-terminal');

    const second = await provider.exec({
      sessionId: opened.sessionId,
      input: 'echo second-line',
      waitMs: 150,
    });
    expect(second.output).toContain('second-line');
    expect(second.output).not.toContain('hello-from-terminal');

    const closed = await provider.close(opened.sessionId);
    expect(closed).toEqual({
      sessionId: opened.sessionId,
      closed: true,
    });
  });

  test('snapshot reports the current working directory after cd', async () => {
    const childDir = path.join(rootDir, 'child');
    fs.mkdirSync(childDir, { recursive: true });

    const opened = await provider.open({ cwd: rootDir });

    await provider.exec({
      sessionId: opened.sessionId,
      input: `cd "${childDir.replace(/"/g, '\\"')}"`,
      waitMs: 100,
    });

    const snapshot = await provider.snapshot(opened.sessionId);
    expect(snapshot.cwd).toBe(childDir);
    expect(snapshot.sessionId).toBe(opened.sessionId);
    expect(typeof snapshot.lastUsedAt).toBe('string');
  });

  test('read and close still work after the shell exits', async () => {
    const opened = await provider.open({ cwd: rootDir });

    const result = await provider.exec({
      sessionId: opened.sessionId,
      input: 'printf "bye" && exit',
      waitMs: 150,
    });
    expect(result.output).toContain('bye');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const readResult = provider.read(opened.sessionId, {
      cursor: result.cursor,
    });
    expect(readResult.closed).toBe(true);
    expect(readResult.exitCode).toBe(0);

    const closed = await provider.close(opened.sessionId);
    expect(closed).toEqual({
      sessionId: opened.sessionId,
      closed: true,
    });
  });
});
