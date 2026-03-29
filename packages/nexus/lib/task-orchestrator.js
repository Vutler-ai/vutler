'use strict';

const logger = require('./logger');
const { UnknownError } = require('./errors');

const MAX_RESULT_BYTES    = 1 * 1024 * 1024; // 1 MB
const PROGRESS_INTERVAL_MS = 2_000;

// Actions that can take long enough to warrant progress updates
const LONG_RUNNING_ACTIONS = new Set(['search', 'read_document', 'shell_exec']);

/**
 * TaskOrchestrator — validates incoming task messages and routes them to the
 * correct provider. Returns a structured result suitable for sending back to
 * the cloud via WebSocket.
 *
 * Usage:
 *   const orch = new TaskOrchestrator(nexusNode.providers, nexusNode.wsClient);
 *   const result = await orch.execute(task);
 *   nexusNode.wsClient.send('task.result', result);
 */
class TaskOrchestrator {
  /**
   * @param {object}    providers  — map of provider instances (fs, shell, env, …)
   * @param {WSClient}  wsClient   — for streaming progress updates
   */
  constructor(providers, wsClient) {
    this.providers = providers || {};
    this.wsClient  = wsClient  || null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute a task object received from the cloud.
   *
   * @param {object} task  — { taskId, action, params, agentId, timestamp }
   * @returns {Promise<{taskId, status, data, error?, metadata}>}
   */
  async execute(task) {
    const start = Date.now();

    // 1. Schema validation
    const validationError = this._validate(task);
    if (validationError) {
      return this._errorResult(task?.taskId, validationError, 0, task?.action);
    }

    const { taskId, action, params = {} } = task;
    logger.info(`[TaskOrchestrator] Executing action="${action}" taskId=${taskId}`);

    // 2. Start progress ticker for long-running actions
    let progressTimer = null;
    if (LONG_RUNNING_ACTIONS.has(action)) {
      progressTimer = this._startProgressTicker(taskId, action);
    }

    try {
      const data = await this._route(action, params, taskId);
      const durationMs = Date.now() - start;
      return this._successResult(taskId, data, durationMs, action);
    } catch (rawErr) {
      const err = rawErr.isNexus ? rawErr : new UnknownError(rawErr);
      const structured = logger.logError(err, { taskId, action });
      return this._errorResult(taskId, structured, Date.now() - start, action);
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
  }

  // ── Routing ─────────────────────────────────────────────────────────────────

  async _route(action, params, taskId) {
    const fs    = this.providers.fs;
    const shell = this.providers.shell;

    switch (action) {
      case 'search':
        // SearchProvider is coming in a future story — stub for now
        if (fs && typeof fs.search === 'function') {
          return fs.search(params);
        }
        return { results: [], note: 'SearchProvider not yet available — upgrade Nexus' };

      case 'read_document':
        this._require(params.path, 'params.path');
        return { content: fs.readFile(params.path) };

      case 'open_file': {
        this._require(params.path, 'params.path');
        const platform = process.platform;
        const cmd = platform === 'darwin'  ? `open "${params.path}"`
                  : platform === 'win32'   ? `start "" "${params.path}"`
                  : `xdg-open "${params.path}"`;
        shell.exec(cmd);
        return { opened: true, path: params.path };
      }

      case 'list_dir':
        this._require(params.path, 'params.path');
        return { entries: fs.listDir(params.path) };

      case 'write_file':
        this._require(params.path,    'params.path');
        this._require(params.content, 'params.content');
        fs.writeFile(params.path, params.content);
        return { written: true, path: params.path };

      case 'shell_exec':
        this._require(params.command, 'params.command');
        return { output: shell.exec(params.command) };

      default: {
        const { UnknownError: UE } = require('./errors');
        const err = new UE(new Error(`Unknown action: ${action}`));
        err.code = 'UNKNOWN_ACTION';
        throw err;
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Validate required task fields. Returns an error descriptor or null. */
  _validate(task) {
    if (!task || typeof task !== 'object') {
      return { code: 'INVALID_TASK', message: 'Task must be an object' };
    }
    const missing = ['taskId', 'action', 'agentId', 'timestamp'].filter(f => !task[f]);
    if (missing.length) {
      return { code: 'INVALID_TASK', message: `Missing required fields: ${missing.join(', ')}` };
    }
    return null;
  }

  /** Throw if a required param is missing. */
  _require(value, name) {
    if (value === undefined || value === null || value === '') {
      const { UnknownError: UE } = require('./errors');
      const err = new UE(new Error(`Missing required parameter: ${name}`));
      err.code = 'MISSING_PARAM';
      throw err;
    }
  }

  /** Send periodic progress events to the cloud during long operations. */
  _startProgressTicker(taskId, action) {
    let tick = 0;
    return setInterval(() => {
      tick++;
      if (this.wsClient?.isConnected) {
        this.wsClient.send('task.progress', {
          taskId,
          action,
          message: `Processing… (${tick * PROGRESS_INTERVAL_MS / 1000}s elapsed)`,
        });
      }
    }, PROGRESS_INTERVAL_MS);
  }

  _successResult(taskId, rawData, durationMs, action) {
    let data = rawData;
    let truncated = false;

    // Enforce 1 MB max payload
    const serialised = JSON.stringify(data);
    if (serialised.length > MAX_RESULT_BYTES) {
      truncated = true;
      // Return the raw string truncated if data is a plain string, otherwise summarise
      if (typeof data?.content === 'string') {
        data = { content: data.content.slice(0, MAX_RESULT_BYTES) };
      } else {
        data = { summary: serialised.slice(0, MAX_RESULT_BYTES) };
      }
      logger.warn(`[TaskOrchestrator] Result truncated to 1MB`, { taskId, action });
    }

    return {
      taskId,
      status:   'completed',
      data,
      metadata: { durationMs, action, truncated },
    };
  }

  _errorResult(taskId, error, durationMs, action) {
    return {
      taskId:   taskId || null,
      status:   'error',
      data:     null,
      error,
      metadata: { durationMs, action },
    };
  }
}

module.exports = { TaskOrchestrator };
