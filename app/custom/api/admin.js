'use strict';

/**
 * Vutler Admin API
 * User management, plans, stats — admin-only endpoints
 */

const express = require('express');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const { pool } = require('../lib/postgres');
const {
  archiveTechnicalDmChannels,
  normalizeLegacyDmChannels,
} = require('../../../services/chatChannelMaintenance');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const TABLE = `${SCHEMA}.users_auth`;

// In-memory admin sessions (token -> { userId, email, expires })
const adminSessions = new Map();
// Share admin sessions with auth middleware
const { setAdminSessions } = require('../lib/auth');
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
      // bcrypt format — use bcryptjs
      let bcrypt;
      try { bcrypt = require('bcryptjs'); } catch { try { bcrypt = require('bcrypt'); } catch { /* none */ } }
      if (bcrypt) {
        passwordValid = await bcrypt.compare(password, user.password_hash);
      } else {
        console.log('[Admin] No bcrypt library available');
        return res.status(401).json({ success: false, error: 'Invalid credentials (bcrypt not available)' });
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Create JWT token
    // SECURITY: no fallback — fail hard if JWT_SECRET missing (audit 2026-03-28)
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ success: false, error: 'Server configuration error' });
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
      role: user.role || 'admin',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

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

// ─── VPS Health Helpers ──────────────────────────────────────────────────────

const THRESHOLDS = {
  cpu: { warning: 80, critical: 95 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 80, critical: 90 },
  load: { warning: 0.8, critical: 1.5 },
};

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length ? parts.join(' ') : `${Math.floor(seconds)}s`;
}

function readProcFile(path) {
  try { return fs.readFileSync(path, 'utf8'); } catch { return ''; }
}

function getCpuInfo() {
  const cores = os.cpus().length || 1;
  const model = os.cpus()[0]?.model || 'Unknown';
  const [one_minute, five_minutes, fifteen_minutes] = os.loadavg();

  // CPU usage from /proc/stat (Linux) or fallback to load-based estimate
  let usage_percent = 0;
  try {
    const stat1 = readProcFile('/proc/stat');
    const parseLine = (line) => {
      const p = line.split(/\s+/).slice(1).map(Number);
      return { idle: p[3] + (p[4] || 0), total: p.reduce((a, b) => a + b, 0) };
    };
    // Synchronous second sample
    const { execSync: exec } = require('child_process');
    exec('sleep 0.1', { stdio: 'ignore' });
    const stat2 = readProcFile('/proc/stat');
    if (stat1 && stat2) {
      const c1 = parseLine(stat1.split('\n')[0]);
      const c2 = parseLine(stat2.split('\n')[0]);
      const totalDiff = c2.total - c1.total;
      if (totalDiff > 0) usage_percent = Math.round((1 - (c2.idle - c1.idle) / totalDiff) * 1000) / 10;
    }
  } catch {
    usage_percent = Math.min(100, Math.round((one_minute / cores) * 100));
  }

  return { cores, model, usage_percent, load_average: { one_minute, five_minutes, fifteen_minutes } };
}

