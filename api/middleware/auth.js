/**
 * Vutler Auth Middleware — JWT + API Key (RC removed)
 * Sprint 15.3 — Fix: Add X-API-Key support via PostgreSQL lookup
 *
 * Supports:
 *   1. JWT Bearer token  (Authorization: Bearer <jwt>)
 *   2. X-API-Key header   (service/agent keys, SHA256 lookup in PG)
 *   3. Bearer vutler_...  (API key passed as Bearer token)
 *   4. X-Auth-Token legacy (converted to Bearer internally)
 */

const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || (() => { console.error('[AUTH] WARNING: JWT_SECRET env var missing'); return 'MISSING-SET-JWT_SECRET-ENV'; })();

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
let usersAuthHasDeletedAtColumn = null;

// ── API key cache (avoid DB hit on every request) ──
const apiKeyCache = new Map();
const API_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of apiKeyCache) {
    if (val.expiresAt < now) apiKeyCache.delete(key);
  }
}, 10 * 60 * 1000);

// Public paths (no auth needed)
const WORKSPACE_INTEGRATION_CALLBACK_PATHS = [
  '/api/v1/integrations/google/callback',
  '/api/v1/integrations/github/callback',
  '/api/v1/integrations/microsoft365/callback',
];

const PUBLIC_FULL_PATHS = [
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/admin/login',
  "/api/v1/auth/register",
  '/api/v1/auth/logout',
  '/api/v1/auth/github',
  '/api/v1/auth/github/callback',
  '/api/v1/auth/google',
  '/api/v1/auth/google/callback',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/health',
  '/api/v1/agents/sync',
  '/api/v1/task-router',
  '/api/v1/billing/webhook',
  '/api/v1/billing/plans',
  '/api/v1/email/incoming',
  '/downloads', // Nexus installer downloads (public, no auth)
  // Workspace integration callbacks rely on OAuth state, not an Authorization header.
  ...WORKSPACE_INTEGRATION_CALLBACK_PATHS,
  // SECURITY: sandbox, drive/download, nexus/register removed from public paths (audit 2026-03-28)
  // '/api/v1/sandbox',        — RCE without auth
  // '/api/v1/drive/download', — cross-tenant file access
  // '/api/v1/nexus/register', — unauthenticated node registration
  // '/api/v1/nexus/cli/tokens', — token generation without auth
];

function isPublicPath(fullPath) {
  return PUBLIC_FULL_PATHS.some(p => fullPath === p || fullPath.startsWith(p + '/'));
}

/**
 * Try to silently decode a JWT (for optional user context on public paths)
 */
function tryDecodeJWT(req) {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] ? "Bearer " + req.headers["x-auth-token"] : undefined);
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const token = authHeader.slice(7);
    if (token.startsWith('vutler_')) return false;
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return false;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + b).digest("base64url");
    if (s !== expectedSig) return false;
    const decoded = JSON.parse(Buffer.from(b, "base64url").toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) return false;
    req.user = { id: decoded.userId, name: decoded.name || decoded.email, email: decoded.email, role: decoded.role || 'user', workspaceId: decoded.workspaceId || DEFAULT_WORKSPACE };
    req.userId = decoded.userId;
    req.workspaceId = decoded.workspaceId || DEFAULT_WORKSPACE;
    return true;
  } catch(e) { return false; }
}

/**
 * Resolve API key via SHA256 lookup — checks both:
 *   1. api_keys (legacy table)
 *   2. tenant_vutler.workspace_api_keys (nexus/register keys)
 */
async function resolveApiKey(req, apiKey) {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Check cache (only a positive hit or an explicit null after both tables checked)
  const cached = apiKeyCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pg = req.app.locals.pg;
  if (!pg) {
    console.error('[AUTH] PG pool not available for API key lookup');
    return null;
  }

  // ── Table 1: legacy api_keys ──
  try {
    const result = await pg.query(
      `SELECT ak.id, ak.workspace_id, ak.name, ak.role, ak.created_by_user_id,
              ua.email, ua.display_name
       FROM api_keys ak
       LEFT JOIN users_auth ua ON ua.id = ak.created_by_user_id
       WHERE ak.key_hash = $1
         AND ak.is_active = true
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [keyHash]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const data = {
        id: row.created_by_user_id || row.id,
        name: row.display_name || row.name || 'API Service',
        email: row.email || `api-${row.name}@vutler.internal`,
        role: row.role || 'service',
        workspaceId: row.workspace_id || DEFAULT_WORKSPACE,
        apiKeyId: row.id,
        apiKeyName: row.name,
      };
      apiKeyCache.set(keyHash, { data, expiresAt: Date.now() + API_KEY_CACHE_TTL });
      return data;
    }
  } catch (err) {
    console.error('[AUTH] API key lookup (api_keys) failed:', err.message);
  }

  // ── Table 2: tenant_vutler.workspace_api_keys ──
  try {
    const result = await pg.query(
      `SELECT ak.id, ak.workspace_id, ak.name, ak.created_by_user_id
       FROM tenant_vutler.workspace_api_keys ak
       WHERE ak.key_hash = $1 AND ak.revoked_at IS NULL
       LIMIT 1`,
      [keyHash]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const data = {
        id: row.created_by_user_id || row.id,
        email: null,
        name: row.name,
        role: 'api_key',
        workspaceId: row.workspace_id,
        apiKeyId: row.id,
      };
      apiKeyCache.set(keyHash, { data, expiresAt: Date.now() + API_KEY_CACHE_TTL });
      return data;
    }
  } catch (err) {
    console.error('[AUTH] API key lookup (workspace_api_keys) failed:', err.message);
  }

  // Not found in either table — cache negative result
  apiKeyCache.set(keyHash, { data: null, expiresAt: Date.now() + 30000 });
  return null;
}

/**
 * Attach resolved identity to req (shared by JWT and API key paths)
 */
function attachIdentity(req, identity) {
  req.user = {
    id: identity.id,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    workspaceId: identity.workspaceId,
    avatarUrl: identity.avatarUrl || null,
  };
  req.rcUser = {
    _id: identity.id,
    username: identity.email,
    name: identity.name,
    email: identity.email,
    roles: [identity.role],
  };
  req.userId = identity.id;
  req.workspaceId = identity.workspaceId;
  if (identity.apiKeyId) req.apiKeyId = identity.apiKeyId;
}

async function hasUsersAuthDeletedAtColumn(pg) {
  if (typeof usersAuthHasDeletedAtColumn === 'boolean') {
    return usersAuthHasDeletedAtColumn;
  }

  try {
    const result = await pg.query(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'tenant_vutler'
            AND table_name = 'users_auth'
            AND column_name = 'deleted_at'
       ) AS exists`
    );
    usersAuthHasDeletedAtColumn = result.rows[0]?.exists === true;
  } catch (_) {
    usersAuthHasDeletedAtColumn = false;
  }

  return usersAuthHasDeletedAtColumn;
}

