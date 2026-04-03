'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_BUFFER_LIMIT_BYTES = 256 * 1024;
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_WAIT_MS = 150;
const MAX_WAIT_MS = 5_000;
const CWD_QUERY_TIMEOUT_MS = 1_500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class TerminalSessionProvider {
  constructor(config = {}, options = {}) {
    this.bufferLimitBytes = clampInteger(
      config.buffer_limit_bytes || config.bufferLimitBytes,
      DEFAULT_BUFFER_LIMIT_BYTES,
      8 * 1024,
      5 * 1024 * 1024
    );
    this.idleTimeoutMs = clampInteger(
      config.idle_timeout_ms || config.idleTimeoutMs,
      DEFAULT_IDLE_TIMEOUT_MS,
      5_000,
      24 * 60 * 60 * 1000
    );
    this.defaultCwd = path.resolve(
      options.defaultCwd || options.filesystemRoot || config.default_cwd || process.cwd()
    );
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this._cleanupExpiredSessions(), Math.min(this.idleTimeoutMs, 60_000));
    this.cleanupTimer.unref?.();
  }

  async open(options = {}) {
    const cwd = path.resolve(options.cwd || this.defaultCwd);
    const shellSpec = this._getShellSpec(options.shell);
    const env = {
      ...process.env,
      ...(options.env && typeof options.env === 'object' ? options.env : {}),
    };

    const proc = spawn(shellSpec.command, shellSpec.args, {
      cwd,
      env,
      stdio: 'pipe',
      shell: false,
    });

    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      proc,
      shell: shellSpec.label,
      platform: shellSpec.platform,
      cwd,
      buffer: Buffer.alloc(0),
      bufferStart: 0,
      cursor: 0,
      startedAt: new Date().toISOString(),
      lastUsedAt: Date.now(),
      closed: false,
      exitCode: null,
      queue: Promise.resolve(),
    };

    proc.stdout.on('data', (chunk) => this._appendOutput(session, chunk));
    proc.stderr.on('data', (chunk) => this._appendOutput(session, chunk));
    proc.on('close', (code) => {
      session.closed = true;
      session.exitCode = code;
      session.lastUsedAt = Date.now();
    });
    proc.on('error', (err) => {
      session.closed = true;
      session.exitCode = -1;
      session.lastUsedAt = Date.now();
      this._appendOutput(session, Buffer.from(`\n[terminal error] ${err.message}\n`, 'utf8'));
    });

    this.sessions.set(sessionId, session);
    return this._buildOpenResult(session);
  }

  async exec({ sessionId, input = '', waitMs = DEFAULT_WAIT_MS, appendNewline = true } = {}) {
    const session = this._getSession(sessionId);
    return this._enqueue(session, async () => {
      const safeInput = String(input ?? '');
      const cursorBefore = session.cursor;
      const payload = safeInput.length > 0 && appendNewline && !safeInput.endsWith('\n')
        ? `${safeInput}\n`
        : safeInput;

      if (payload.length > 0) {
        session.proc.stdin.write(payload);
      }

      this._touch(session);
      const safeWait = clampInteger(waitMs, DEFAULT_WAIT_MS, 0, MAX_WAIT_MS);
      if (safeWait > 0) await delay(safeWait);

      const readResult = this.read(sessionId, { cursor: cursorBefore });
      return {
        sessionId: session.id,
        cursor: readResult.cursor,
        bufferStart: readResult.bufferStart,
        output: readResult.output,
        truncated: readResult.truncated,
        waitMs: safeWait,
      };
    });
  }

  read(sessionId, { cursor = 0 } = {}) {
    const session = this._getSession(sessionId, { allowClosed: true });
    const requestedCursor = Number.isFinite(Number(cursor)) ? Math.max(0, Number(cursor)) : 0;
    const truncated = requestedCursor < session.bufferStart;
    const relativeOffset = truncated ? 0 : requestedCursor - session.bufferStart;
    const output = session.buffer.subarray(relativeOffset).toString('utf8');
    this._touch(session);

    return {
      sessionId: session.id,
      cursor: session.cursor,
      bufferStart: session.bufferStart,
      output,
      truncated,
      closed: session.closed,
      exitCode: session.exitCode,
    };
  }

  async snapshot(sessionId) {
    const session = this._getSession(sessionId, { allowClosed: true });
    return this._enqueue(session, async () => {
      if (!session.closed) {
        const cwd = await this._queryCurrentDirectory(session).catch(() => session.cwd);
        if (cwd) session.cwd = cwd;
      }
      this._touch(session);
      return this._buildSnapshotResult(session);
    });
  }

  async close(sessionId) {
    const session = this._getSession(sessionId, { allowClosed: true });
    return this._enqueue(session, async () => {
      this._disposeSession(session);
      return {
        sessionId,
        closed: true,
      };
    });
  }

  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const session of this.sessions.values()) {
      this._disposeSession(session);
    }
    this.sessions.clear();
  }

  _getShellSpec(shellOverride) {
    const requested = String(shellOverride || '').trim();
    if (requested) {
      return {
        command: requested,
        args: [],
        label: requested,
        platform: process.platform,
      };
    }

    if (process.platform === 'win32') {
      return {
        command: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
        label: 'powershell',
        platform: 'win32',
      };
    }

    return {
      command: process.env.SHELL || 'sh',
      args: [],
      label: process.env.SHELL || 'sh',
      platform: process.platform,
    };
  }

  _getSession(sessionId, { allowClosed = false } = {}) {
    const session = this.sessions.get(String(sessionId || ''));
    if (!session) {
      throw new Error(`Terminal session not found: ${sessionId}`);
    }
    if (session.closed && !allowClosed) {
      throw new Error(`Terminal session is closed: ${sessionId}`);
    }
    return session;
  }

  _enqueue(session, fn) {
    const next = session.queue.then(fn, fn);
    session.queue = next.catch(() => {});
    return next;
  }

  _touch(session) {
    session.lastUsedAt = Date.now();
  }

  _appendOutput(session, chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''), 'utf8');
    if (buf.length === 0) return;

    session.buffer = Buffer.concat([session.buffer, buf]);
    session.cursor += buf.length;
    if (session.buffer.length > this.bufferLimitBytes) {
      const overflow = session.buffer.length - this.bufferLimitBytes;
      session.buffer = session.buffer.subarray(overflow);
      session.bufferStart += overflow;
    }
    session.lastUsedAt = Date.now();
  }

  async _queryCurrentDirectory(session) {
    const marker = `__VUTLER_CWD_${randomUUID().replace(/-/g, '')}__`;
    const cursorBefore = session.cursor;
    const command = session.platform === 'win32'
      ? `Write-Output "${marker}$PWD${marker}"\n`
      : `printf '${marker}%s${marker}\\n' "$PWD"\n`;

    session.proc.stdin.write(command);
    session.lastUsedAt = Date.now();
    const matched = await this._waitForPattern(session, cursorBefore, new RegExp(`${escapeRegex(marker)}([\\s\\S]*?)${escapeRegex(marker)}`), CWD_QUERY_TIMEOUT_MS);
    return matched?.[1] ? String(matched[1]).trim() : session.cwd;
  }

  async _waitForPattern(session, cursorBefore, pattern, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const readResult = this.read(session.id, { cursor: cursorBefore });
      const match = readResult.output.match(pattern);
      if (match) return match;
      if (session.closed) break;
      await delay(25);
    }
    throw new Error(`Timed out waiting for terminal session ${session.id}`);
  }

  _cleanupExpiredSessions() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.closed) {
        this.sessions.delete(session.id);
        continue;
      }
      if ((now - session.lastUsedAt) > this.idleTimeoutMs) {
        this._disposeSession(session);
      }
    }
  }

  _disposeSession(session) {
    if (!session) return;
    session.closed = true;
    session.lastUsedAt = Date.now();
    this.sessions.delete(session.id);

    if (session.proc && session.proc.exitCode === null) {
      try {
        session.proc.kill('SIGTERM');
      } catch (_) {
        // Best-effort cleanup only.
      }
    }
  }

  _buildOpenResult(session) {
    return {
      sessionId: session.id,
      cwd: session.cwd,
      shell: session.shell,
      cursor: session.cursor,
      bufferStart: session.bufferStart,
      startedAt: session.startedAt,
    };
  }

  _buildSnapshotResult(session) {
    return {
      sessionId: session.id,
      cwd: session.cwd,
      shell: session.shell,
      cursor: session.cursor,
      bufferStart: session.bufferStart,
      startedAt: session.startedAt,
      lastUsedAt: new Date(session.lastUsedAt).toISOString(),
      closed: session.closed,
      exitCode: session.exitCode,
    };
  }
}

module.exports = {
  TerminalSessionProvider,
};
