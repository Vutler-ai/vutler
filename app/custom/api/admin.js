'use strict';

/**
 * Vutler Admin API
 * User management, plans, stats — admin-only endpoints
 */

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../lib/postgres');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const TABLE = `${SCHEMA}.users_auth`;

// In-memory admin sessions (token -> { userId, email, expires })
const adminSessions = new Map();
// Share admin sessions with auth middleware
const { setAdminSessions } = require("../lib/auth");
setAdminSessions(adminSessions);

// Clean expired sessions every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions) {
    if (session.expires < now) adminSessions.delete(token);
  }
}, 10 * 60 * 1000);

/**
 * Hash password with salt (matching existing signup logic)
 */
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * POST /api/v1/admin/login
 * Admin login — returns session token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, salt, role, name FROM ${TABLE} WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Check password — support both pbkdf2 (with salt) and bcrypt formats
    let passwordValid = false;
    if (user.salt) {
      const hash = hashPassword(password, user.salt);
      passwordValid = (hash === user.password_hash);
    } else if (user.password_hash && user.password_hash.startsWith('$2b$')) {
      // bcrypt — can't verify without bcrypt lib, skip
      console.log('[Admin] bcrypt password format not supported for admin login');
      return res.status(401).json({ success: false, error: 'Invalid credentials (password format not supported)' });
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Create JWT token
    // SECURITY: no fallback — fail hard if JWT_SECRET missing (audit 2026-03-28)
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ success: false, error: 'Server configuration error' });
    const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
      role: user.role || 'admin',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      iat: Math.floor(Date.now()/1000),
      exp: Math.floor(Date.now()/1000) + 86400
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(header+'.'+payload).digest('base64url');
    const token = header+'.'+payload+'.'+sig;

    console.log(`[Admin] Login successful: ${user.email}`);
    // Register JWT in adminSessions so authenticateAgent recognizes it
    adminSessions.set(token, { userId: user.id, email: user.email, name: user.name || user.email, expires: Date.now() + 86400000 });
    res.json({
      success: true,
      data: { token, user: { id: user.id, email: user.email, name: user.name } }
    });
  } catch (err) {
    console.error('[Admin] Login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * Admin auth middleware — all routes below require valid admin session
 */
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Admin token required (X-Admin-Token header)' });
  }

  const session = adminSessions.get(token);
  if (!session || session.expires < Date.now()) {
    adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Invalid or expired admin session' });
  }

  req.adminUser = session;
  next();
}

// Apply admin middleware to all routes below (re-enabled: security audit 2026-03-28)
router.use(requireAdmin);

/**
 * GET /api/v1/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE role = 'admin') as admins,
        COUNT(*) FILTER (WHERE role = 'user') as users,
        COUNT(*) FILTER (WHERE role = 'banned') as banned,
        COUNT(*) FILTER (WHERE plan = 'free' OR plan IS NULL) as plan_free,
        COUNT(*) FILTER (WHERE plan = 'starter') as plan_starter,
        COUNT(*) FILTER (WHERE plan = 'team') as plan_team,
        COUNT(*) FILTER (WHERE plan = 'enterprise') as plan_enterprise,
        COUNT(*) FILTER (WHERE plan = 'beta') as plan_beta,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as signups_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as signups_30d
      FROM ${TABLE}
    `);

    res.json({ success: true, data: stats.rows[0] });
  } catch (err) {
    console.error('[Admin] Stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const roleFilter = req.query.role || '';
    const planFilter = req.query.plan || '';

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (search) {
      where += ` AND (email ILIKE $${paramIdx} OR name ILIKE $${paramIdx} OR display_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (roleFilter) {
      where += ` AND role = $${paramIdx}`;
      params.push(roleFilter);
      paramIdx++;
    }
    if (planFilter) {
      where += ` AND (plan = $${paramIdx} OR ($${paramIdx} = 'free' AND plan IS NULL))`;
      params.push(planFilter);
      paramIdx++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${TABLE} ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const usersResult = await pool.query(
      `SELECT id, workspace_id, email, name, display_name, avatar_url, role, 
              plan, plan_expires_at, beta_code, stripe_customer_id, notes,
              created_at, updated_at, last_login_at
       FROM ${TABLE} ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: usersResult.rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('[Admin] List users error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/admin/users/:id
 */
router.get('/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, workspace_id, email, name, display_name, avatar_url, role,
              plan, plan_expires_at, beta_code, stripe_customer_id, notes,
              created_at, updated_at, last_login_at
       FROM ${TABLE} WHERE id = $1`, [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Admin] Get user error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/admin/users — create user manually
 */
router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role, plan } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Check duplicate
    const existing = await pool.query(`SELECT id FROM ${TABLE} WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO ${TABLE} (id, email, password_hash, salt, name, role, plan, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [id, email.toLowerCase().trim(), passwordHash, salt, name || '', role || 'user', plan || 'free']
    );

    console.log(`[Admin] User created: ${email} by ${req.adminUser.email}`);
    res.json({ success: true, data: { id, email: email.toLowerCase().trim() } });
  } catch (err) {
    console.error('[Admin] Create user error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/admin/users/:id/role
 */
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'admin', 'banned'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: `Invalid role. Must be: ${validRoles.join(', ')}` });
    }

    // Prevent self-demotion
    if (req.params.id === req.adminUser.userId && role !== 'admin') {
      return res.status(400).json({ success: false, error: 'Cannot change your own role' });
    }

    const result = await pool.query(
      `UPDATE ${TABLE} SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role`,
      [role, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[Admin] Role changed: ${result.rows[0].email} -> ${role} by ${req.adminUser.email}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Admin] Change role error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/admin/users/:id/plan
 */
router.put('/users/:id/plan', async (req, res) => {
  try {
    const { plan, plan_expires_at, beta_code, notes } = req.body;
    const validPlans = ['free', 'starter', 'team', 'enterprise', 'beta'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ success: false, error: `Invalid plan. Must be: ${validPlans.join(', ')}` });
    }

    const setClauses = ['plan = $1', 'updated_at = NOW()'];
    const params = [plan];
    let idx = 2;

    if (plan_expires_at !== undefined) {
      setClauses.push(`plan_expires_at = $${idx}`);
      params.push(plan_expires_at || null);
      idx++;
    }
    if (beta_code !== undefined) {
      setClauses.push(`beta_code = $${idx}`);
      params.push(beta_code || null);
      idx++;
    }
    if (notes !== undefined) {
      setClauses.push(`notes = $${idx}`);
      params.push(notes);
      idx++;
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE ${TABLE} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, email, plan`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[Admin] Plan changed: ${result.rows[0].email} -> ${plan} by ${req.adminUser.email}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Admin] Change plan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/admin/users/:id
 */
router.delete('/users/:id', async (req, res) => {
  try {
    // Prevent self-delete
    if (req.params.id === req.adminUser.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    }

    const result = await pool.query(
      `DELETE FROM ${TABLE} WHERE id = $1 RETURNING id, email`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[Admin] User deleted: ${result.rows[0].email} by ${req.adminUser.email}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Admin] Delete user error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
