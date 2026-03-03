/**
 * Vutler API Server
 * Standalone Express API for AI agent management, email, and chat
 */

// Load environment variables from .env file
try { require('dotenv').config(); } catch(e) {}

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
// WebSocket module (S4.3)
const { setupWebSocket, getStats: wsGetStats } = require('./api/websocket');

// Import custom APIs
const agentsAPI = require('./api/agents');
const emailAPI = require('./api/email');
const emailBetaAPI = require("./api/email-beta");
const emailVaultbrixAPI = require("./api/email-vaultbrix");
const chatAPI = require('./api/chat');
const templatesAPI = require('./api/templates');
const llmAPI = require('./api/llm');
const usageAPI = require('./api/usage');
const driveAPI = require('./api/drive');
const openclawAPI = require('./api/openclaw');
const runtimeAPI = require('./api/runtime');
const tasksAPI = require("./api/tasks");
const calendarAPI = require("./api/calendar");
const providersAPI = require("./api/providers");
const authMiddleware = require("./api/middleware/auth");
const settingsAPI = require("./api/settings");
const authAPI = require("./api/auth");
const dashboardAPI = require("./api/dashboard");
const automationsAPI = require("./api/automations");
const goalsAPI = require("./api/goals");
const emailsPgAPI = require("./api/emails");
const usagePgAPI = require("./api/usage-pg");
const agentSyncAPI = require("./api/agent-sync");
const { authenticateAgent, verifyApiKey } = require('./lib/auth');
const ImapPoller = require('./services/imapPoller');
const { loadTemplates } = require('./seeds/loadTemplates');

// Create Express app
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3001;

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet for HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://app.vutler.ai"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Webhook-Secret']
};
app.use(cors(corsOptions));

// Global rate limiting (100 req/min per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests',
    details: 'Maximum 100 requests per minute'
  }
});
app.use(globalLimiter);

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global auth middleware
app.use(authMiddleware);

/**
 * Initialize Vutler API
 */
