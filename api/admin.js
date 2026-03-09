'use strict';

/**
 * Vutler Admin API
 * User management, plans, stats — admin-only endpoints
 */

const express = require('express');
const crypto = require('crypto');
const pool = require('../lib/vaultbrix');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const TABLE = `${SCHEMA}.users_auth`;

// In-memory admin sessions (token -> { userId, email, expires })
const adminSessions = new Map();

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

    // Create session token
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_FALLBACK';
    const token = jwt.sign(
      { id: user.id, email: user.email, workspace_id: user.workspace_id, role: user.role },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    console.log(`[Admin] Login successful: ${user.email}`);
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

// Apply admin middleware to all routes below
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

/**
 * GET /api/v1/admin/workspaces
 * List all workspaces
 */
router.get('/workspaces', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.id, w.name, w.plan, w.status, w.created_at, w.updated_at,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT a.id) as agent_count
      FROM ${SCHEMA}.workspaces w
      LEFT JOIN ${SCHEMA}.users_auth u ON u.workspace_id = w.id
      LEFT JOIN ${SCHEMA}.agents a ON a.workspace_id = w.id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Admin] List workspaces error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/admin/workspaces/:id
 * Update workspace (plan, status, etc.)
 */
router.put('/workspaces/:id', async (req, res) => {
  try {
    const { plan, status, name } = req.body;
    const setClauses = [];
    const params = [];
    let idx = 1;

    if (plan) {
      setClauses.push(`plan = $${idx}`);
      params.push(plan);
      idx++;
    }
    if (status) {
      setClauses.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (name) {
      setClauses.push(`name = $${idx}`);
      params.push(name);
      idx++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    setClauses.push('updated_at = NOW()');
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE ${SCHEMA}.workspaces SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    console.log(`[Admin] Workspace updated: ${result.rows[0].name} by ${req.adminUser.email}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Admin] Update workspace error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/admin/users/:id/export
 * RGPD Data Export - export all user data as JSON
 */
router.get('/users/:id/export', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // User info
    const userResult = await pool.query(
      `SELECT id, workspace_id, email, name, display_name, avatar_url, role, 
              plan, plan_expires_at, beta_code, created_at, updated_at, last_login_at, notes
       FROM ${TABLE} WHERE id = `,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const export_data = { user };

    // Messages (chat messages)
    const messagesResult = await pool.query(
      `SELECT id, conversation_id, role, content, created_at, updated_at
       FROM ${SCHEMA}.messages 
       WHERE workspace_id =  
       ORDER BY created_at DESC`,
      [user.workspace_id]
    );
    export_data.messages = messagesResult.rows;

    // Tasks
    const tasksResult = await pool.query(
      `SELECT id, title, description, status, priority, assigned_to, due_date, created_at, updated_at
       FROM ${SCHEMA}.tasks 
       WHERE workspace_id =  
       ORDER BY created_at DESC`,
      [user.workspace_id]
    );
    export_data.tasks = tasksResult.rows;

    // Calendar events
    const eventsResult = await pool.query(
      `SELECT id, title, description, start_time, end_time, location, created_at, updated_at
       FROM ${SCHEMA}.calendar_events 
       WHERE workspace_id =  
       ORDER BY start_time DESC`,
      [user.workspace_id]
    );
    export_data.calendar_events = eventsResult.rows;

    // Drive files metadata (not content)
    const filesResult = await pool.query(
      `SELECT id, name, path, mime_type, size, created_at, updated_at
       FROM ${SCHEMA}.drive_files 
       WHERE workspace_id =  
       ORDER BY created_at DESC`,
      [user.workspace_id]
    );
    export_data.drive_files = filesResult.rows;

    // Audit logs
    const auditResult = await pool.query(
      `SELECT id, action, resource_type, resource_id, metadata, created_at
       FROM ${SCHEMA}.audit_logs 
       WHERE user_id =  
       ORDER BY created_at DESC`,
      [userId]
    );
    export_data.audit_logs = auditResult.rows;

    // Agents
    const agentsResult = await pool.query(
      `SELECT id, name, description, status, created_at, updated_at
       FROM ${SCHEMA}.agents 
       WHERE workspace_id =  
       ORDER BY created_at DESC`,
      [user.workspace_id]
    );
    export_data.agents = agentsResult.rows;

    console.log(`[Admin] Data export for user ${user.email} by ${req.adminUser.email}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vutler-export-${userId}-${Date.now()}.json"`);
    res.json({
      success: true,
      export_date: new Date().toISOString(),
      user_id: userId,
      data: export_data
    });
  } catch (err) {
    console.error('[Admin] Data export error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/admin/users/:id/data
 * RGPD Data Deletion - delete all user data (cascade)
 */
router.delete('/users/:id/data', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent self-delete
    if (userId === req.adminUser.userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own data' });
    }
    
    // Get user info first
    const userResult = await pool.query(
      `SELECT id, workspace_id, email FROM ${TABLE} WHERE id = `,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const workspaceId = user.workspace_id;
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete workspace-related data
      await client.query(`DELETE FROM ${SCHEMA}.messages WHERE workspace_id = `, [workspaceId]);
      await client.query(`DELETE FROM ${SCHEMA}.tasks WHERE workspace_id = `, [workspaceId]);
      await client.query(`DELETE FROM ${SCHEMA}.calendar_events WHERE workspace_id = `, [workspaceId]);
      await client.query(`DELETE FROM ${SCHEMA}.drive_files WHERE workspace_id = `, [workspaceId]);
      await client.query(`DELETE FROM ${SCHEMA}.agents WHERE workspace_id = `, [workspaceId]);
      
      // Delete user-specific data
      await client.query(`DELETE FROM ${SCHEMA}.audit_logs WHERE user_id = `, [userId]);
      await client.query(`DELETE FROM ${SCHEMA}.api_keys WHERE user_id = `, [userId]);
      
      // Delete user account
      await client.query(`DELETE FROM ${TABLE} WHERE id = `, [userId]);
      
      // Delete workspace if no other users
      await client.query(
        `DELETE FROM ${SCHEMA}.workspaces WHERE id =  AND NOT EXISTS (
          SELECT 1 FROM ${TABLE} WHERE workspace_id = 
        )`,
        [workspaceId]
      );
      
      await client.query('COMMIT');
      
      console.log(`[Admin] RGPD deletion completed for user ${user.email} by ${req.adminUser.email}`);
      res.json({ 
        success: true, 
        message: 'All user data deleted',
        deleted: {
          user_id: userId,
          email: user.email,
          workspace_id: workspaceId
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Admin] Data deletion error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

