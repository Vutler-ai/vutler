/**
 * Vutler Auth Middleware — JWT Only (RC removed)
 * Sprint 15.1 — Mike ⚙️ — 2026-02-27
 */

const jwt = require('jsonwebtoken');

// JWT secret
const DEFAULT_SECRET = 'vutler-jwt-secret-2026';
let JWT_SECRET;
try {
  JWT_SECRET = require('/app/api/auth/jwt-auth').JWT_SECRET;
} catch (e) {
  JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
  if (!process.env.JWT_SECRET) {
    console.warn('[AUTH MW] Using default JWT_SECRET - set JWT_SECRET env var in production!');
  }
}

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

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
  '/api/v1/agents/sync',
  "/api/v1/calendar",
  "/api/v1/dashboard",
  "/api/v1/chat",
  "/api/v1/settings",
  "/api/v1/goals",
  '/api/v1/calendar',
  '/api/v1/dashboard',
  '/api/v1/chat',
  '/api/v1/settings',
  '/api/v1/goals',
  '/api/v1/calendar',
  '/api/v1/dashboard',
  '/api/v1/chat',
  '/api/v1/settings',
  '/api/v1/goals',
];

function isPublicPath(fullPath) {
  return PUBLIC_FULL_PATHS.some(p => fullPath === p || fullPath.startsWith(p + '/'));
}

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

  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] ? "Bearer " + req.headers["x-auth-token"] : undefined);

  // ── JWT Auth ──
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      // Manual JWT verify (matches auth.js signing)
      const crypto = require("crypto");
      const [h, b, s] = token.split(".");
      const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + b).digest("base64url");
      if (s !== expectedSig) throw new Error("Invalid signature");
      const decoded = JSON.parse(Buffer.from(b, "base64url").toString());
      if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) throw new Error("Token expired");
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

  // ── No auth provided ──
  if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = authMiddleware;
