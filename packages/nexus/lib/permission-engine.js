'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const VUTLER_DIR      = path.join(os.homedir(), '.vutler');
const PERMISSIONS_FILE = path.join(VUTLER_DIR, 'permissions.json');
const ACCESS_LOG       = path.join(VUTLER_DIR, 'logs', 'access.jsonl');

const { PermissionDeniedError } = require('./errors');
const logger = require('./logger');

const CONSENT_SOURCE_TEMPLATES = {
  filesystem: {
    apps: ['finder', 'preview', 'synced_drives'],
    actions: ['search', 'read_document', 'list_dir', 'open_file'],
  },
  mail: {
    apps: ['apple_mail', 'outlook'],
    actions: ['list_emails', 'search_emails'],
  },
  calendar: {
    apps: ['apple_calendar', 'outlook_calendar'],
    actions: ['read_calendar'],
  },
  contacts: {
    apps: ['apple_contacts', 'outlook_contacts'],
    actions: ['read_contacts', 'search_contacts'],
  },
  clipboard: {
    apps: ['system_clipboard'],
    actions: ['read_clipboard'],
  },
  shell: {
    apps: ['terminal'],
    actions: ['shell_exec', 'terminal_open', 'terminal_exec', 'terminal_read', 'terminal_snapshot', 'terminal_close'],
  },
};

function normalizeStringArray(values, allowed) {
  if (!Array.isArray(values)) return [];
  const next = values
    .filter(Boolean)
    .map((value) => String(value));
  if (!Array.isArray(allowed)) return Array.from(new Set(next));
  const allowedSet = new Set(allowed);
  return Array.from(new Set(next.filter((value) => allowedSet.has(value))));
}

function normalizeFolderArray(folders) {
  if (!Array.isArray(folders)) return [];
  return Array.from(new Set(
    folders
      .filter(Boolean)
      .map((folder) => path.resolve(String(folder)))
  ));
}

function normalizeConsentSource(sourceKey, rawSource = {}, legacyPermissions = {}) {
  const template = CONSENT_SOURCE_TEMPLATES[sourceKey] || { apps: [], actions: [] };
  const legacyEnabled = typeof legacyPermissions[sourceKey] === 'boolean'
    ? legacyPermissions[sourceKey]
    : undefined;
  const legacyFolders = sourceKey === 'filesystem'
    ? normalizeFolderArray(legacyPermissions.allowedFolders)
    : [];
  const rawFolders = sourceKey === 'filesystem'
    ? normalizeFolderArray(rawSource.allowedFolders)
    : [];
  const apps = normalizeStringArray(rawSource.apps, template.apps);
  const actions = normalizeStringArray(rawSource.actions, template.actions);
  const allowedFolders = sourceKey === 'filesystem'
    ? (rawFolders.length ? rawFolders : legacyFolders)
    : [];
  const enabled = typeof rawSource.enabled === 'boolean'
    ? rawSource.enabled
    : legacyEnabled !== undefined
      ? legacyEnabled
      : Boolean(apps.length || actions.length || allowedFolders.length);

  return {
    enabled,
    apps: enabled ? (apps.length ? apps : template.apps.slice()) : [],
    actions: enabled ? (actions.length ? actions : template.actions.slice()) : [],
    ...(sourceKey === 'filesystem' ? { allowedFolders } : {}),
  };
}

function normalizeConsentModel(rawConsent = {}, legacyPermissions = {}) {
  const sourceRoot = rawConsent && typeof rawConsent === 'object' && rawConsent.sources
    ? rawConsent.sources
    : rawConsent;
  const sources = {};

  for (const sourceKey of Object.keys(CONSENT_SOURCE_TEMPLATES)) {
    sources[sourceKey] = normalizeConsentSource(
      sourceKey,
      sourceRoot?.[sourceKey] || {},
      legacyPermissions
    );
  }

  return { sources };
}