async function start() {
  console.log('🚀 Starting Vutler API server...');
  console.log('🔒 Security: Helmet + CORS + Rate Limiting enabled');
  
  try {
    // Store DB connection in app locals for API routes
    app.locals.pg = require('./lib/vaultbrix');
    console.log('✅ Vaultbrix PG pool attached');
    
    // Create indexes for agent queries (ignore conflicts with existing indexes)
    
    console.log('✅ Database indexes created');
    
    // Load agent templates (seed data)
    loadTemplates().catch(err => {
      console.warn('⚠️  Failed to load templates (will retry next startup):', err.message);
    });
    
    // Mount custom API routes
    app.use('/api/v1/agents', agentsAPI);
    // Legacy email routes disabled (Vaultbrix-only)
    // app.use("/api/v1", emailBetaAPI);
    // app.use('/api/v1', emailAPI);
    app.use("/api/v1/email", emailVaultbrixAPI);
    app.use('/api/v1/chat', chatAPI);
    app.use('/api/v1', templatesAPI);
    app.use('/api/v1', llmAPI);
    app.use('/api/v1', usagePgAPI);  // PostgreSQL usage (replaces MongoDB)
    // app.use('/api/v1', usageAPI);  // old MongoDB usage
    app.use('/api/v1/drive', driveAPI);
    // VDrive (encrypted file storage)
    try {
      const vdriveAPI = require('./api/vdrive');
      app.use('/api/v1/vdrive', vdriveAPI);
      console.log('   - POST   /api/v1/vdrive/upload');
      console.log('   - GET    /api/v1/vdrive/files');
    } catch(e) {
      console.warn('[BOOT] VDrive API skip:', e.message);
    }
    app.use('/api/v1', openclawAPI);
    
// Default workspace fallback
app.use((req, res, next) => { if (!req.workspaceId) req.workspaceId = "00000000-0000-0000-0000-000000000001"; next(); });
app.use("/api/v1/tasks", tasksAPI);
    app.use("/api/v1/calendar", calendarAPI);
    app.use("/api/v1/providers", providersAPI);
    app.use("/api/v1/settings", settingsAPI);
    app.use("/api/v1/auth", authAPI);
    app.use("/api/v1/dashboard", dashboardAPI);
    app.use("/api/v1/goals", goalsAPI);
    app.use("/api/v1/emails", emailsPgAPI);
    app.use("/api/v1/agents/sync", agentSyncAPI);
    app.use("/api/v1/automations", automationsAPI);
    // Sprint 15 — Automation Engine routes
    const webhookRoutes = require('./api/webhook-routes');
    const automationLogsRoutes = require('./api/automation-logs-routes');
    app.use('/api/v1/webhooks', webhookRoutes);
    app.use('/api/v1/automations', automationLogsRoutes);
    app.use('/api/v1', runtimeAPI);
    
    // Additional routes for frontend
    const notificationsAPI = require('./api/notifications');
    const deploymentsAPI = require('./api/deployments');
    const clientsAPI = require('./api/clients');
    const sandboxAPI = require('./api/sandbox');
    const integrationsAPI = require('./api/integrations');
    const nexusAPI = require('./api/nexus');
    const marketplaceAPI = require('./api/marketplace');
    const auditLogsAPI = require('./api/audit-logs');
    
    app.use('/api/v1/notifications', notificationsAPI);
    app.use('/api/v1/deployments', deploymentsAPI);
    app.use('/api/v1/clients', clientsAPI);
    app.use('/api/v1/sandbox', sandboxAPI);
    app.use('/api/v1/integrations', integrationsAPI);
    app.use('/api/v1/nexus', nexusAPI);
    app.use('/api/v1/marketplace', marketplaceAPI);
    app.use('/api/v1/audit-logs', auditLogsAPI);
    
    console.log('✅ Additional APIs mounted:');
    console.log('   - GET    /api/v1/notifications');
    console.log('   - PUT    /api/v1/notifications/:id/read');
    console.log('   - GET    /api/v1/deployments');
    console.log('   - GET    /api/v1/clients');
    console.log('   - GET    /api/v1/sandbox');
    console.log('   - GET    /api/v1/integrations');
    console.log('   - GET    /api/v1/nexus/status');
    console.log('   - GET    /api/v1/marketplace/templates');
    console.log('   - GET    /api/v1/audit-logs');
    
    console.log('✅ Vutler APIs mounted:');
    console.log('   - POST   /api/v1/agents');
    console.log('   - GET    /api/v1/agents');
    console.log('   - GET    /api/v1/agents/:id');
    console.log('   - POST   /api/v1/agents/:id/rotate-key');
    console.log('   - POST   /api/v1/email/send');
    console.log('   - GET    /api/v1/email/sent');
    console.log('   - GET    /api/v1/email/inbox');
    console.log('   - PATCH  /api/v1/email/inbox/:id/read');
    console.log('   - POST   /api/v1/chat/send');
    console.log('   - GET    /api/v1/chat/channels');
    console.log('   - GET    /api/v1/chat/messages');
    console.log('   - GET    /api/v1/templates');
    console.log('   - GET    /api/v1/templates/:id');
    console.log('   - POST   /api/v1/agents/from-template');
    console.log('   - POST   /api/v1/agents/:id/chat');
    console.log('   - PUT    /api/v1/agents/:id/llm-config');
    console.log('   - GET    /api/v1/agents/:id/llm-config');
    console.log('   - POST   /api/v1/agents/:id/llm-test');
    console.log('   - GET    /api/v1/agents/:id/usage');
    console.log('   - GET    /api/v1/usage/summary');
    console.log('   - GET    /api/v1/usage/tiers');
    console.log('   - POST   /api/v1/drive/upload');
    console.log('   - GET    /api/v1/drive/files');
    console.log('   - GET    /api/v1/drive/download/:id');
    console.log('   - POST   /api/v1/agents/:id/start');
    console.log('   - POST   /api/v1/agents/:id/stop');
    console.log('   - GET    /api/v1/agents/:id/status');
    
    // Setup WebSocket (S4.3 — full real-time chat + LLM routing)
    setupWebSocket(server, app);
    // Sprint 15 — Chat Pro WebSocket
    try { const { setupChatWebSocket } = require("./api/ws-chat"); setupChatWebSocket(server, app); } catch(e) { console.warn("[BOOT] Chat WS skip:", e.message); }
    
    // WebSocket stats endpoint
    app.get('/api/v1/ws/stats', (req, res) => {
      res.json({ success: true, ws: wsGetStats() });
    });
    
    // ============================================================================
    // NEXUS LOCAL AGENT ENDPOINTS (for local agent web UI)
    // ============================================================================
    
    // GET /api/config - Nexus configuration
    app.get('/api/config', (req, res) => {
      res.json({
        cloudUrl: process.env.VUTLER_CLOUD_URL || 'app.vutler.ai',
        token: null, // Will be set if user pairs with cloud
        workspace: process.env.NEXUS_WORKSPACE || require('path').join(require('os').homedir(), '.vutler', 'workspace'),
        webPort: parseInt(process.env.NEXUS_PORT || '3939'),
        llm: {
          provider: process.env.LLM_PROVIDER || 'claude-code',
          model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
          apiKey: process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || null,
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
        },
        agent: {
          name: process.env.AGENT_NAME || 'Jarvis',
          systemPrompt: 'auto',
          contextFiles: ['SOUL.md', 'MEMORY.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md']
        },
        features: {
          webInterface: true,
          cloudSync: false,
          localChat: true,
          fileAccess: true,
          shellAccess: false
        }
      });
    });
    
    // POST /api/config - Update Nexus configuration
    app.post('/api/config', (req, res) => {
      // In production, this would save to a config file
      console.log('[NEXUS] Config update received:', req.body);
      res.json({ success: true, message: 'Configuration updated' });
    });
    
    // GET /api/status - Nexus status
    app.get('/api/status', (req, res) => {
      res.json({
        server: 'running',
        agent: {
          llmConfigured: !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY),
          llmProvider: process.env.LLM_PROVIDER || 'claude-code',
          systemPromptLoaded: true,
          conversationLength: 0
        },
        config: {
          agentName: process.env.AGENT_NAME || 'Jarvis',
          model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
          workspace: process.env.NEXUS_WORKSPACE || require('path').join(require('os').homedir(), '.vutler', 'workspace')
        },
        connections: 0
      });
    });
    
    // POST /api/test-connection - Test LLM connection
    app.post('/api/test-connection', async (req, res) => {
      try {
        const { provider, apiKey } = req.body;
        
        if (provider === 'claude-code') {
          const { exec } = require('child_process');
          exec('claude --version', (error) => {
            if (error) {
              res.json({ success: false, error: 'Claude CLI not found' });
            } else {
              res.json({ success: true, message: 'Claude CLI is available' });
            }
          });
        } else if (provider === 'openrouter' || provider === 'anthropic') {
          if (!apiKey) {
            return res.json({ success: false, error: 'API key required' });
          }
          // Simple validation - check format
          if (provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
            return res.json({ success: false, error: 'Invalid OpenRouter API key format' });
          }
          if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
            return res.json({ success: false, error: 'Invalid Anthropic API key format' });
          }
          res.json({ success: true, message: 'API key format looks valid' });
        } else {
          res.json({ success: true, message: 'Connection test passed' });
        }
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    
    // POST /api/chat - Nexus chat endpoint
    app.post('/api/chat', async (req, res) => {
      try {
        const { message, stream = false } = req.body;
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }
        
        // Simple echo response for now
        // In production, this would route to the actual LLM
        res.json({
          type: 'text',
          content: `Echo: ${message}`,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    
    // Start IMAP poller if configured
    if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS) {
      const imapConfig = {
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT || '993'),
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASS,
        tls: process.env.IMAP_TLS !== 'false',
        pollIntervalMinutes: parseInt(process.env.IMAP_POLL_INTERVAL || '5')
      };
      
      const poller = new ImapPoller(
        imapConfig,
        // db removed
        process.env.VUTLER_EMAIL_WEBHOOK_URL
      );
      
      poller.start().catch(err => {
        console.error('Failed to start IMAP poller:', err);
      });
      
      app.locals.imapPoller = poller;
      console.log('✅ IMAP poller configured');
    } else {
      console.log('⚠️  IMAP not configured (set IMAP_HOST, IMAP_USER, IMAP_PASS)');
    }
    
    // Health check endpoint (enhanced — tests DB connections)
    app.get('/api/v1/health', async (req, res) => {
      try {
        const pgOk = await (async () => { try { await app.locals.pg.query("SELECT 1"); return true; } catch { return false; } })();
        res.json({
          status: pgOk ? "healthy" : "degraded",
          service: "vutler-api",
          version: "1.1.0",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          db: { postgres: pgOk },
          endpoints: [
            "/api/v1/dashboard","/api/v1/tasks","/api/v1/calendar/events",
            "/api/v1/providers","/api/v1/settings","/api/v1/goals",
            "/api/v1/emails","/api/v1/automations","/api/v1/usage",
            "/api/v1/chat/channels","/api/v1/drive/files","/api/v1/agents",
            "/api/v1/templates","/api/v1/health","/api/v1/auth"
          ],
          security: { helmet: true, cors: true, rateLimit: "100 req/min" }
        });
      } catch(e) { res.status(500).json({ status: "error", error: e.message }); }
    });
    
    // Root endpoint — Landing page
    app.get('/', (req, res) => {
      res.sendFile(require('path').join(__dirname, 'admin', 'index.html'));
    });
    
    // Start server
    server.listen(port, '0.0.0.0', () => {
      console.log(`🎉 Vutler API listening on http://0.0.0.0:${port}`);
      // Sprint 15 — Init schedule triggers
      try { const { initSchedules } = require('./runtime/schedule-trigger'); const pool = require('./lib/vaultbrix'); initSchedules(pool); console.log('⏰ Schedule triggers initialized'); } catch(e) { console.warn('Schedule init skip:', e.message); }
      console.log(`   Health check: http://localhost:${port}/api/v1/health`);
      console.log(`   WebSocket: ws://localhost:${port}/ws`);
    });
    
    // Graceful shutdown
    async function gracefulShutdown(signal) {
      console.log(`${signal} received, shutting down gracefully...`);
      const wsModule = require('./api/websocket');
      if (wsModule.wsConnections) {
        for (const [, conn] of wsModule.wsConnections) {
          try { conn.ws.close(1001, 'Server shutting down'); } catch (_) {}
        }
      }
      try { await app.locals.pg?.end?.(); } catch (_) {}
      process.exit(0);
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to start Vutler API:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  start();
}


// Sprint 8.2 — Agent Chat
try { const agentChat = require('./api/routes/chat'); const authMW = require('./api/middleware/auth'); app.use('/api/v1/agents', authMW, agentChat); app.use('/api/agents', authMW, agentChat); console.log('[BOOT] Agent chat routes mounted'); } catch(e) { console.warn('[BOOT] Agent chat skip:', e.message); }

// ============================================================================
// ERROR HANDLING MIDDLEWARE (must be last)
// ============================================================================

// 404 handler - for undefined routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ 
      success: false, 
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  } else {
    // For non-API routes, continue to static file serving or 404 page
    next();
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  
  if (req.path.startsWith('/api/')) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    });
  } else {
    res.status(500).send('Internal Server Error');
  }
});

