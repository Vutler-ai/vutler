'use strict';

/**
 * Sandbox Service — Real Code Execution Utility
 *
 * Used by agents and the sandbox API to run code in isolated child processes.
 * Supports JavaScript, Python, and Shell with timeout enforcement.
 *
 * SECURITY NOTE:
 *   - Code runs as the same user as the Node.js process.
 *   - Network access is NOT restricted at the OS level — treat all sandbox
 *     code as untrusted. Run in a Docker container / isolated environment
 *     for production multi-tenant scenarios.
 *   - Timeouts are enforced via child_process kill signals (SIGTERM → SIGKILL).
 *   - Command-line injection is avoided by passing code via stdin / `-c` flags,
 *     never interpolated into a shell string.
 */

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB cap per stream

/**
 * Build the child process command + args for a given language.
 * Code is passed via command args (not shell interpolation) to avoid injection.
 *
 * @param {'javascript'|'python'|'shell'} language
 * @param {string} code
 * @returns {{ cmd: string, args: string[] }}
 */
function buildCommand(language, code) {
  switch (language) {
    case 'javascript':
      // `node -e` runs the code string directly — no temp file needed
      return { cmd: 'node', args: ['-e', code] };
    case 'python':
      return { cmd: 'python3', args: ['-c', code] };
    case 'shell':
      // `sh -c` runs arbitrary shell; code passed as arg, not interpolated
      return { cmd: 'sh', args: ['-c', code] };
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

/**
 * Execute code in a child process with timeout enforcement.
 * Stores the result in DB and returns the execution record.
 *
 * @param {'javascript'|'python'|'shell'} language
 * @param {string} code
 * @param {string|null} agentId
 * @param {number} [timeoutMs]
 * @param {object} [opts]
 * @param {string|null} [opts.batchId]
 * @param {number|null} [opts.batchIndex]
 * @returns {Promise<SandboxResult>}
 */
async function executeInSandbox(language, code, agentId = null, timeoutMs = DEFAULT_TIMEOUT_MS, opts = {}) {
  const { batchId = null, batchIndex = null } = opts;
  const startTime = Date.now();

  // Insert a "running" record immediately so we have an ID
  let executionId;
  try {
    const insert = await pool.query(
      `INSERT INTO ${SCHEMA}.sandbox_executions
         (agent_id, language, code, status, batch_id, batch_index)
       VALUES ($1, $2, $3, 'running', $4, $5)
       RETURNING id`,
      [agentId, language, code, batchId, batchIndex]
    );
    executionId = insert.rows[0].id;
  } catch (dbErr) {
    console.warn('[Sandbox] Failed to insert execution row:', dbErr.message);
    // Fall back to a local UUID so we can still return something
    executionId = randomUUID();
  }

  let stdout = '';
  let stderr = '';
  let exitCode = null;
  let finalStatus = 'completed';

  try {
    const { cmd, args } = buildCommand(language, code);
    const result = await runProcess(cmd, args, timeoutMs);
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
    finalStatus = result.timedOut ? 'timeout' : result.exitCode === 0 ? 'completed' : 'failed';
  } catch (spawnErr) {
    stderr = spawnErr.message || 'Spawn failed';
    finalStatus = 'failed';
    exitCode = -1;
  }

  const durationMs = Date.now() - startTime;

  // Update the DB record
  try {
    await pool.query(
      `UPDATE ${SCHEMA}.sandbox_executions
       SET stdout=$1, stderr=$2, exit_code=$3, status=$4, duration_ms=$5
       WHERE id=$6`,
      [stdout || null, stderr || null, exitCode, finalStatus, durationMs, executionId]
    );
  } catch (dbErr) {
    console.warn('[Sandbox] Failed to update execution row:', dbErr.message);
  }

  return {
    execution_id: executionId,
    id: executionId,
    agent_id: agentId,
    language,
    code,
    stdout: stdout || null,
    stderr: stderr || null,
    exit_code: exitCode,
    status: finalStatus,
    duration_ms: durationMs,
    batch_id: batchId,
    batch_index: batchIndex,
    created_at: new Date(startTime).toISOString(),
  };
}

/**
 * Spawn a child process and capture stdout + stderr with size limits.
 * Enforces a hard timeout by killing the process.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
function runProcess(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(cmd, args, {
      // No shell=true to avoid injection
      shell: false,
      // Limit environment variables passed to child for basic hygiene
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME || '/tmp',
        LANG: 'en_US.UTF-8',
      },
    });

    const timer = setTimeout(() => {
      timedOut = true;
      // Try graceful kill first, then force
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
      }, 2000);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (stdoutBuf.length < MAX_OUTPUT_BYTES) {
        stdoutBuf += chunk.toString('utf8');
        if (stdoutBuf.length > MAX_OUTPUT_BYTES) {
          stdoutBuf = stdoutBuf.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]';
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < MAX_OUTPUT_BYTES) {
        stderrBuf += chunk.toString('utf8');
        if (stderrBuf.length > MAX_OUTPUT_BYTES) {
          stderrBuf = stderrBuf.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]';
        }
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode: code ?? (timedOut ? 124 : -1),
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Run multiple scripts in sequence (batch mode).
 * If stopOnError is true, stops on the first non-zero exit code.
 *
 * @param {Array<{ language: string, code: string, timeout_ms?: number }>} scripts
 * @param {{ stopOnError?: boolean, agentId?: string|null }} opts
 * @returns {Promise<SandboxResult[]>}
 */
async function executeBatch(scripts, { stopOnError = true, agentId = null } = {}) {
  const batchId = randomUUID();
  const results = [];

  for (let i = 0; i < scripts.length; i++) {
    const { language, code, timeout_ms } = scripts[i];
    const timeoutMs = Math.min(
      Number.isFinite(timeout_ms) ? Number(timeout_ms) : DEFAULT_TIMEOUT_MS,
      60_000
    );

    const result = await executeInSandbox(language, code, agentId, timeoutMs, {
      batchId,
      batchIndex: i,
    });

    results.push(result);

    if (stopOnError && (result.status === 'failed' || result.status === 'timeout')) {
      // Mark remaining as skipped (no DB row — just return local objects)
      for (let j = i + 1; j < scripts.length; j++) {
        results.push({
          execution_id: null,
          id: null,
          agent_id: agentId,
          language: scripts[j].language,
          code: scripts[j].code,
          stdout: null,
          stderr: null,
          exit_code: null,
          status: 'skipped',
          duration_ms: 0,
          batch_id: batchId,
          batch_index: j,
          created_at: new Date().toISOString(),
        });
      }
      break;
    }
  }

  return results;
}

module.exports = { executeInSandbox, executeBatch };
