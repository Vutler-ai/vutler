/**
 * Vutler Auth Middleware — JWT Only (RC removed)
 * Sprint 15.1 — Mike ⚙️ — 2026-02-27
 */

const jwt = require('jsonwebtoken');

// JWT secret — stable
const STABLE_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';
let JWT_SECRET;
try {
  JWT_SECRET = require('/app/api/auth/jwt-auth').JWT_SECRET;
} catch (e) {
  JWT_SECRET = process.env.JWT_SECRET || STABLE_SECRET;
  console.warn('[AUTH MW] Using stable JWT_SECRET fallback');
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

  const authHeader = req.headers.authorization;

  // ── JWT Auth ──
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

  // ── No auth provided ──
  if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = authMiddleware;