function getMemoryInfo() {
  const meminfo = readProcFile('/proc/meminfo');
  if (!meminfo) {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total_bytes: total, used_bytes: used, free_bytes: free, available_bytes: free,
      usage_percent: Math.round((used / total) * 1000) / 10,
      swap_total_bytes: 0, swap_used_bytes: 0, swap_usage_percent: 0,
    };
  }
  const val = (key) => { const m = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`)); return m ? parseInt(m[1]) * 1024 : 0; };
  const total = val('MemTotal'), free = val('MemFree'), available = val('MemAvailable') || free;
  const used = total - available;
  const swapTotal = val('SwapTotal'), swapFree = val('SwapFree'), swapUsed = swapTotal - swapFree;
  return {
    total_bytes: total, used_bytes: used, free_bytes: free, available_bytes: available,
    usage_percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
    swap_total_bytes: swapTotal, swap_used_bytes: swapUsed,
    swap_usage_percent: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0,
  };
}

function getDiskInfo() {
  try {
    const dfOutput = execSync('df -B1 -T 2>/dev/null || df -k 2>/dev/null', { encoding: 'utf8' });
    const lines = dfOutput.split('\n').slice(1);
    const disks = [];
    const seen = new Set();
    for (const line of lines) {
      const p = line.split(/\s+/);
      if (p.length < 6) continue;
      const dev = p[0];
      if (/^(tmpfs|devtmpfs|overlay|none|shm)/.test(dev) || dev.startsWith('/dev/loop')) continue;
      const isReal = /^\/dev\/(sd|nvme|vd|xvd)/.test(dev);
      let mp, fsType, total, used, avail;
      if (p.length >= 7) {
        fsType = p[1];
        total = +p[2];
        used = +p[3];
        avail = +p[4];
        mp = p[6];
      } else {
        fsType = 'unknown';
        total = +p[1] * 1024;
        used = +p[2] * 1024;
        avail = +p[3] * 1024;
        mp = p[5];
      }
      const relevant = mp === '/' || mp.startsWith('/home') || mp.startsWith('/var') || mp.startsWith('/data');
      if ((isReal || relevant) && !seen.has(dev)) {
        seen.add(dev);
        disks.push({ mount_point: mp, filesystem: fsType, total_bytes: total, used_bytes: used, available_bytes: avail, usage_percent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0 });
      }
    }
    return disks;
  } catch { return []; }
}

function getNetworkInfo() {
  const netDev = readProcFile('/proc/net/dev');
  if (!netDev) return [];
  const ifaces = [];
  for (const line of netDev.split('\n').slice(2)) {
    const m = line.match(/^\s*(\w+):\s*(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (m && m[1] !== 'lo' && !m[1].startsWith('veth') && !m[1].startsWith('br-') && !m[1].startsWith('docker')) {
      ifaces.push({ name: m[1], rx_bytes: +m[2], rx_packets: +m[3], rx_errors: +m[4], tx_bytes: +m[5], tx_packets: +m[6], tx_errors: +m[7] });
    }
  }
  return ifaces;
}

function getVpsHealthMetrics() {
  const alerts = [];
  const cpu = getCpuInfo();
  const memory = getMemoryInfo();
  const disks = getDiskInfo();
  const network = getNetworkInfo();
  const uptimeSec = os.uptime();
  const uptime = { uptime_seconds: Math.floor(uptimeSec), uptime_formatted: formatUptime(uptimeSec), boot_time: new Date(Date.now() - uptimeSec * 1000).toISOString() };
  const hostname = os.hostname();

  if (cpu.usage_percent >= THRESHOLDS.cpu.critical) alerts.push(`Critical: CPU at ${cpu.usage_percent}%`);
  else if (cpu.usage_percent >= THRESHOLDS.cpu.warning) alerts.push(`Warning: CPU at ${cpu.usage_percent}%`);
  if (memory.usage_percent >= THRESHOLDS.memory.critical) alerts.push(`Critical: Memory at ${memory.usage_percent}%`);
  else if (memory.usage_percent >= THRESHOLDS.memory.warning) alerts.push(`Warning: Memory at ${memory.usage_percent}%`);
  for (const d of disks) {
    if (d.usage_percent >= THRESHOLDS.disk.critical) alerts.push(`Critical: Disk ${d.mount_point} at ${d.usage_percent}%`);
    else if (d.usage_percent >= THRESHOLDS.disk.warning) alerts.push(`Warning: Disk ${d.mount_point} at ${d.usage_percent}%`);
  }

  let status = 'healthy';
  if (alerts.some(a => a.startsWith('Critical'))) status = 'critical';
  else if (alerts.some(a => a.startsWith('Warning'))) status = 'warning';

  return { timestamp: new Date().toISOString(), hostname, cpu, memory, disks, network, uptime, status, alerts };
}

async function getServicesHealth() {
  const services = [];
  // Check Express API
  services.push({ name: 'Express API', key: 'api', status: 'healthy', latency_ms: 0, last_checked: new Date().toISOString(), required: true, description: 'Main backend API' });
  // Check PostgreSQL
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    services.push({ name: 'PostgreSQL', key: 'postgres', status: 'healthy', latency_ms: Date.now() - start, last_checked: new Date().toISOString(), required: true, description: 'Primary database' });
  } catch (err) {
    services.push({ name: 'PostgreSQL', key: 'postgres', status: 'unhealthy', latency_ms: null, last_checked: new Date().toISOString(), error: err.message, required: true, description: 'Primary database' });
  }
  // Check Frontend (port 3000)
  try {
    const start = Date.now();
    const resp = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(3000) });
    services.push({ name: 'Next.js Frontend', key: 'frontend', status: resp.ok ? 'healthy' : 'degraded', latency_ms: Date.now() - start, last_checked: new Date().toISOString(), required: true, description: 'Frontend application' });
  } catch {
    services.push({ name: 'Next.js Frontend', key: 'frontend', status: 'unhealthy', latency_ms: null, last_checked: new Date().toISOString(), error: 'Connection refused', required: true, description: 'Frontend application' });
  }
  return services;
}

/**
 * GET /api/v1/admin/health/vps
 * VPS system health + service status
 */
router.get('/health/vps', async (req, res) => {
  try {
    const [services, vps] = await Promise.all([
      getServicesHealth(),
      Promise.resolve(getVpsHealthMetrics()),
    ]);
    const summary = {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      degraded: services.filter(s => s.status === 'degraded' || s.status === 'unknown').length,
    };
    res.json({ success: true, services, summary, vps, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Admin] VPS health error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/maintenance/normalize-legacy-dms', async (req, res) => {
  try {
    const workspaceId = req.body?.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await normalizeLegacyDmChannels(pool, {
      workspaceId,
      schema: SCHEMA,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Admin] Normalize legacy DMs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/maintenance/archive-technical-dms', async (req, res) => {
  try {
    const workspaceId = req.body?.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await archiveTechnicalDmChannels(pool, {
      workspaceId,
      schema: SCHEMA,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Admin] Archive technical DMs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