module.exports = { app, server };

// ============================================================================
// ADMIN UI — Static pages (S3.4 LLM Settings + S3.6 Usage Dashboard)
// Philip 🎨 — Sprint 3
// ============================================================================
const path = require('path');

// Serve admin static assets (CSS, JS)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Admin routes → serve corresponding HTML pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
app.get('/admin/agents', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'agents.html'));
});
app.get('/admin/templates', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'templates.html'));
});
app.get('/admin/llm-settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'llm-settings.html'));
});
app.get('/admin/usage', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'usage.html'));
});
app.get("/admin/marketplace", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "marketplace.html"));
});
app.get("/admin/activity", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "activity.html"));
});
app.get("/admin/onboarding", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "onboarding.html"));
});



// ============================================================================
// HEALTH CHECK
// ============================================================================
// OLD: app.get("/api/v1/dashboard", async (req, res) => {
// OLD:   try {
// OLD:     const agents = await db.collection("users").find({ type: "bot" }).count();
// OLD:     const users = await db.collection("users").find({ type: { $ne: "bot" } }).count();
// OLD:     res.json({ agents, users, messages: 0, uptime: process.uptime() });
// OLD:   } catch(e) { res.json({ agents: 0, users: 0, messages: 0, uptime: process.uptime() }); }
// OLD: });
app.get("/health", (req, res) => { res.json({ status: "ok", uptime: process.uptime() }); });

