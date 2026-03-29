'use strict';

// Load .env before anything else
require('dotenv').config();

// ── Security boot checks ───────────────────────────────────────────────────
const PLACEHOLDER_SECRETS = new Set(['secret', 'change-me', 'changeme', 'MISSING-SET-JWT_SECRET-ENV']);
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || PLACEHOLDER_SECRETS.has(process.env.JWT_SECRET)) {
    console.error('[FATAL] JWT_SECRET is not set or is a placeholder. Set a strong random secret before running in production.');
    process.exit(1);
  }
} else if (!process.env.JWT_SECRET || PLACEHOLDER_SECRETS.has(process.env.JWT_SECRET)) {
  console.warn('[WARN] JWT_SECRET is not set or is a placeholder. This is insecure — set JWT_SECRET in your .env file.');
}
// ──────────────────────────────────────────────────────────────────────────

/**
 * Vutler API Server — Monorepo Entry Point
 *
 * Mounts two product modules (Office + Agents) on a shared core.
 * Feature access controlled by workspace plan via featureGate middleware.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3001;

// Trust nginx reverse proxy (fixes X-Forwarded-For + rate limiter)
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// 1. SECURITY MIDDLEWARE
// ---------------------------------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", 'blob:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://app.vutler.ai', 'blob:'],
      frameSrc: ["'self'", 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,https://app.vutler.ai')
  .split(',').map(s => s.trim());

app.use(cors({
  origin(origin, cb) {
    // SECURITY: require explicit origin — no null origin bypass (audit 2026-03-28)
    if (origin && corsOrigins.includes(origin)) return cb(null, true);
    if (!origin) return cb(null, true); // server-to-server (no browser Origin header)
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Webhook-Secret', 'X-API-Key', 'X-Workspace-Id'],
}));

// ---------------------------------------------------------------------------
// 2. BODY PARSING
// ---------------------------------------------------------------------------

// Cookie parser — needed for OAuth CSRF state (audit 2026-03-29)
app.use(cookieParser());

// Skip JSON parsing for Stripe webhook (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/v1/billing/webhook' || req.originalUrl === '/api/v1/billing/webhooks/stripe') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// 3. JWT DECODE (global — sets req.user if valid token)
// ---------------------------------------------------------------------------

app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-auth-token'];
  if (token && token.startsWith('eyJ')) {
    try {
      const crypto = require('crypto');
      const [header, payload, sig] = token.split('.');
      const secret = process.env.JWT_SECRET || 'MISSING-SET-JWT_SECRET-ENV';
      const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
      if (sig === expected) {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!data.exp || data.exp > Math.floor(Date.now() / 1000)) {
          req.user = { id: data.userId, email: data.email, name: data.name, role: data.role, workspaceId: data.workspaceId };
          req.authType = 'jwt';
          req.workspaceId = data.workspaceId || '00000000-0000-0000-0000-000000000001';
        }
      }
    } catch (_) { /* invalid token — continue unauthenticated */ }
  }
  // SECURITY: do NOT set default workspace for unauthenticated requests (audit 2026-03-28)
  // req.workspaceId stays undefined if no valid JWT — routes must check explicitly
  next();
});

// ---------------------------------------------------------------------------
// 4. RATE LIMITING
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. STATIC ASSETS (BEFORE auth — public files)
// ---------------------------------------------------------------------------

app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const { globalLimiter, apiLimiter, llmLimiter, authLimiter } = require('./lib/rateLimiter');

app.use(globalLimiter);

// Snipara webhook receiver (before auth — uses HMAC signature verification)
app.use('/api/v1/webhooks/snipara', require('./api/sniparaWebhook'));

// Auth middleware (API key + admin session)
app.use(require('./api/middleware/auth'));

// Workspace plan — loaded inline by gateFeature, NOT global middleware
// (global async middleware was silently hanging on DB pool exhaustion)

// ---------------------------------------------------------------------------
// 6. CORE ROUTES (shared across all plans)
// ---------------------------------------------------------------------------

function mount(prefix, mod) {
  try {
    app.use(prefix, mod);
  } catch (e) {
    console.warn(`[BOOT] Skip ${prefix}: ${e.message}`);
  }
}

