const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const SCHEMA = 'tenant_vutler';

// WARNING: Use JWT_SECRET env var in production!
const DEFAULT_SECRET = 'vutler-jwt-secret-2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
if (!process.env.JWT_SECRET) {
  console.warn('[AUTH-JWT-LOGIN] Using default JWT_SECRET - set JWT_SECRET env var in production!');
}

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify({...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400*7})).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    console.log(`[AUTH-JWT] Login attempt: ${email}`);

    // Check users_auth table
    const result = await pool.query(`SELECT * FROM ${SCHEMA}.users_auth WHERE email = $1`, [email]);
    
    if (result.rows.length === 0) {
      // Auto-create first user (admin bootstrap)
      const hashedPw = crypto.createHash('sha256').update(password).digest('hex');
      const userId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO ${SCHEMA}.users_auth (id, email, password_hash, display_name, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, email, hashedPw, email.split('@')[0], 'admin']
      );
      const token = signJwt({ userId, email, role: 'admin' });
      console.log(`[AUTH-JWT] Auto-created admin: ${email}`);
      const username = email.split('@')[0];
      return res.json({ success: true, authToken: token, token, userId, username, name: username, email, role: 'admin' });
    }

    const user = result.rows[0];
    const hashedPw = crypto.createHash('sha256').update(password).digest('hex');
    
    if (user.password_hash !== hashedPw) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signJwt({ userId: user.id, email: user.email, role: user.role || 'user' });
    const username = user.display_name || user.email.split('@')[0];
    console.log(`[AUTH-JWT] Login OK: ${email}`);
    return res.json({ success: true, authToken: token, token, userId: user.id, username, name: username, email: user.email, role: user.role || 'user' });

  } catch (err) {
    console.error('[AUTH-JWT] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
});

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const existing = await pool.query(`SELECT id FROM ${SCHEMA}.users_auth WHERE email = $1`, [email]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: 'User already exists' });

    const hashedPw = crypto.createHash('sha256').update(password).digest('hex');
    const userId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ${SCHEMA}.users_auth (id, email, password_hash, display_name, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, email, hashedPw, name || email.split('@')[0], 'user']
    );
    const token = signJwt({ userId, email, role: 'user' });
    const username = name || email.split('@')[0];
    return res.json({ success: true, authToken: token, token, userId, username, name: username, email, role: 'user' });
  } catch (err) {
    console.error('[AUTH-JWT] Register error:', err.message);
    return res.status(500).json({ success: false, message: 'Registration error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token' });
    const token = authHeader.replace('Bearer ', '');
    const [h, b, s] = token.split('.');
    const check = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (check !== s) return res.status(401).json({ success: false, message: 'Invalid token' });
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now()/1000)) return res.status(401).json({ success: false, message: 'Token expired' });
    return res.json({ success: true, ...payload });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
