'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const LOG_DIR  = path.join(os.homedir(), '.vutler', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'nexus.log');

// Ensure log directory exists on first use (lazy — avoids startup side-effects)
let _dirReady = false;
function ensureDir() {
  if (_dirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    _dirReady = true;
  } catch (_) {
    // If we can't create the dir, we'll log to stderr only
  }
}

/**
 * Write one JSON log entry to nexus.log and to the console.
 *
 * @param {'info'|'warn'|'error'} level
 * @param {string}                message
 * @param {object}                [meta]   — arbitrary extra context
 */
function log(level, message, meta = {}) {
  const entry = {
    ts:      new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);

  // Console output (always)
  const consoleFn = level === 'error' ? console.error
                  : level === 'warn'  ? console.warn
                  : console.log;
  consoleFn(`[Nexus:${level.toUpperCase()}] ${message}`, Object.keys(meta).length ? meta : '');

  // File output (best-effort)
  ensureDir();
  if (_dirReady) {
    try {
      fs.appendFileSync(LOG_FILE, line + '\n');
    } catch (_) {
      // Disk full or permissions issue — don't crash Nexus over a log write
    }
  }
}

/**
 * Log a Nexus error and return a serialisable error object suitable for
 * sending back to the cloud as a task.error response.
 *
 * @param {Error}   err
 * @param {object}  [context]  — e.g. { taskId, provider, action }
 * @returns {{ code: string, message: string, meta: object }}
 */
function logError(err, context = {}) {
  const code    = err.code    || 'UNKNOWN_ERROR';
  const message = err.message || String(err);
  const meta    = { ...(err.meta || {}), ...context };

  if (err.originalStack) {
    meta.originalStack = err.originalStack;
  } else if (!err.isNexus) {
    // Unexpected error — include full stack for traceability
    meta.stack = err.stack;
  }

  log('error', message, { code, ...meta });

  return { code, message, meta };
}

module.exports = {
  info:     (msg, meta) => log('info',  msg, meta),
  warn:     (msg, meta) => log('warn',  msg, meta),
  error:    (msg, meta) => log('error', msg, meta),
  logError,
  LOG_FILE,
};
