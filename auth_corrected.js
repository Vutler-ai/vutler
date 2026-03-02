/**
 * Vutler Auth Middleware — JWT Only (RC removed)
 * Sprint 15.2 — Fix: req.user + remove chat/dashboard/settings from public paths
 */

// JWT verification done manually via crypto (no jsonwebtoken dependency needed)

const JWT_SECRET = process.env.JWT_SECRET || (() => { console.error('[AUTH] WARNING: JWT_SECRET env var missing'); return 'MISSING-SET-JWT_SECRET-ENV'; })();

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// Public paths (no auth needed) — LOCKED DOWN for production
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

function tryDecodeJWT(req) {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] ? "Bearer " + req.headers["x-auth-token"] : undefined);
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  try {
    const token = authHeader.slice(7);
    const crypto = require("crypto");
    const [h, b, s] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + b).digest("base64url");
    if (s !== expectedSig) return;
    const decoded = JSON.parse(Buffer.from(b, "base64url").toString());
    if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) return;
    req.user = { id: decoded.userId, name: decoded.name || decoded.email, email: decoded.email, role: decoded.role || 'user', workspaceId: decoded.workspaceId || DEFAULT_WORKSPACE };
    req.userId = decoded.userId;
    req.workspaceId = decoded.workspaceId || DEFAULT_WORKSPACE;
  } catch(e) {}
}

async function authMiddleware(req, res, next) {
  const fullPath = req.originalUrl.split('?')[0];

  // For public paths, still try to decode JWT if present (for user context)
  if (isPublicPath(fullPath)) {
    if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
    tryDecodeJWT(req);
    return next();
  }

  if (fullPath.startsWith('/admin') || fullPath.startsWith('/landing') || fullPath === '/' || fullPath === '/login' || fullPath === '/signup') {
    return next();
  }

  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] ? "Bearer " + req.headers["x-auth-token"] : undefined);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const crypto = require("crypto");
      const [h, b, s] = token.split(".");
      const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(h + "." + b).digest("base64url");
      if (s !== expectedSig) throw new Error("Invalid signature");
      const decoded = JSON.parse(Buffer.from(b, "base64url").toString());
      if (decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) throw new Error("Token expired");
      
      req.jwtUser = decoded;
      req.user = {
        id: decoded.userId,
        name: decoded.name || decoded.email,
        email: decoded.email,
        role: decoded.role || 'user',
        workspaceId: decoded.workspaceId || DEFAULT_WORKSPACE,
      };
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

  if (!req.workspaceId) req.workspaceId = DEFAULT_WORKSPACE;
  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = authMiddleware;