// ── Nexus Register (mounted early, before auth middleware) ──────────────────
app.post('/api/v1/nexus/register', async (req, res) => {
  try {
    const crypto = require('crypto');
    const pg = app.locals.pg;
    const DEFAULT_WS = '00000000-0000-0000-0000-000000000001';
    let workspaceId = DEFAULT_WS, nodeId = crypto.randomUUID(), authMethod = 'dev_mode';

    // ── Deploy token auth (Nexus-Local / Nexus-Enterprise) ──────────────────
    const deployToken = req.body?.deploy_token;
    if (deployToken) {
      const { validateToken } = require('./services/tokenService');
      const payload = validateToken(deployToken);
      if (!payload) return res.status(401).json({ success: false, error: 'Invalid or expired deploy token' });

      workspaceId = payload.workspace_id || DEFAULT_WS;
      nodeId = payload.node_id || nodeId;
      authMethod = `deploy_token_${payload.mode || 'unknown'}`;

      if (pg) {
        try {
          const tokenHash = crypto.createHash('sha256').update(deployToken).digest('hex');
          await pg.query(
            `UPDATE tenant_vutler.nexus_nodes SET status = 'online', last_heartbeat = NOW() WHERE id = $1 AND deploy_token_hash = $2`,
            [nodeId, tokenHash]
          );
        } catch (_) {}
      }

      console.log(`[NEXUS] Node registered via deploy token: ${req.body?.name || payload.node_id} (${nodeId}) [${authMethod}]`);
      return res.json({ success: true, message: 'Registered', nodeId, workspaceId, auth: authMethod, mode: payload.mode });
    }

    // ── API key auth (legacy / manual) ──────────────────────────────────────
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.body?.apiKey || req.body?.key || null;
    if (!secret) return res.status(401).json({ success: false, error: 'API key or deploy_token is required' });

    const keyHash = crypto.createHash('sha256').update(String(secret)).digest('hex');

    if (pg) {
      try {
        const keyResult = await pg.query(
          `SELECT id, workspace_id FROM tenant_vutler.workspace_api_keys WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1`,
          [keyHash]
        );
        if (keyResult.rows[0]) {
          workspaceId = keyResult.rows[0].workspace_id;
          authMethod = 'api_key';
          await pg.query(`UPDATE tenant_vutler.workspace_api_keys SET last_used_at = NOW() WHERE id = $1`, [keyResult.rows[0].id]);
        } else if (process.env.NODE_ENV === 'production') {
          return res.status(401).json({ success: false, error: 'Invalid API key' });
        }
        // Try to insert nexus node
        try {
          const { name = require('os').hostname(), type = 'local' } = req.body || {};
          const ins = await pg.query(
            `INSERT INTO tenant_vutler.nexus_nodes (workspace_id, name, type, status, agents_deployed) VALUES ($1, $2, $3, 'online', '[]'::jsonb) RETURNING id`,
            [workspaceId, name, type]
          );
          nodeId = ins.rows[0].id;
        } catch (_) {}
      } catch (dbErr) {
        if (process.env.NODE_ENV === 'production') throw dbErr;
        console.warn('[NEXUS] DB error in register, dev mode fallback:', dbErr.message);
      }
    }

    console.log(`[NEXUS] Node registered: ${req.body?.name || 'unnamed'} (${nodeId}) [${authMethod}]`);
    res.json({ success: true, message: 'Registered', nodeId, workspaceId, auth: authMethod });
  } catch (err) {
    console.error('[NEXUS] Register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Nexus Token Generation endpoints (require JWT auth — audit 2026-03-28) ───
app.post('/api/v1/nexus/tokens/local', async (req, res) => {
  // SECURITY: token generation requires authenticated user
  if (!req.user || req.authType !== 'jwt') {
    return res.status(401).json({ success: false, error: 'Authentication required to generate deploy tokens' });
  }
  const { agentId, permissions, llmConfig } = req.body;
  if (!agentId) return res.status(400).json({ success: false, error: 'agentId required' });

  const pg = app.locals.pg;
  const workspaceId = req.workspaceId;

  // Look up agent to get name and snipara instance ID
  let agentName = 'Unknown Agent';
  let sniparaInstanceId = agentId;
  if (pg) {
    try {
      const agent = await pg.query('SELECT name, id FROM tenant_vutler.agents WHERE id = $1', [agentId]);
      if (agent.rows[0]) agentName = agent.rows[0].name;
    } catch (_) {}
  }

  const { generateLocalToken } = require('./services/tokenService');
  const result = generateLocalToken({ agentId, agentName, workspaceId, sniparaInstanceId, permissions, llmConfig });

  // Pre-create node in DB
  if (pg) {
    try {
      await pg.query(
        `INSERT INTO tenant_vutler.nexus_nodes (id, workspace_id, name, mode, clone_source_agent_id, snipara_instance_id, status, deploy_token_hash)
         VALUES ($1, $2, $3, 'local', $4, $5, 'pending_activation', $6)`,
        [result.nodeId, workspaceId, agentName + ' (Local)', agentId, sniparaInstanceId,
         require('crypto').createHash('sha256').update(result.token).digest('hex')]
      );
    } catch (_) {}
  }

  res.json({ success: true, ...result, mode: 'local' });
});

app.post('/api/v1/nexus/tokens/enterprise', async (req, res) => {
  // SECURITY: token generation requires authenticated user
  if (!req.user || req.authType !== 'jwt') {
    return res.status(401).json({ success: false, error: 'Authentication required to generate deploy tokens' });
  }
  const { name, clientName, role, filesystemRoot, allowedDirs, permissions, shellConfig, offlineConfig } = req.body;
  if (!name || !clientName) return res.status(400).json({ success: false, error: 'name and clientName required' });

  const workspaceId = req.workspaceId;

  const { generateEnterpriseToken } = require('./services/tokenService');
  const result = generateEnterpriseToken({ name, clientName, workspaceId, role, filesystemRoot, allowedDirs, permissions, shellConfig, offlineConfig });

  const pg = app.locals.pg;
  if (pg) {
    try {
      const tokenPayload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString());
      await pg.query(
        `INSERT INTO tenant_vutler.nexus_nodes (id, workspace_id, name, mode, client_name, role, snipara_instance_id, filesystem_root, allowed_dirs, offline_config, status, deploy_token_hash)
         VALUES ($1, $2, $3, 'enterprise', $4, $5, $6, $7, $8::jsonb, $9::jsonb, 'pending_activation', $10)`,
        [result.nodeId, workspaceId, name, clientName, role || 'general', tokenPayload.snipara_instance_id,
         filesystemRoot || '/opt/' + clientName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
         JSON.stringify(allowedDirs || []), JSON.stringify(offlineConfig || {}),
         require('crypto').createHash('sha256').update(result.token).digest('hex')]
      );
    } catch (e) { console.warn('[NEXUS] Pre-create enterprise node failed:', e.message); }
  }

  res.json({ success: true, ...result, mode: 'enterprise', clientName });
});

// ── Nexus node auth middleware (deploy token or API key required) ─────────────
// SECURITY: all Nexus endpoints require authentication (audit 2026-03-28)
async function requireNexusAuth(req, res, next) {
  const pg = app.locals.pg;
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  // Already authenticated via JWT (from global decode above)?
  if (req.user && req.authType === 'jwt') return next();

  // Check deploy token in Authorization header
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.headers['x-api-key'];
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required (Bearer token or X-API-Key)' });

  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    // Check nexus_nodes deploy_token_hash
    const nodeResult = await pg.query(
      'SELECT id, workspace_id FROM tenant_vutler.nexus_nodes WHERE id = $1 AND deploy_token_hash = $2 AND status != $3',
      [req.params.nodeId, tokenHash, 'revoked']
    );
    if (nodeResult.rows[0]) {
      req.workspaceId = nodeResult.rows[0].workspace_id;
      return next();
    }

    // Check workspace_api_keys
    const keyResult = await pg.query(
      'SELECT workspace_id FROM tenant_vutler.workspace_api_keys WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1',
      [tokenHash]
    );
    if (keyResult.rows[0]) {
      req.workspaceId = keyResult.rows[0].workspace_id;
      return next();
    }

    return res.status(401).json({ success: false, error: 'Invalid deploy token or API key' });
  } catch (err) {
    console.error('[NEXUS] Auth check failed:', err.message);
    return res.status(500).json({ success: false, error: 'Auth verification failed' });
  }
}

// ── Nexus Task + Heartbeat endpoints (now require auth) ──────────────────────
app.get('/api/v1/nexus/:nodeId/tasks', requireNexusAuth, async (req, res) => {
  try {
    const pg = app.locals.pg;
    if (!pg) return res.json({ success: true, tasks: [] });
    // SECURITY: use authenticated workspace_id, not query param (audit 2026-03-28)
    const result = await pg.query(
      `SELECT id, title, description, status, priority, metadata FROM tenant_vutler.tasks
       WHERE workspace_id = $1 AND status IN ('pending', 'assigned')
       ORDER BY priority DESC, created_at ASC LIMIT 10`,
      [req.workspaceId]
    );
    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    console.error('[NEXUS] Get tasks error:', err.message);
    res.json({ success: true, tasks: [] });
  }
});

app.post('/api/v1/nexus/:nodeId/tasks/:taskId/status', requireNexusAuth, async (req, res) => {
  try {
    const { status, output, error: taskError } = req.body || {};
    const pg = app.locals.pg;
    if (!pg) return res.json({ success: true });

    const meta = {};
    if (output) meta.output = output;
    if (taskError) meta.error = taskError;

    await pg.query(
      `UPDATE tenant_vutler.tasks SET status = $1, metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $3`,
      [status, JSON.stringify(meta), req.params.taskId]
    );

    // If completed, try to sync back to Snipara
    if (status === 'completed') {
      try {
        const task = await pg.query(`SELECT snipara_task_id, swarm_task_id, title FROM tenant_vutler.tasks WHERE id = $1`, [req.params.taskId]);
        const row = task.rows[0];
        if (row?.swarm_task_id && app.locals.swarmCoordinator) {
          await app.locals.swarmCoordinator.completeTask(row.swarm_task_id, 'nexus', output || '');
          console.log(`[NEXUS] Task synced to Snipara: ${row.title}`);
        }
      } catch (_) {}
    }

    res.json({ success: true, task: { id: req.params.taskId, status } });
  } catch (err) {
    console.error('[NEXUS] Task status update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/nexus/:nodeId/connect', requireNexusAuth, async (req, res) => {
  try {
    const pg = app.locals.pg;
    if (pg) {
      await pg.query(
        `UPDATE tenant_vutler.nexus_nodes SET status = 'online', last_heartbeat = NOW() WHERE id = $1`,
        [req.params.nodeId]
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (_) { res.json({ success: true }); }
});

app.get('/api/v1/nexus/:nodeId/memory/recall', requireNexusAuth, async (req, res) => {
  try {
    const pg = app.locals.pg;
    const { q, scope, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'q parameter required' });

    // Look up node to get snipara_instance_id
    let instanceId = null;
    if (pg) {
      const node = await pg.query('SELECT snipara_instance_id, mode, role FROM tenant_vutler.nexus_nodes WHERE id = $1', [req.params.nodeId]);
      if (node.rows[0]) instanceId = node.rows[0].snipara_instance_id;
    }

    // Call Snipara via swarmCoordinator
    const coordinator = req.app.locals.swarmCoordinator;
    if (!coordinator?.sniparaCall) return res.json({ memories: [] });

    const result = await coordinator.sniparaCall('rlm_recall', {
      query: q,
      agent_id: instanceId,
      scope: scope || 'instance',
      limit: parseInt(limit) || 5
    });

    res.json({ success: true, memories: result || [] });
  } catch (err) {
    res.json({ success: true, memories: [] });
  }
});

app.post('/api/v1/nexus/:nodeId/memory/remember', requireNexusAuth, async (req, res) => {
  try {
    const { content, type, tags, importance } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const pg = app.locals.pg;
    let instanceId = null, role = 'general';
    if (pg) {
      const node = await pg.query('SELECT snipara_instance_id, role FROM tenant_vutler.nexus_nodes WHERE id = $1', [req.params.nodeId]);
      if (node.rows[0]) { instanceId = node.rows[0].snipara_instance_id; role = node.rows[0].role; }
    }

    const coordinator = req.app.locals.swarmCoordinator;
    if (!coordinator?.sniparaCall) return res.json({ success: false, error: 'Snipara not available' });

    // Store in instance scope
    await coordinator.sniparaCall('rlm_remember', {
      text: content,
      type: type || 'learning',
      importance: importance || 0.5,
      scope: 'instance',
      category: instanceId || req.params.nodeId,
      tags: tags || [],
      metadata: { source: 'nexus', node_id: req.params.nodeId, role }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Promotes a learning from instance → template scope (shared with all agents of same role)
app.post('/api/v1/nexus/:nodeId/memory/promote', requireNexusAuth, async (req, res) => {
  try {
    const { content, role: overrideRole } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const pg = app.locals.pg;
    let role = overrideRole || 'general';
    if (pg) {
      const node = await pg.query('SELECT role FROM tenant_vutler.nexus_nodes WHERE id = $1', [req.params.nodeId]);
      if (node.rows[0]) role = node.rows[0].role || role;
    }

    const coordinator = req.app.locals.swarmCoordinator;
    if (!coordinator?.sniparaCall) return res.json({ success: false, error: 'Snipara not available' });

    // Store in template scope — accessible by all agents with same role
    await coordinator.sniparaCall('rlm_remember', {
      text: content,
      type: 'learning',
      importance: 0.7,
      scope: 'project',
      category: 'template-' + role,
      tags: ['promoted', 'nexus', role],
      metadata: { source: 'nexus-promote', node_id: req.params.nodeId, role }
    });

    res.json({ success: true, promoted_to: 'template-' + role });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Returns the shared context docs (SOUL.md, MEMORY.md, USER.md) + template memories for this role
app.get('/api/v1/nexus/:nodeId/memory/context', requireNexusAuth, async (req, res) => {
  try {
    const pg = app.locals.pg;
    let role = 'general', instanceId = null;
    if (pg) {
      const node = await pg.query('SELECT snipara_instance_id, role FROM tenant_vutler.nexus_nodes WHERE id = $1', [req.params.nodeId]);
      if (node.rows[0]) { instanceId = node.rows[0].snipara_instance_id; role = node.rows[0].role; }
    }

    const coordinator = req.app.locals.swarmCoordinator;
    if (!coordinator?.sniparaCall) return res.json({ soul: '', memory: '', user: '', template: [] });

    // Load shared docs + template memories in parallel
    const [soul, memory, user, template] = await Promise.all([
      coordinator.sniparaCall('rlm_load_document', { path: 'agents/SOUL.md' }).catch(() => ''),
      coordinator.sniparaCall('rlm_load_document', { path: 'agents/MEMORY.md' }).catch(() => ''),
      coordinator.sniparaCall('rlm_load_document', { path: 'agents/USER.md' }).catch(() => ''),
      coordinator.sniparaCall('rlm_recall', { query: role + ' knowledge best practices', scope: 'project', category: 'template-' + role, limit: 10 }).catch(() => []),
    ]);

    res.json({ success: true, soul, memory, user, template, role });
  } catch (err) {
    res.json({ success: true, soul: '', memory: '', user: '', template: [] });
  }
});

// GET /api/v1/nexus/:nodeId/agent-config — sync agent personality for local mode
app.get('/api/v1/nexus/:nodeId/agent-config', requireNexusAuth, async (req, res) => {
  try {
    const pg = app.locals.pg;
    if (!pg) return res.json({ success: false, error: 'DB unavailable' });

    // Get node info
    const node = await pg.query(
      'SELECT mode, clone_source_agent_id, snipara_instance_id, role FROM tenant_vutler.nexus_nodes WHERE id = $1',
      [req.params.nodeId]
    );
    if (!node.rows[0]) return res.status(404).json({ error: 'Node not found' });

    const { mode, clone_source_agent_id, role } = node.rows[0];

    // For local mode: fetch the source agent's config
    let agentConfig = {};
    if (mode === 'local' && clone_source_agent_id) {
      const agent = await pg.query(
        'SELECT name, system_prompt, personality, model, tools FROM tenant_vutler.agents WHERE id = $1',
        [clone_source_agent_id]
      );
      if (agent.rows[0]) agentConfig = agent.rows[0];
    }

    // Load Snipara context if available
    let context = {};
    const coordinator = req.app.locals.swarmCoordinator;
    if (coordinator?.sniparaCall) {
      try {
        const [soul, memory, user] = await Promise.all([
          coordinator.sniparaCall('rlm_load_document', { path: 'agents/SOUL.md' }).catch(() => ''),
          coordinator.sniparaCall('rlm_load_document', { path: 'agents/MEMORY.md' }).catch(() => ''),
          coordinator.sniparaCall('rlm_load_document', { path: 'agents/USER.md' }).catch(() => ''),
        ]);
        context = { soul, memory, user };
      } catch (_) {}
    }

    res.json({ success: true, mode, role, agent: agentConfig, context });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auth (with brute-force protection — P1 audit 2026-03-28)
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/signup', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);
app.use('/api/v1/auth/reset-password', authLimiter);
app.use('/api/v1/admin/login', authLimiter);
mount('/api/v1/auth', require('./api/auth'));
try { mount('/api/auth', require('./api/auth/jwt-auth')); } catch (_) {}

// Health
app.get('/api/v1/health', async (req, res) => {
  try {
    const pg = app.locals.pg;
    const pgOk = await (async () => { try { await pg.query('SELECT 1'); return true; } catch { return false; } })();
    res.json({
      status: pgOk ? 'healthy' : 'degraded',
      service: 'vutler-api',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: { postgres: pgOk },
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Core APIs (available on all plans)
mount('/api/v1/settings', require('./api/settings'));
mount('/api/v1/onboarding', require('./api/onboarding'));
mount('/api/v1', require('./api/billing'));
mount('/api/v1', require('./api/usage-pg'));
mount('/api/v1/admin', require('./api/admin'));
mount('/api/v1/audit-logs', require('./api/audit-logs'));
mount('/api/v1/clients', require('./api/clients'));
mount('/api/v1/notifications', require('./api/notifications'));
mount('/api/v1/webhooks', require('./api/webhook-routes'));
mount('/api/v1/workspace', require('./api/workspace'));

// WebSocket stats
const { setupWebSocket, getStats: wsGetStats } = require('./api/websocket');
app.get('/api/v1/ws/stats', (req, res) => res.json({ success: true, ws: wsGetStats() }));

// ---------------------------------------------------------------------------
// 7. PRODUCT MODULES
// ---------------------------------------------------------------------------

// Office routes (chat, drive, email, tasks, calendar, integrations)
try { app.use('/api/v1', require('./packages/office/routes')); } catch (e) { console.warn('[BOOT] Office routes failed:', e.message); }

// Agents routes (agents, nexus, marketplace, sandbox, swarm, llm, tools)
try { app.use('/api/v1', require('./packages/agents/routes')); } catch (e) { console.warn('[BOOT] Agents routes failed:', e.message); }

// Direct mounts — api/ modules with relative paths (/, /:id)
try { app.use('/api/v1/tasks', require('./api/tasks')); } catch (_) {}
try { app.use('/api/v1/agents', require('./api/agents')); } catch (_) {}
try { app.use('/api/v1/calendar', require('./api/calendar')); } catch (_) {}
try { app.use('/api/v1/clients', require('./api/clients')); } catch (_) {}
try { app.use('/api/v1/goals', require('./api/goals')); } catch (_) {}
try { app.use('/api/v1/automations', require('./api/automations')); } catch (_) {}
try { app.use('/api/v1/analytics', require('./api/analytics-api')); } catch (_) {}
try { app.use('/api/v1/social-media', require('./api/social-media')); } catch (_) {}
// NOTE: email is served by packages/office/routes.js → app/custom/api/email.js
// The email-vaultbrix fallback is mounted at /email/vaultbrix in office routes.
// Memory routes — mounted at both /memory/* and /agents/:id/memories
try {
  const memoryRouter = require('./api/memory');
  app.use('/api/v1/memory', memoryRouter);  // /memory/workspace-knowledge, /memory/templates, /memory/search
  app.use('/api/v1', memoryRouter);          // /agents/:id/memories, /promote
} catch (e) { console.warn('[BOOT] Memory routes failed:', e.message); }

// Rate limiters AFTER route mounts (won't block route matching)
app.use('/api/v1/chat/send', llmLimiter);
app.use('/api/v1/llm', llmLimiter);

// ---------------------------------------------------------------------------
// 8. LANDING & REDIRECTS
// ---------------------------------------------------------------------------

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.use('/landing', express.static(path.join(__dirname, 'admin', 'landing')));
app.get('/signup', (req, res) => res.redirect('https://app.vutler.ai'));

// ---------------------------------------------------------------------------
// 9. STARTUP
// ---------------------------------------------------------------------------

async function start() {
  console.log('Starting Vutler API server...');

  try {
    // Database
    app.locals.pg = require('./lib/vaultbrix');
    console.log('Vaultbrix PG pool attached');

    // Chat runtime
    const ChatRuntime = require('./app/custom/services/chatRuntime');
    const chatRuntime = typeof ChatRuntime === 'function' ? new ChatRuntime(app.locals.pg) : ChatRuntime;
    if (chatRuntime?.start) chatRuntime.start();
    app.locals.chatRuntime = chatRuntime;

    // Swarm coordinator
    try {
      const { getSwarmCoordinator } = require('./services/swarmCoordinator');
      app.locals.swarmCoordinator = getSwarmCoordinator();
      await app.locals.swarmCoordinator.init();
      console.log('Swarm coordinator initialized');
    } catch (e) {
      console.warn('[BOOT] Swarm coordinator skipped:', e.message);
    }

    // Template seeds
    const { loadTemplates } = require('./seeds/loadTemplates');
    loadTemplates().catch(err => console.warn('Template load failed:', err.message));

    // Dispatch Router (mobile dispatch — cloud sandbox → local daemon)
    try {
      const { getDispatchRouter } = require('./services/dispatchRouter');
      app.locals.dispatchRouter = getDispatchRouter(app);
      console.log('Dispatch router initialized');
    } catch (e) {
      console.warn('[BOOT] Dispatch router skipped:', e.message);
    }

    // WebSocket
    setupWebSocket(server, app);
    try { const { setupChatWebSocket } = require('./api/ws-chat'); setupChatWebSocket(server, app); } catch (_) {}

    // IMAP Poller
    if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS) {
      const ImapPoller = require('./services/imapPoller');
      const poller = new ImapPoller({
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT || '993'),
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASS,
        tls: process.env.IMAP_TLS !== 'false',
        pollIntervalMinutes: parseInt(process.env.IMAP_POLL_INTERVAL || '5'),
      }, process.env.VUTLER_EMAIL_WEBHOOK_URL);
      poller.start().catch(err => console.error('IMAP poller error:', err));
      app.locals.imapPoller = poller;
      console.log('IMAP poller started');
    }

    // Schedule triggers
    try {
      const { initSchedules } = require('./runtime/schedule-trigger');
      initSchedules(app.locals.pg);
      console.log('Schedule triggers initialized');
    } catch (_) {}

    // BMAD auto-sync — only start if the docs directory exists
    try {
      if (fs.existsSync('./docs/bmad/BMAD_MASTER.md')) {
        const BmadAutoSync = require('./services/bmadAutoSync');
        new BmadAutoSync().start();
        console.log('BMAD auto-sync started');
      }
    } catch (_) {}

    // Start listening
    server.listen(port, '0.0.0.0', () => {
      console.log(`Vutler API listening on http://0.0.0.0:${port}`);
      console.log(`Health: http://localhost:${port}/api/v1/health`);
    });

    // Start watchdog for stalled task detection
    const { getWatchdog } = require('./services/watchdog');
    const watchdog = getWatchdog();
    watchdog.start();

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down...`);
      watchdog.stop();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start Vutler API:', error);
    process.exit(1);
  }
}

if (require.main === module) start();

// ── Global error handler — sanitize error responses (P2 audit 2026-03-28) ────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, error: 'CORS policy violation' });
  }
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

module.exports = { app, server };
