const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const crypto = require('node:crypto');

// Whitelist of binaries allowed in cron tasks — no destructive or privilege-escalation tools
const ALLOWED_CRON_BINARIES = new Set([
  'curl', 'wget',
  'node', 'python', 'python3', 'ruby', 'php',
  'bash', 'sh',
  'echo', 'printf', 'cat', 'ls', 'pwd', 'date', 'env',
  'grep', 'awk', 'sed', 'sort', 'uniq', 'wc', 'head', 'tail', 'cut',
  'jq', 'yq',
  'ping', 'nslookup', 'dig',
  'git',
  'npm', 'npx', 'pnpm', 'yarn',
]);

// Characters that indicate shell injection attempts
const DANGEROUS_ARG_RE = /[;|&`$<>(){}[\]\\]/;

// Max allowed command string length
const MAX_COMMAND_LENGTH = 1024;

// Disk space thresholds (bytes)
const DISK_WARN_BYTES  = 500 * 1024 * 1024; // 500 MB
const DISK_ABORT_BYTES = 100 * 1024 * 1024; // 100 MB

// Retry / DLQ config
const MAX_ATTEMPTS     = 5;
const BACKOFF_BASE_MS  = 1000; // 1s, 2s, 4s, 8s, 16s

// Encryption constants
const IV_LENGTH        = 16; // AES block size (bytes)
const AUTH_TAG_LENGTH  = 16; // GCM auth tag (bytes)
const KEY_LENGTH       = 32; // AES-256 → 32 bytes
const PBKDF2_ITER      = 100_000;
const PBKDF2_DIGEST    = 'sha512';
const SALT_FILE        = '.salt';
const SALT_LENGTH      = 32;

/**
 * Returns available disk space (bytes) for the given path.
 * Uses `df -k` output; falls back to Infinity on parse error so we don't
 * block the queue in environments where df is unavailable.
 */
function getFreeDiskBytes(targetPath) {
  try {
    const output = execFileSync('df', ['-k', targetPath], { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    // df -k: columns are Filesystem 1K-blocks Used Available ...
    const parts = lines[lines.length - 1].split(/\s+/);
    const availableKb = parseInt(parts[3], 10);
    if (isNaN(availableKb)) return Infinity;
    return availableKb * 1024;
  } catch (_) {
    return Infinity;
  }
}

/**
 * Parse a raw command string into { binary, args }.
 * Throws if the binary is not in the whitelist, the command exceeds the max
 * length, or any argument contains a dangerous character sequence.
 *
 * @param {string} command — raw command string from config
 * @returns {{ binary: string, args: string[] }}
 */
function parseSafeCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('Cron command must be a non-empty string');
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(`Cron command exceeds max length (${command.length} > ${MAX_COMMAND_LENGTH})`);
  }

  // Naive but sufficient split: honour single/double quoted spans
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  if (tokens.length === 0) throw new Error('Cron command is empty after parsing');

  const binary = path.basename(tokens[0]); // strip any path prefix for the check
  if (!ALLOWED_CRON_BINARIES.has(binary)) {
    throw new Error(`Cron binary not whitelisted: "${binary}"`);
  }

  // Use the raw first token as the executable (could be an absolute path like /usr/bin/curl)
  const executable = tokens[0];
  const args = tokens.slice(1);

  for (const arg of args) {
    if (DANGEROUS_ARG_RE.test(arg)) {
      throw new Error(`Dangerous character in cron argument: "${arg}"`);
    }
  }

  return { executable, args };
}

class OfflineMonitor {
  constructor(node, opts = {}) {
    this.node = node;
    this.thresholdMs = (opts.disconnect_threshold_seconds || 300) * 1000; // 5 min default
    this.queuePath = opts.queue_path || path.join(os.homedir(), '.vutler', 'offline-queue');
    this.dlqPath   = opts.dlq_path   || path.join(os.homedir(), '.vutler', 'queue', 'dlq');
    this.lastCloudContact = Date.now();
    this.isOffline = false;
    this.checkInterval = null;

    // API key used for AES-256-GCM key derivation.
    // Priority: explicit opts.apiKey → node.apiKey → node.config.apiKey
    this._apiKey = opts.apiKey
      || (node && node.apiKey)
      || (node && node.config && node.config.apiKey)
      || null;

    // Derived key cache — populated lazily on first use
    this._encKey = null;

    // Ensure queue, DLQ, and corrupted directories exist
    fs.mkdirSync(this.queuePath, { recursive: true });
    fs.mkdirSync(this.dlqPath,   { recursive: true });
    fs.mkdirSync(path.join(this.queuePath, 'corrupted'), { recursive: true });
  }

  // ─── Encryption helpers ──────────────────────────────────────────────────

  /**
   * Returns the per-node salt stored at <queuePath>/.salt.
   * Creates a fresh random 32-byte salt on first call and persists it.
   * @returns {Buffer}
   */
  _getSalt() {
    const saltFile = path.join(this.queuePath, SALT_FILE);
    if (fs.existsSync(saltFile)) return fs.readFileSync(saltFile);
    const salt = crypto.randomBytes(SALT_LENGTH);
    fs.writeFileSync(saltFile, salt);
    return salt;
  }

  /**
   * Derives (and caches) an AES-256 key from the configured API key + node salt
   * using PBKDF2-SHA-512.
   * Returns null when no API key is available — callers fall back to plain JSON.
   * @returns {Buffer|null}
   */
  _deriveKey() {
    if (this._encKey) return this._encKey;
    if (!this._apiKey) return null;
    const salt = this._getSalt();
    this._encKey = crypto.pbkdf2Sync(this._apiKey, salt, PBKDF2_ITER, KEY_LENGTH, PBKDF2_DIGEST);
    return this._encKey;
  }

  /**
   * Encrypts a JSON-serialisable object with AES-256-GCM.
   * Output layout: IV (16 B) || authTag (16 B) || ciphertext
   * @param {object} obj
   * @returns {Buffer}
   */
  _encrypt(obj) {
    const key = this._deriveKey();
    if (!key) throw new Error('[Offline] Cannot encrypt: no API key configured');
    const plaintext = JSON.stringify(obj);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypts a Buffer produced by _encrypt.
   * Throws on authentication failure (wrong key / tampering) or JSON parse error.
   * @param {Buffer} buf
   * @returns {object}
   */
  _decrypt(buf) {
    const key = this._deriveKey();
    if (!key) throw new Error('[Offline] Cannot decrypt: no API key configured');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('[Offline] Encrypted file too short — possibly corrupted');
    }
    const iv         = buf.subarray(0, IV_LENGTH);
    const authTag    = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  }

  start() {
    this.checkInterval = setInterval(() => this._check(), 30000); // check every 30s
    this.node.log('[Offline] Monitor started (threshold: ' + (this.thresholdMs/1000) + 's)');
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.cronTimers) this.cronTimers.forEach(t => clearInterval(t));
  }

  onCloudContact() {
    this.lastCloudContact = Date.now();
    if (this.isOffline) {
      this.isOffline = false;
      this.node.log('[Offline] Cloud connection restored — syncing queue');
      this._syncQueue();
    }
  }

  _check() {
    if (Date.now() - this.lastCloudContact > this.thresholdMs && !this.isOffline) {
      this.isOffline = true;
      this.node.log('[Offline] Cloud unreachable for ' + (this.thresholdMs/1000) + 's — entering offline mode');
      this._startCronTasks();
    }
  }

  // Queue a task result for later sync
  async enqueue(taskId, action, payload) {
    // Check available disk space before writing
    const freeDisk = getFreeDiskBytes(this.queuePath);
    if (freeDisk < DISK_ABORT_BYTES) {
      this.node.log(JSON.stringify({
        level: 'error', ts: new Date().toISOString(),
        msg: '[Offline] Enqueue aborted — disk space critically low',
        freeMB: Math.round(freeDisk / 1024 / 1024),
        taskId, action,
      }));
      throw new Error('Insufficient disk space to enqueue task (< 100 MB free)');
    }
    if (freeDisk < DISK_WARN_BYTES) {
      this.node.log(JSON.stringify({
        level: 'warn', ts: new Date().toISOString(),
        msg: '[Offline] Disk space low — queue write proceeding but monitor storage',
        freeMB: Math.round(freeDisk / 1024 / 1024),
        taskId, action,
      }));
    }

    const item = { taskId, action, payload, created_at: new Date().toISOString() };
    const key = this._deriveKey();

    if (key) {
      // Encrypted path — write binary .enc file
      const encBuf   = this._encrypt(item);
      const filename  = Date.now() + '-' + taskId.slice(0, 8) + '.enc';
      fs.writeFileSync(path.join(this.queuePath, filename), encBuf);
      this.node.log('[Offline] Queued (encrypted): ' + action + ' for task ' + taskId);
    } else {
      // No API key configured — fall back to plain JSON (graceful degradation)
      this.node.log(JSON.stringify({
        level: 'warn', ts: new Date().toISOString(),
        msg: '[Offline] No API key — queuing without encryption',
        taskId, action,
      }));
      const filename = Date.now() + '-' + taskId.slice(0, 8) + '.json';
      fs.writeFileSync(path.join(this.queuePath, filename), JSON.stringify(item));
      this.node.log('[Offline] Queued: ' + action + ' for task ' + taskId);
    }
  }

  // ---------------------------------------------------------------------------
  // Meta helpers — track attempt counts alongside queue files
  // ---------------------------------------------------------------------------

  _metaPath(queueFile) {
    // Strip .enc or .json extension, then append .meta.json
    return path.join(this.queuePath, queueFile.replace(/\.(enc|json)$/, '.meta.json'));
  }

  _readMeta(queueFile) {
    try {
      return JSON.parse(fs.readFileSync(this._metaPath(queueFile), 'utf8'));
    } catch (_) {
      return { attempts: 0, lastAttempt: null, lastError: null };
    }
  }

  _writeMeta(queueFile, meta) {
    fs.writeFileSync(this._metaPath(queueFile), JSON.stringify(meta));
  }

  _deleteMeta(queueFile) {
    try { fs.unlinkSync(this._metaPath(queueFile)); } catch (_) { /* no-op */ }
  }

  // ---------------------------------------------------------------------------
  // Sync queue with exponential backoff + DLQ on MAX_ATTEMPTS
  // Returns { synced, failed, skipped, movedToDLQ }
  // ---------------------------------------------------------------------------

  async _syncQueue() {
    // Collect encrypted (.enc) and legacy plain-text (.json) files, sorted chronologically.
    // Exclude the 'corrupted' subdirectory — only immediate children of queuePath.
    const files = fs.readdirSync(this.queuePath)
      .filter(f => f.endsWith('.enc') || f.endsWith('.json'))
      .sort();

    if (files.length === 0) return { synced: 0, failed: 0, skipped: 0, movedToDLQ: 0 };

    this.node.log(JSON.stringify({
      level: 'info', ts: new Date().toISOString(),
      msg: '[Offline] Sync started', pendingFiles: files.length,
    }));

    const metrics = { synced: 0, failed: 0, skipped: 0, movedToDLQ: 0 };

    for (const file of files) {
      const filePath = path.join(this.queuePath, file);

      // Sanity check — file may have been removed mid-loop (e.g. retryDLQ race)
      if (!fs.existsSync(filePath)) { metrics.skipped++; continue; }

      const meta = this._readMeta(file);

      // Check if we need to back off before retrying this file
      if (meta.attempts > 0 && meta.lastAttempt) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, meta.attempts - 1);
        const elapsed   = Date.now() - new Date(meta.lastAttempt).getTime();
        if (elapsed < backoffMs) {
          this.node.log(JSON.stringify({
            level: 'debug', ts: new Date().toISOString(),
            msg: '[Offline] Skipping file — still in backoff window',
            file, attempts: meta.attempts,
            backoffMs, elapsedMs: elapsed,
          }));
          metrics.skipped++;
          continue;
        }
      }

      // ── Read & decode the queue item ──────────────────────────────────────
      let item;
      let activeFilePath = filePath; // may change during legacy migration

      try {
        if (file.endsWith('.enc')) {
          // Encrypted file — decrypt
          const buf = fs.readFileSync(filePath);
          item = this._decrypt(buf);
        } else {
          // Legacy plain-text JSON — parse, then migrate to .enc if a key is available
          item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const key = this._deriveKey();
          if (key) {
            const encBuf     = this._encrypt(item);
            const encFile    = file.replace(/\.json$/, '.enc');
            const encPath    = path.join(this.queuePath, encFile);
            fs.writeFileSync(encPath, encBuf);
            // Copy meta to the new filename so backoff state is preserved
            try {
              const metaData = fs.readFileSync(this._metaPath(file));
              fs.writeFileSync(this._metaPath(encFile), metaData);
            } catch (_) { /* no existing meta — that's fine */ }
            fs.unlinkSync(filePath);
            this._deleteMeta(file);
            this.node.log('[Offline] Migrated to encrypted: ' + file + ' → ' + encFile);
            activeFilePath = encPath; // point delete logic at the new .enc file
          }
        }
      } catch (e) {
        // Decryption / parse failure — quarantine and continue
        this.node.log(JSON.stringify({
          level: 'error', ts: new Date().toISOString(),
          msg: '[Offline] Cannot read queue file — moving to corrupted/',
          file, reason: e.message,
        }));
        const corruptedPath = path.join(this.queuePath, 'corrupted', file);
        try {
          fs.renameSync(filePath, corruptedPath);
          this._deleteMeta(file);
        } catch (mvErr) {
          this.node.log('[Offline] Could not quarantine ' + file + ': ' + mvErr.message);
        }
        metrics.skipped++;
        continue;
      }

      // ── Attempt API sync ──────────────────────────────────────────────────
      try {
        await this.node._apiCall('POST', '/api/v1/nexus/' + this.node.nodeId + '/sync', { items: [item] });

        // Success — clean up task file and its meta
        if (fs.existsSync(activeFilePath)) fs.unlinkSync(activeFilePath);
        // Meta file is keyed on original file name — derive the active base name
        const activeFile = path.basename(activeFilePath);
        this._deleteMeta(activeFile);
        metrics.synced++;

        this.node.log(JSON.stringify({
          level: 'info', ts: new Date().toISOString(),
          msg: '[Offline] Synced task', file: activeFile, taskId: item.taskId,
        }));

      } catch (e) {
        const activeFile  = path.basename(activeFilePath);
        const activeMeta  = this._readMeta(activeFile);
        const newAttempts = activeMeta.attempts + 1;
        const updatedMeta = {
          attempts: newAttempts,
          lastAttempt: new Date().toISOString(),
          lastError: e.message,
        };

        if (newAttempts >= MAX_ATTEMPTS) {
          // Move to DLQ
          const dlqFile = path.join(this.dlqPath, activeFile);
          try {
            fs.renameSync(activeFilePath, dlqFile);
            this._deleteMeta(activeFile);
            // Write a DLQ meta alongside the dead file
            fs.writeFileSync(
              dlqFile.replace(/\.(enc|json)$/, '.meta.json'),
              JSON.stringify({ ...updatedMeta, movedToDLQ: new Date().toISOString() }),
            );
          } catch (mvErr) {
            this.node.log(JSON.stringify({
              level: 'error', ts: new Date().toISOString(),
              msg: '[Offline] Failed to move task to DLQ', file: activeFile, error: mvErr.message,
            }));
          }

          this.node.log(JSON.stringify({
            level: 'error', ts: new Date().toISOString(),
            msg: '[Offline] Task moved to DLQ — max retries exceeded',
            file: activeFile, taskId: item.taskId,
            attempts: newAttempts,
            lastError: e.message,
          }));
          metrics.movedToDLQ++;

        } else {
          // Update meta and leave file in queue for next cycle
          this._writeMeta(activeFile, updatedMeta);
          const nextBackoffMs = BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1);

          this.node.log(JSON.stringify({
            level: 'warn', ts: new Date().toISOString(),
            msg: '[Offline] Sync failed — will retry',
            file: activeFile, attempts: newAttempts, maxAttempts: MAX_ATTEMPTS,
            nextBackoffMs, error: e.message,
          }));
          metrics.failed++;
        }

        // Continue to the next file — do NOT break
      }
    }

    this.node.log(JSON.stringify({
      level: 'info', ts: new Date().toISOString(),
      msg: '[Offline] Sync complete', ...metrics,
    }));

    return metrics;
  }

  // ---------------------------------------------------------------------------
  // Dead Letter Queue helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns a summary of the current DLQ state.
   * @returns {{ count: number, oldestTask: string|null, newestTask: string|null }}
   */
  getDLQStatus() {
    const files = fs.existsSync(this.dlqPath)
      ? fs.readdirSync(this.dlqPath).filter(f => f.endsWith('.enc') || f.endsWith('.json')).sort()
      : [];

    return {
      count:      files.length,
      oldestTask: files.length > 0 ? files[0]      : null,
      newestTask: files.length > 0 ? files[files.length - 1] : null,
    };
  }

  /**
   * Move one or all DLQ files back into the main queue for another sync attempt.
   * Resets the attempt counter so the backoff starts fresh.
   *
   * @param {string} [taskId] - Optional. Filename (or taskId prefix) to retry.
   *                            If omitted, all DLQ files are moved back.
   * @returns {{ requeued: number, notFound: boolean }}
   */
  retryDLQ(taskId) {
    if (!fs.existsSync(this.dlqPath)) {
      return { requeued: 0, notFound: false };
    }

    const dlqFiles = fs.readdirSync(this.dlqPath).filter(f => f.endsWith('.enc') || f.endsWith('.json'));

    // Filter to a specific file when taskId is provided
    const targets = taskId
      ? dlqFiles.filter(f => f.includes(taskId))
      : dlqFiles;

    if (taskId && targets.length === 0) {
      return { requeued: 0, notFound: true };
    }

    let requeued = 0;
    for (const file of targets) {
      const src  = path.join(this.dlqPath, file);
      const dest = path.join(this.queuePath, file);
      const srcMeta  = path.join(this.dlqPath, file.replace(/\.(enc|json)$/, '.meta.json'));
      const destMeta = this._metaPath(file);

      try {
        fs.renameSync(src, dest);

        // Reset attempt counter so backoff starts fresh
        fs.writeFileSync(destMeta, JSON.stringify({
          attempts: 0, lastAttempt: null, lastError: null,
        }));
        // Remove DLQ meta if it exists
        try { fs.unlinkSync(srcMeta); } catch (_) { /* no-op */ }

        this.node.log(JSON.stringify({
          level: 'info', ts: new Date().toISOString(),
          msg: '[Offline] DLQ task requeued', file,
        }));
        requeued++;
      } catch (e) {
        this.node.log(JSON.stringify({
          level: 'error', ts: new Date().toISOString(),
          msg: '[Offline] Failed to requeue DLQ task', file, error: e.message,
        }));
      }
    }

    return { requeued, notFound: false };
  }

  _startCronTasks() {
    const config = this.node.offlineConfig || {};
    const tasks = config.cron_tasks || [];
    if (tasks.length === 0) return;

    this.node.log('[Offline] Starting ' + tasks.length + ' cron tasks');

    // Pre-validate all tasks before scheduling any — fail fast on bad config
    const validatedTasks = [];
    for (const task of tasks) {
      try {
        const { executable, args } = parseSafeCommand(task.command);
        validatedTasks.push({ task, executable, args });
      } catch (e) {
        this.node.log(JSON.stringify({
          level: 'error', ts: new Date().toISOString(),
          msg: '[Offline] Cron task rejected — unsafe command',
          command: task.command,
          reason: e.message,
          taskId: task.id || null,
        }));
        // Skip the offending task; do not schedule it
      }
    }

    // Simple interval-based execution (not full cron syntax)
    this.cronTimers = validatedTasks.map(({ task, executable, args }) => {
      const intervalMs = (task.interval_seconds || 300) * 1000;
      return setInterval(async () => {
        const taskId = task.id || 'cron-' + Date.now();
        const startedAt = new Date().toISOString();
        try {
          // execFileSync — no shell interpolation, arguments passed as separate tokens
          const rawOutput = execFileSync(executable, args, {
            timeout: 30000,       // 30 s hard cap per task
            maxBuffer: 512 * 1024, // 512 KB output cap
            encoding: 'utf8',
          });
          const output = String(rawOutput || '').slice(0, 4096); // cap stored output

          this.node.log(JSON.stringify({
            level: 'info', ts: new Date().toISOString(),
            msg: '[Offline] Cron executed',
            taskId, executable,
            args: args.join(' '),
            outputBytes: rawOutput.length,
            startedAt,
          }));

          await this.enqueue(taskId, 'complete', { output });
        } catch (e) {
          this.node.log(JSON.stringify({
            level: 'error', ts: new Date().toISOString(),
            msg: '[Offline] Cron failed',
            taskId, executable,
            args: args.join(' '),
            error: e.message,
            startedAt,
          }));
        }
      }, intervalMs);
    });
  }

  getStatus() {
    const queueFiles = fs.existsSync(this.queuePath)
      ? fs.readdirSync(this.queuePath).filter(f => f.endsWith('.enc') || f.endsWith('.json')).length
      : 0;
    return {
      isOffline: this.isOffline,
      queueDepth: queueFiles,
      lastCloudContact: this.lastCloudContact,
      dlq: this.getDLQStatus(),
    };
  }
}

module.exports = { OfflineMonitor };