// ============================================================================
// LLM ROUTER + AGENT RUNTIME APIs (Sprint 7)
// ============================================================================
const llmRouter = require("./api/llm-router");
const agentRuntime = require("./api/agent-runtime");
const llmValidate = require("./api/llm-validate");

app.use("/api/llm", llmRouter);
app.use("/api/agents", agentRuntime);
// llm-validate routes are under /api/llm (router defines /validate internally)
app.use("/api/llm", llmValidate);

// Landing pages
app.use('/landing', express.static(path.join(__dirname, 'admin', 'landing')));
app.get('/landing', (req, res) => { res.sendFile(path.join(__dirname, 'admin', 'landing', 'index.html')); });
app.get("/landing/:page", (req, res) => {
  const page = req.params.page.replace(/[^a-z0-9-]/gi, "");
  const filePath = require("path").join(__dirname, "admin", "landing", page + ".html");
  res.sendFile(filePath, (err) => { if (err) res.status(404).send("Page not found"); });
});

// Login redirect
// Removed legacy login redirect });
app.get('/signup', (req, res) => { res.redirect('https://app.vutler.ai'); });

// Additional admin routes
app.get("/admin/agent-builder", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "agent-builder.html"));
});
app.get("/admin/agent-detail", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "agent-detail.html"));
});
app.get("/admin/providers", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "providers.html"));
});
app.get("/admin/calendar", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "calendar.html"));
});
app.get("/admin/drive", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "drive.html"));
});


