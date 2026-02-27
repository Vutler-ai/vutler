/**
 * Vutler Auth Middleware — Sprint 9.1 (patched Sprint 15)
 * Supports BOTH JWT (new) and RC (legacy) authentication
 * FIXED: stable JWT_SECRET + workspaceId fallback
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL || 'http://vutler-rocketchat:3000';
const CACHE_TTL_MS = 5 * 60 * 1000;

// JWT secret — stable, matches jwt-auth.js
const STABLE_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';
let JWT_SECRET;
try {
  JWT_SECRET = require('/app/api/auth/jwt-auth').JWT_SECRET;
} catch (e) {
  JWT_SECRET = process.env.JWT_SECRET || STABLE_SECRET;
  console.warn('[AUTH MW] Could not load JWT_SECRET from jwt-auth module, using stable fallback');
}

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001'; // fallback per brief

// RC token cache
const tokenCache = new Map();

// Public paths (no auth needed)
const PUBLIC_FULL_PATHS = [
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/health',
];

function isPublicPath(fullPath) {
  return PUBLIC_FULL_PATHS.some(p => fullPath === p || fullPath.startsWith(p + '/'));
}

// Cleanup expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokenCache) {
    if (val.expiresAt < now) tokenCache.delete(key);
  }
}, 10 * 60 * 1000);

async function authMiddleware(req, res, next) {
  const fullPath = req.originalUrl.split('?')[0];

  // Skip auth for public paths
  if (isPublicPath(fullPath)) {
    if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
    return next();
  }

  // Skip auth for static pages
  if (fullPath.startsWith('/admin') || fullPath.startsWith('/landing') || fullPath === '/' || fullPath === '/login' || fullPath === '/signup') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const rcToken = req.headers['x-auth-token'];
  const rcUserId = req.headers['x-user-id'];

  // ── MODE 1: JWT Auth ──
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.jwtUser = decoded;
      req.rcUser = {
        _id: decoded.userId,
        username: decoded.email,
        name: decoded.email,
        email: decoded.email,
        roles: [decoded.role || 'user'],
      };
      req.userId = decoded.userId;
      req.workspaceId = decoded.workspaceId || DEFAULT_WORKSPACE;
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // ── MODE 2: RC Legacy Auth ──
  if (rcToken && rcUserId) {
    const cacheKey = `${rcUserId}:${rcToken}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      req.rcUser = cached.user;
      if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
      return next();
    }

    try {
      const rcRes = await axios.get(`${ROCKETCHAT_URL}/api/v1/me`, {
        headers: { 'X-Auth-Token': rcToken, 'X-User-Id': rcUserId },
        timeout: 5000,
        validateStatus: (s) => s < 500,
      });

      if (rcRes.status !== 200 || rcRes.data.status === 'error') {
        tokenCache.delete(cacheKey);
        return res.status(403).json({ error: 'Invalid token' });
      }

      const user = {
        _id: rcRes.data._id,
        username: rcRes.data.username,
        name: rcRes.data.name,
        email: rcRes.data.emails?.[0]?.address,
        roles: rcRes.data.roles || [],
      };

      tokenCache.set(cacheKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });
      req.rcUser = user;
      if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
      return next();
    } catch (err) {
      console.error('[AUTH MW] RC validation error:', err.message);
      return res.status(503).json({ error: 'Authentication service unavailable' });
    }
  }

  // ── No auth provided — fallback with workspaceId ──
  if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = authMiddleware;