async function resolveActiveJwtIdentity(req, decoded) {
  const pg = req.app.locals.pg;
  const fallback = {
    id: decoded.userId,
    name: decoded.name || decoded.email,
    email: decoded.email,
    role: decoded.role || 'user',
    workspaceId: decoded.workspaceId || DEFAULT_WORKSPACE,
  };

  if (!pg || !decoded.userId) return fallback;

  try {
    const activeFilter = (await hasUsersAuthDeletedAtColumn(pg)) ? 'AND deleted_at IS NULL' : '';
    const result = await pg.query(
      `SELECT id, email, name, role, workspace_id, avatar_url
         FROM tenant_vutler.users_auth
        WHERE id = $1
          ${activeFilter}
        LIMIT 1`,
      [decoded.userId]
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name || row.email,
      email: row.email,
      role: row.role || fallback.role,
      workspaceId: row.workspace_id || fallback.workspaceId,
      avatarUrl: row.avatar_url || null,
    };
  } catch (err) {
    console.warn('[AUTH] Active user lookup failed:', err.message);
    return fallback;
  }
}

async function authMiddleware(req, res, next) {
  const fullPath = req.originalUrl.split('?')[0];

  // Public paths — still decode JWT if present for optional context
  if (isPublicPath(fullPath)) {
    // SECURITY: do NOT assign default workspace to unauthenticated requests (audit 2026-03-28)
    tryDecodeJWT(req);
    return next();
  }

  // Static pages — no auth
  if (fullPath.startsWith('/admin') || fullPath.startsWith('/landing') || fullPath === '/' || fullPath === '/login' || fullPath === '/signup') {
    return next();
  }

  // ── MODE 1: X-API-Key header ──
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) {
    const keyData = await resolveApiKey(req, xApiKey);
    if (!keyData) return res.status(401).json({ error: 'Invalid API key' });
    attachIdentity(req, keyData);
    return next();
  }

  // ── MODE 2: Authorization / X-Auth-Token header ──
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] ? "Bearer " + req.headers["x-auth-token"] : undefined);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // 2a — Bearer token is an API key (vutler_ prefix)
    if (token.startsWith('vutler_')) {
      const keyData = await resolveApiKey(req, token);
      if (!keyData) return res.status(401).json({ error: 'Invalid API key' });
      attachIdentity(req, keyData);
      return next();
    }

    // 2b — JWT token
    try {
      const [h, b, s] = token.split(".");
      if (!h || !b || !s) throw new Error("Malformed token");
      const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + b).digest("base64url");
      if (s !== expectedSig) throw new Error("Invalid signature");
      const decoded = JSON.parse(Buffer.from(b, "base64url").toString());
      if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) throw new Error("Token expired");

      req.jwtUser = decoded;
      const identity = await resolveActiveJwtIdentity(req, decoded);
      if (!identity) return res.status(401).json({ error: 'User account is no longer available' });
      attachIdentity(req, identity);
      return next();
    } catch (err) {
      if (err.message === 'Token expired') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // ── No auth provided ──
  return res.status(401).json({ error: 'Authentication required (Bearer token or X-API-Key)' });
}

module.exports = authMiddleware;

// API Key middleware for runtime endpoints — validates against stored keys (audit 2026-03-28)
module.exports.requireApiKey = async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!key) return res.status(401).json({ success: false, error: 'API key required' });

  try {
    const keyData = await resolveApiKey(req, key);
    if (!keyData) return res.status(401).json({ success: false, error: 'Invalid API key' });
    attachIdentity(req, keyData);
    next();
  } catch (err) {
    console.error('[AUTH] requireApiKey validation error:', err.message);
    return res.status(500).json({ success: false, error: 'API key validation failed' });
  }
};
module.exports.verifyApiKey = module.exports.requireApiKey;
module.exports.resolveApiKey = resolveApiKey;
