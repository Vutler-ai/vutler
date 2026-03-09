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
  '/api/v1/mail',
  '/api/v1/sandbox',
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
 * Resolve API key via SHA256 lookup in tenant_vutler.api_keys (PostgreSQL)
 */
async function resolveApiKey(req, apiKey) {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Check cache
  const cached = apiKeyCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pg = req.app.locals.pg;
  if (!pg) {
    console.error('[AUTH] PG pool not available for API key lookup');
    return null;
  }

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

    if (result.rows.length === 0) {
      apiKeyCache.set(keyHash, { data: null, expiresAt: Date.now() + 30000 });
      return null;
    }

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
  } catch (err) {
    console.error('[AUTH] API key DB lookup failed:', err.message);
    return null;
  }
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

async function authMiddleware(req, res, next) {
  const fullPath = req.originalUrl.split('?')[0];

  // Public paths — still decode JWT if present for optional context
  if (isPublicPath(fullPath)) {
    if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
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
      attachIdentity(req, {
        id: decoded.userId,
        name: decoded.name || decoded.email,
        email: decoded.email,
        role: decoded.role || 'user',
        workspaceId: decoded.workspaceId || DEFAULT_WORKSPACE,
      });
      return next();
    } catch (err) {
      if (err.message === 'Token expired') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // ── No auth provided ──
  if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
  return res.status(401).json({ error: 'Authentication required (Bearer token or X-API-Key)' });
}

module.exports = authMiddleware;

// API Key middleware for runtime endpoints
module.exports.requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!key) return res.status(401).json({ success: false, error: 'API key required' });
  // TODO: validate against stored keys
  next();
};
module.exports.verifyApiKey = module.exports.requireApiKey;
