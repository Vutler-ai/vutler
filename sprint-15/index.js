/**
 * Vutler API Server
 * Standalone Express API for AI agent management, email, and chat
 */

const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
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
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Initialize Vutler API
 */
async function start() {
  console.log('🚀 Starting Vutler API server...');
  console.log('🔒 Security: Helmet + CORS + Rate Limiting enabled');
  
  try {
    // Connect to MongoDB
    const mongoUrl = process.env.MONGO_URL || 'mongodb://mongo:27017/vutler?replicaSet=rs0';
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const db = client.db();
    
    // Store DB connection in app locals for API routes
    app.locals.db = db;
    
    console.log('✅ MongoDB connected');
    app.locals.pg = require('./lib/vaultbrix');
    console.log('✅ Vaultbrix PG pool attached');
    
    // Create indexes for agent queries (ignore conflicts with existing indexes)
    try { await db.collection('users').createIndex({ type: 1 }); } catch(_) {}
    try { await db.collection('users').createIndex({ apiKey: 1 }); } catch(_) {}
    try { await db.collection('users').createIndex({ 'emails.address': 1 }, { unique: true, sparse: true }); } catch(_) {}
    
    console.log('✅ Database indexes created');
    
    // Load agent templates (seed data)
    loadTemplates().catch(err => {
      console.warn('⚠️  Failed to load templates (will retry next startup):', err.message);
    });
    
    // Mount custom API routes
    app.use('/api/v1/agents', agentsAPI);
    // MongoDB email routes (deprecated - using Vaultbrix)
    // app.use("/api/v1", emailBetaAPI);
    // app.use('/api/v1', emailAPI);
    app.use("/api/v1/email", emailVaultbrixAPI);
    app.use('/api/v1/chat', chatAPI);
    app.use('/api/v1', templatesAPI);
    app.use('/api/v1', llmAPI);
    app.use('/api/v1', usagePgAPI);  // PostgreSQL usage (replaces MongoDB)
    // app.use('/api/v1', usageAPI);  // old MongoDB usage
    app.use('/api/v1/drive', driveAPI);
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
    app.use("/api/v1/agents/sync", agentSyncAPI);  // No auth — agents use API key in body
    app.use("/api/v1/automations", automationsAPI);
    // Sprint 15 — Automation Engine routes
    const webhookRoutes = require('./api/webhook-routes');
    const automationLogsRoutes = require('./api/automation-logs-routes');
    app.use('/api/v1/webhooks', webhookRoutes);
    app.use('/api/v1/automations', automationLogsRoutes);
    app.use('/api/v1', runtimeAPI);
    
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
        db,
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
    
    // Health check endpoint
    app.get('/api/v1/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'vutler-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        security: {
          helmet: true,
          cors: true,
          rateLimit: '100 req/min'
        }
      });
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
      try { await client.close(); } catch (_) {}
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
app.get("/admin/marketplace", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "marketplace.html"));
});
app.get("/admin/activity", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "activity.html"));
});
app.get("/admin/onboarding", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "onboarding.html"));
});
  res.sendFile(path.join(__dirname, 'admin', 'usage.html'));
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