// ============================================================================
// SPRINT 7.3 + 7.5 — Agent Memory + Agent Tools
// ============================================================================
const memoryAPI = require("./api/memory");
const toolsAPI = require("./api/tools");
app.use("/api/v1/memory", memoryAPI);
app.use("/api/v1/tools", toolsAPI);
console.log("✅ Sprint 7.3 Agent Memory + 7.5 Agent Tools mounted");


// Sprint 9.1 - JWT Auth
try {
  const jwtAuth = require('./api/auth/jwt-auth');
  app.use('/api/auth', jwtAuth);
  console.log('[BOOT] JWT auth mounted');
} catch(e) {
  console.warn('[BOOT] JWT auth skip:', e.message);
}

// Pixel Chat pages
const _pcPath = require('path');
app.get('/pixel-office', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'pixel-office.html')));
app.get('/app', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'app.html')));
app.get('/pixel-chat', (req, res) => res.sendFile(_pcPath.join(__dirname, 'admin', 'pixel-chat.html')));
app.get('/login', (req, res) => res.sendFile(_pcPath.join(__dirname, 'admin', 'login.html')));
app.get('/register', (req, res) => res.sendFile(_pcPath.join(__dirname, 'admin', 'register.html')));

app.get("/marketplace", (req, res) => res.sendFile(require("path").join(__dirname, "admin", "marketplace.html")));
app.get('/app-v3', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'app-v3.html')));
app.get('/app-v3', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'app-v3.html')));
app.get('/dashboard-v2', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'dashboard.html')));

// === Sprint 16-19 API Routes ===
try {
  const tasksV2 = require("./patches/s16-tasks-api");
  app.use("/api/v1/tasks-v2", tasksV2);
  console.log("[BOOT] S16 Tasks V2 API mounted");
} catch(e) { console.warn("[BOOT] S16 Tasks skip:", e.message); }

try {
  const calendarV2 = require("./patches/s17-calendar-api");
  app.use("/api/v1/calendar-v2", calendarV2);
  console.log("[BOOT] S17 Calendar V2 API mounted");
} catch(e) { console.warn("[BOOT] S17 Calendar skip:", e.message); }

try {
  const mailAPI = require("./patches/s18-mail-api");
  app.use("/api/v1/mail", mailAPI);
  console.log("[BOOT] S18 Mail API mounted");
} catch(e) { console.warn("[BOOT] S18 Mail skip:", e.message); }

try {
  const hybridAPI = require("./patches/s19-hybrid-gateway-api");
  app.use("/api/v1/hybrid", hybridAPI);
  console.log("[BOOT] S19 Hybrid Agents API mounted");
} catch(e) { console.warn("[BOOT] S19 Hybrid skip:", e.message); }
