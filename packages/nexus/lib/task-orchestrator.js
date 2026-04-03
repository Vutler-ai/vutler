'use strict';

const logger = require('./logger');
const { UnknownError } = require('./errors');
const { getPermissionEngine } = require('./permission-engine');

const MAX_RESULT_BYTES    = 1 * 1024 * 1024; // 1 MB
const PROGRESS_INTERVAL_MS = 2_000;

// Actions that can take long enough to warrant progress updates
const LONG_RUNNING_ACTIONS = new Set(['search', 'read_document', 'shell_exec', 'terminal_exec']);

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
  async execute(task, options = {}) {
    const start = Date.now();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

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
      progressTimer = this._startProgressTicker(taskId, action, onProgress);
    }

    try {
      // Permission check — validate path before any provider call
      const targetPath = params.path || (action === 'terminal_open' ? params.cwd || null : null);
      if (targetPath) {
        getPermissionEngine().validate(targetPath, action);
      }
      this._emitProgress(taskId, action, {
        stage: 'accepted',
        message: `Action ${action} accepted by Nexus runtime`,
      }, onProgress);
      const data = await this._route(action, params, taskId, onProgress);
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

  async _route(action, params, taskId, onProgress) {
    const fs    = this.providers.fs;
    const shell = this.providers.shell;
    const terminal = this.providers.terminal;

    switch (action) {
      case 'search': {
        const { getSearchProvider } = require('./providers/search');
        const sp = getSearchProvider();
        return { results: await sp.search(params.query, { scope: params.scope, limit: params.limit }) };
      }

      case 'read_document': {
        this._require(params.path, 'params.path');
        const docs = require('./providers/documents');
        // Batch mode: process all supported docs in a folder
        if (params.batch && require('fs').statSync(params.path).isDirectory()) {
          return docs.batchRead(params.path, (p) => {
            this._emitProgress(taskId, action, {
              stage: 'reading',
              message: `Processing ${p.file} (${p.index + 1}/${p.total})`,
            }, onProgress);
          });
        }
        return docs.readDocument(params.path);
      }

      case 'open_file': {
        this._require(params.path, 'params.path');
        const { AppLauncher } = require('./providers/app-launcher');
        return new AppLauncher().open(params.path);
      }

      case 'list_dir':
      case 'list_directory':
        this._require(params.path, 'params.path');
        return { entries: fs.listDir(params.path, { recursive: params.recursive, pattern: params.pattern }) };

      case 'write_file':
        this._require(params.path,    'params.path');
        this._require(params.content, 'params.content');
        fs.writeFile(params.path, params.content);
        return { written: true, path: params.path };

      case 'shell_exec':
        this._require(params.command, 'params.command');
        return { output: shell.exec(params.command) };

      case 'terminal_open':
        if (!terminal) throw new Error('Terminal session provider is unavailable');
        this._require(params.cwd, 'params.cwd');
        return terminal.open({
          cwd: params.cwd,
          cols: params.cols,
          rows: params.rows,
          env: params.env,
          shell: params.shell,
        });

      case 'terminal_exec':
        if (!terminal) throw new Error('Terminal session provider is unavailable');
        this._require(params.sessionId, 'params.sessionId');
        return terminal.exec({
          sessionId: params.sessionId,
          input: params.input,
          waitMs: params.waitMs,
          appendNewline: params.appendNewline !== false,
        });

      case 'terminal_read':
        if (!terminal) throw new Error('Terminal session provider is unavailable');
        this._require(params.sessionId, 'params.sessionId');
        return terminal.read(params.sessionId, {
          cursor: params.cursor,
        });

      case 'terminal_snapshot':
        if (!terminal) throw new Error('Terminal session provider is unavailable');
        this._require(params.sessionId, 'params.sessionId');
        return terminal.snapshot(params.sessionId);

      case 'terminal_close':
        if (!terminal) throw new Error('Terminal session provider is unavailable');
        this._require(params.sessionId, 'params.sessionId');
        return terminal.close(params.sessionId);

      case 'read_clipboard': {
        const provider = this.providers.clipboard || new (require('./providers/clipboard').ClipboardProvider)();
        return { content: provider.read() };
      }

      case 'list_emails':
      case 'search_emails': {
        const mail = this.providers.mail || require('./providers/mail').getMailProvider();
        if (action === 'search_emails') {
          this._require(params.query, 'params.query');
          return { emails: await mail.searchEmails(params.query, params) };
        }
        return { emails: await mail.listEmails(params) };
      }

      case 'read_calendar': {
        const calendar = this.providers.calendar || new (require('./providers/calendar').CalendarProvider)();
        return { events: await calendar.readCalendar(params) };
      }

      case 'read_contacts':
      case 'search_contacts': {
        const cp = this.providers.contacts || new (require('./providers/contacts').ContactsProvider)();
        if (action === 'search_contacts') {
          this._require(params.query, 'params.query');
          return { contacts: await cp.searchContacts(params.query, params) };
        }
        return { contacts: await cp.readContacts(params) };
      }

      case 'execute_skill': {
        this._require(params.skill_key, 'params.skill_key');
        const { getLocalSkillExecutor } = require('./skill-executor');
        const executor = getLocalSkillExecutor(this.providers);
        return executor.execute(params.skill_key, params);
      }

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
  _startProgressTicker(taskId, action, onProgress) {
    let tick = 0;
    return setInterval(() => {
      tick++;
      this._emitProgress(taskId, action, {
        stage: 'running',
        message: `Processing... (${tick * PROGRESS_INTERVAL_MS / 1000}s elapsed)`,
        elapsedMs: tick * PROGRESS_INTERVAL_MS,
      }, onProgress);
    }, PROGRESS_INTERVAL_MS);
  }

  _emitProgress(taskId, action, progress, onProgress) {
    const payload = {
      taskId,
      action,
      ...progress,
      updatedAt: new Date().toISOString(),
    };

    if (this.wsClient?.isConnected) {
      this.wsClient.send('task.progress', payload);
    }

    if (onProgress) {
      try {
        onProgress(payload);
      } catch (_) {
        // Progress callbacks are best-effort only.
      }
    }
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
