'use strict';

// Load .env before anything else
require('dotenv').config();

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

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3001;

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
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Webhook-Secret', 'X-API-Key', 'X-Workspace-Id'],
}));

// ---------------------------------------------------------------------------
// 2. BODY PARSING
// ---------------------------------------------------------------------------

// Skip JSON parsing for Stripe webhook (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/v1/billing/webhook') return next();
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
  // Default workspace fallback
  if (!req.workspaceId) req.workspaceId = '00000000-0000-0000-0000-000000000001';
  next();
});

// ---------------------------------------------------------------------------
// 4. RATE LIMITING
// ---------------------------------------------------------------------------

const { globalLimiter, apiLimiter, llmLimiter, authLimiter } = require('./lib/rateLimiter');

app.use(globalLimiter);

// Auth middleware (API key + admin session)
app.use(require('./api/middleware/auth'));

// ---------------------------------------------------------------------------
// 5. STATIC ASSETS
// ---------------------------------------------------------------------------

app.use('/static', express.static(path.join(__dirname, 'public/static')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

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
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.body?.apiKey || req.body?.key || null;
    if (!secret) return res.status(401).json({ success: false, error: 'API key is required' });

    const pg = app.locals.pg;
    const keyHash = crypto.createHash('sha256').update(String(secret)).digest('hex');
    const DEFAULT_WS = '00000000-0000-0000-0000-000000000001';
    let workspaceId = DEFAULT_WS, nodeId = crypto.randomUUID(), authMethod = 'dev_mode';

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

// ── Nexus Task + Heartbeat endpoints (before auth middleware) ────────────────
app.get('/api/v1/nexus/:nodeId/tasks', async (req, res) => {
  try {
    const pg = app.locals.pg;
    if (!pg) return res.json({ success: true, tasks: [] });
    const result = await pg.query(
      `SELECT id, title, description, status, priority, metadata FROM tenant_vutler.tasks
       WHERE workspace_id = $1 AND status IN ('pending', 'assigned')
       ORDER BY priority DESC, created_at ASC LIMIT 10`,
      [req.query.workspace_id || '00000000-0000-0000-0000-000000000001']
    );
    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    console.error('[NEXUS] Get tasks error:', err.message);
    res.json({ success: true, tasks: [] });
  }
});

app.post('/api/v1/nexus/:nodeId/tasks/:taskId/status', async (req, res) => {
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

app.post('/api/v1/nexus/:nodeId/connect', async (req, res) => {
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

// Auth (with brute-force protection)
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
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

// Rate limiters for specific route groups
app.use('/api/v1/chat/send', llmLimiter);
app.use('/api/v1/llm', llmLimiter);
app.use('/api/v1', apiLimiter);

// Office routes (chat, drive, email, tasks, calendar, integrations)
mount('/api/v1', require('./packages/office/routes'));

// Agents routes (agents, nexus, marketplace, sandbox, swarm, llm, tools)
mount('/api/v1', require('./packages/agents/routes'));

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

    // BMAD auto-sync
    try {
      const BmadAutoSync = require('./services/bmadAutoSync');
      new BmadAutoSync().start();
      console.log('BMAD auto-sync started');
    } catch (_) {}

    // Start listening
    server.listen(port, '0.0.0.0', () => {
      console.log(`Vutler API listening on http://0.0.0.0:${port}`);
      console.log(`Health: http://localhost:${port}/api/v1/health`);
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down...`);
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

module.exports = { app, server };