function deriveAllowedActionsFromConsent(consent) {
  const actions = [];
  for (const source of Object.values(consent?.sources || {})) {
    if (!source?.enabled) continue;
    actions.push(...normalizeStringArray(source.actions));
  }
  return Array.from(new Set(actions));
}

function normalizePermissions(input = {}) {
  const consent = normalizeConsentModel(input.consent || {}, input);
  const filesystemFolders = consent.sources.filesystem?.allowedFolders || [];
  const allowedFolders = normalizeFolderArray(
    input.allowedFolders && input.allowedFolders.length
      ? input.allowedFolders
      : filesystemFolders
  );
  consent.sources.filesystem.allowedFolders = allowedFolders;

  const derivedActions = deriveAllowedActionsFromConsent(consent);
  const allowedActions = normalizeStringArray(
    input.allowedActions && input.allowedActions.length
      ? input.allowedActions
      : derivedActions
  );

  return {
    allowedFolders,
    allowedActions,
    consent,
  };
}

/**
 * PermissionEngine — opt-in folder ACL system.
 *
 * permissions.json shape:
 * {
 *   "allowedFolders": ["/Users/alice/Documents", "/Users/alice/Desktop"],
 *   "allowedActions": ["read_document", "list_dir", "search", "open_file"],
 *   "consent": {
 *     "sources": {
 *       "filesystem": {
 *         "enabled": true,
 *         "apps": ["finder", "synced_drives"],
 *         "actions": ["search", "read_document"],
 *         "allowedFolders": ["/Users/alice/Documents"]
 *       }
 *     }
 *   }
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
    const perms = normalizePermissions(this._load());
    const resolved = path.resolve(folderPath);
    if (!perms.allowedFolders.includes(resolved)) {
      perms.allowedFolders.push(resolved);
      perms.consent.sources.filesystem.enabled = true;
      perms.consent.sources.filesystem.allowedFolders = perms.allowedFolders.slice();
      this._save(perms);
      logger.info(`[PermissionEngine] Granted: ${resolved}`);
    }
  }

  /**
   * Revoke access to a folder (removes from allowedFolders, persists to disk).
   * @param {string} folderPath
   */
  revoke(folderPath) {
    const perms = normalizePermissions(this._load());
    const resolved = path.resolve(folderPath);
    const before = perms.allowedFolders.length;
    perms.allowedFolders = perms.allowedFolders.filter((f) => f !== resolved);
    if (perms.allowedFolders.length !== before) {
      perms.consent.sources.filesystem.allowedFolders = perms.allowedFolders.slice();
      this._save(perms);
      logger.info(`[PermissionEngine] Revoked: ${resolved}`);
    }
  }

  /**
   * Return a snapshot of current permissions (for dashboard display).
   * @returns {{ allowedFolders: string[], allowedActions: string[] }}
   */
  getPermissions() {
    return normalizePermissions(this._load());
  }

  /**
   * Replace the local ACL snapshot with the permissions received from setup.
   * Unknown fields are ignored so token/runtime config can contain other flags.
   *
   * @param {{ allowedFolders?: string[], allowedActions?: string[] }} permissions
   */
  replace(permissions = {}) {
    const next = normalizePermissions(permissions);
    this._save(next);
    logger.info('[PermissionEngine] Permissions replaced from runtime config');
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _load() {
    if (this._cache) return this._cache;
    try {
      const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
      this._cache = normalizePermissions(JSON.parse(raw));
    } catch (_) {
      // File missing or malformed — start with empty ACLs (deny all)
      this._cache = normalizePermissions({ allowedFolders: [], allowedActions: [] });
    }
    return this._cache;
  }

  _save(perms) {
    this._cache = normalizePermissions(perms);
    // NEVER sync to cloud — write only to local disk
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(this._cache, null, 2), 'utf8');
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
          JSON.stringify(normalizePermissions({ allowedFolders: [], allowedActions: [] }), null, 2)
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
