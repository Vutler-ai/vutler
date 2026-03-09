/**
 * Core permissions bootstrap for Vutler modules.
 * MongoDB refs removed - using in-memory defaults
 */

const DEFAULT_CORE_PERMISSIONS = Object.freeze({
  drive: Object.freeze({
    list: true,
    upload: true,
    createFolder: true,
    download: true
  }),
  calendar: Object.freeze({
    read: true,
    create: true,
    edit: true
  }),
  tasks: Object.freeze({
    read: true,
    create: true,
    edit: true
  }),
  chat: Object.freeze({
    jarvisDm: Object.freeze({
      bootstrap: true,
      send: true,
      read: true
    })
  })
});

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMergeDefaults(target, defaults) {
  let changed = false;
  const out = Array.isArray(target) ? [...target] : { ...(target || {}) };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
      const nested = out[key] && typeof out[key] === 'object' ? out[key] : {};
      const { value, changed: nestedChanged } = deepMergeDefaults(nested, defaultValue);
      if (!out[key] || nestedChanged) {
        out[key] = value;
        changed = true;
      }
      continue;
    }

    if (typeof out[key] !== 'boolean') {
      out[key] = defaultValue;
      changed = true;
    }
  }

  return { value: out, changed };
}

function ensureCorePermissionsDocument(userDoc = {}) {
  const existing = userDoc.permissions?.core || {};
  const merged = deepMergeDefaults(existing, DEFAULT_CORE_PERMISSIONS);

  const roles = Array.isArray(userDoc.roles) ? [...userDoc.roles] : [];
  let rolesChanged = false;
  if (!roles.includes('core-user')) {
    roles.push('core-user');
    rolesChanged = true;
  }

  return {
    changed: merged.changed || rolesChanged,
    permissions: {
      ...(userDoc.permissions || {}),
      core: merged.value
    },
    roles
  };
}

function hasCorePermission(agent, path) {
  if (!path) return true;
  if (agent?.roles?.includes('admin')) return true;

  const parts = path.split('.');
  let cursor = agent?.permissions?.core;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return false;
    cursor = cursor[part];
  }

  return cursor === true;
}

function requireCorePermission(path) {
  return (req, res, next) => {
    if (hasCorePermission(req.agent, path)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      details: `Missing permission: core.${path}`
    });
  };
}

async function ensureUserCorePermissions(pg, userDoc) {
  // MongoDB removed - return user with default permissions
  // In production, this should update PostgreSQL
  const ensured = ensureCorePermissionsDocument(userDoc);
  return { changed: ensured.changed, user: { ...userDoc, permissions: ensured.permissions, roles: ensured.roles } };
}

async function backfillCorePermissions(pg, options = {}) {
  // MongoDB removed - stub implementation
  console.log('[core-permissions] backfillCorePermissions stub - MongoDB removed');
  return { scanned: 0, updated: 0, message: 'MongoDB removed - use SQL migrations instead' };
}

module.exports = {
  DEFAULT_CORE_PERMISSIONS,
  ensureCorePermissionsDocument,
  ensureUserCorePermissions,
  hasCorePermission,
  requireCorePermission,
  backfillCorePermissions,
  _test: {
    deepMergeDefaults,
    clone
  }
};
