'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const VUTLER_DIR      = path.join(os.homedir(), '.vutler');
const PERMISSIONS_FILE = path.join(VUTLER_DIR, 'permissions.json');
const ACCESS_LOG       = path.join(VUTLER_DIR, 'logs', 'access.jsonl');

const { PermissionDeniedError } = require('./errors');
const logger = require('./logger');

/**
 * PermissionEngine — opt-in folder ACL system.
 *
 * permissions.json shape:
 * {
 *   "allowedFolders": ["/Users/alice/Documents", "/Users/alice/Desktop"],
 *   "allowedActions": ["read_document", "list_dir", "search", "open_file"]
 * }
 *
 * Usage:
 *   const engine = new PermissionEngine();
 *   engine.validate('/Users/alice/Documents/report.pdf', 'read_document'); // throws if denied
 *   engine.grant('/Users/alice/Downloads');
 *   engine.revoke('/Users/alice/Downloads');
 */
class PermissionEngine {
  constructor() {
    this._cache = null;       // in-memory cache, invalidated on write
    this._ensureDirs();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Validate that `targetPath` is under an allowed folder and `action` is permitted.
   * Logs the attempt (granted or denied) to access.jsonl.
   * Throws PermissionDeniedError if access is not allowed.
   *
   * @param {string} targetPath  — absolute path being accessed
   * @param {string} action      — e.g. "read_document", "shell_exec"
   */
  validate(targetPath, action) {
    const perms = this._load();
    const resolved = path.resolve(targetPath);

    const folderGranted = perms.allowedFolders.some(
      (folder) => resolved.startsWith(path.resolve(folder) + path.sep) ||
                  resolved === path.resolve(folder)
    );
    const actionGranted = !perms.allowedActions.length ||
                          perms.allowedActions.includes(action);

    const granted = folderGranted && actionGranted;

    this._logAccess({ path: resolved, action, granted });

    if (!granted) {
      const reason = !folderGranted
        ? `Folder not authorized: ${resolved}`
        : `Action not authorized: ${action}`;
      throw new PermissionDeniedError(reason, { path: resolved, action });
    }
  }

  /**
   * Grant access to a folder (adds to allowedFolders, persists to disk).
   * @param {string} folderPath
   */
  grant(folderPath) {
    const perms = this._load();
    const resolved = path.resolve(folderPath);
    if (!perms.allowedFolders.includes(resolved)) {
      perms.allowedFolders.push(resolved);
      this._save(perms);
      logger.info(`[PermissionEngine] Granted: ${resolved}`);
    }
  }

  /**
   * Revoke access to a folder (removes from allowedFolders, persists to disk).
   * @param {string} folderPath
   */
  revoke(folderPath) {
    const perms = this._load();
    const resolved = path.resolve(folderPath);
    const before = perms.allowedFolders.length;
    perms.allowedFolders = perms.allowedFolders.filter((f) => f !== resolved);
    if (perms.allowedFolders.length !== before) {
      this._save(perms);
      logger.info(`[PermissionEngine] Revoked: ${resolved}`);
    }
  }

  /**
   * Return a snapshot of current permissions (for dashboard display).
   * @returns {{ allowedFolders: string[], allowedActions: string[] }}
   */
  getPermissions() {
    return this._load();
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _load() {
    if (this._cache) return this._cache;
    try {
      const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
      this._cache = JSON.parse(raw);
    } catch (_) {
      // File missing or malformed — start with empty ACLs (deny all)
      this._cache = { allowedFolders: [], allowedActions: [] };
    }
    return this._cache;
  }

  _save(perms) {
    this._cache = perms;
    // NEVER sync to cloud — write only to local disk
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(perms, null, 2), 'utf8');
  }

  _logAccess({ path: filePath, action, granted }) {
    const entry = JSON.stringify({
      ts:      new Date().toISOString(),
      path:    filePath,
      action,
      granted,
    });
    try {
      fs.appendFileSync(ACCESS_LOG, entry + '\n');
    } catch (_) {
      // Best-effort — don't crash Nexus over a log write
    }
  }

  _ensureDirs() {
    try {
      fs.mkdirSync(path.join(VUTLER_DIR, 'logs'), { recursive: true });
      // Create permissions.json with empty ACLs if it doesn't exist
      if (!fs.existsSync(PERMISSIONS_FILE)) {
        fs.writeFileSync(
          PERMISSIONS_FILE,
          JSON.stringify({ allowedFolders: [], allowedActions: [] }, null, 2)
        );
      }
    } catch (_) {
      // Non-fatal — will fail gracefully on first validate()
    }
  }
}

// Singleton — one engine per Nexus process
let _instance = null;
function getPermissionEngine() {
  if (!_instance) _instance = new PermissionEngine();
  return _instance;
}

module.exports = { PermissionEngine, getPermissionEngine, PERMISSIONS_FILE, ACCESS_LOG };
