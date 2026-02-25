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
const chatAPI = require('./api/chat');
const templatesAPI = require('./api/templates');
const templatesMarketplaceAPI = require("./api/templates-marketplace");
const llmAPI = require('./api/llm');
const usageAPI = require('./api/usage');
const driveAPI = require('./api/drive');
const openclawAPI = require('./api/openclaw');
const runtimeAPI = require('./api/runtime');
const workspaceAPI = require("./api/workspace");
const sniparaAPI   = require("./api/snipara");
const knowledgeAPI  = require("./api/knowledge");  // Agent Knowledge Bases
const connectAPI   = require("./api/connect");
const webhookAPI   = require("./api/webhook");    // S8.5 — Webhook Integration
const onboardingAPI = require("./api/onboarding"); // S9.5 — Onboarding API
const { checkConnection: pgCheck } = require('./lib/postgres');
const { authenticateAgent, verifyApiKey } = require('./lib/auth');
const ImapPoller = require('./services/imapPoller');
const { loadTemplates } = require('./seeds/loadTemplates');
// Sprint 6 — new modules
const rcChannelsAPI  = require('./api/rcChannels');
const agentEmailAPI  = require('./api/agentEmail');
const healthAPI      = require('./api/health');
const toolsAPI       = require('./api/tools');       // S11.2 — Agent Tools Framework
const memoryAPI      = require('./api/memory');       // Agent Memory (Snipara)
const adminAPI       = require('./api/admin');        // S12 — Admin Dashboard
// Sprint 11 — E2E + VDrive + GitHub Connector
const cryptoAPI = require("./api/crypto");
const driveChatAPI = require("./api/drive-chat");
const githubAPI = require("./api/github");
const billingAPI = require("./api/billing");        // Stripe Billing Integration
const analyticsAPI = require("./api/analytics-api");
const signaturesAPI = require("./api/signatures");
const sniparaWebhookAPI = require("./api/sniparaWebhook"); // Snipara Webhook
const sniparaAdminAPI = require("./api/sniparaAdmin"); // Snipara Client Provisioning
const { vchatAPI } = require("./api/vchat");
const provisioningAPI = require("./api/provisioning"); // S8.3 — Workspace Provisioning
const AgentRuntime   = require('./services/agentRuntime');
const { requestLogger, setupErrorHandlers } = require('./lib/logger');
const { configureSwagger } = require('./services/swagger'); // S11.4 — API Documentation

// ============================================================================
// RUNTIME V3 — NEW AGENT PROCESS MANAGER INTEGRATION (S11.5)
// ============================================================================
const AgentProcessManager = require('./services/agentManager');   // APM Core
const ToolRegistry = require('./services/toolRegistry');         // Tool Registry
const AgentBus = require('./services/agentBus');                // Redis Bus
const LocalAgentService = require('./services/localAgent');     // Local WS
const SkillSystem = require('./services/skillSystem');          // Skills

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
      scriptSrcAttr: null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Auth-Token', 'X-User-Id', 'X-Workspace-Id']
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
    error: 'Rate limit exceeded. Please try again later.',
    retryAfter: 60
  }
});
app.use(globalLimiter);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json({ limit: '100mb' })); // S4.1 — large payloads for file uploads
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request logging middleware
app.use(requestLogger);

// Auth middleware (applied to all routes)
app.use((req, res, next) => {
  req.user = { id: 'default', workspace: 'default' }; // TODO: real auth
  next();
});

// DB middleware (pass db to all routes)
app.use((req, res, next) => {
  req.db = app.locals.db;
  next();
});

// ============================================================================
// STARTUP FUNCTION
// ============================================================================

async function startVutlerAPI() {
  try {
    console.log('🚀 Starting Vutler API...');
    
    // Check PostgreSQL connection first
    await pgCheck();
    console.log('✅ PostgreSQL connected');

    // ========================================================================
    // MONGODB CONNECTION (kept for compatibility)
    // ========================================================================
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vutler';
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db();
    app.locals.db = db;
    app.locals.mongoClient = client; // Store client for cleanup
    console.log('✅ MongoDB connected');

    // Load templates
    await loadTemplates(db);

    // Swagger documentation
    configureSwagger(app);

    // ========================================================================
    // RUNTIME V3 INITIALIZATION (S11.5) — NEW APM SYSTEM
    // ========================================================================
    console.log('🔧 Initializing Runtime v3 components...');

    // 1. Initialize Tool Registry
    const toolRegistry = new ToolRegistry();
    await toolRegistry.initialize();
    app.locals.toolRegistry = toolRegistry;
    console.log(`✅ Tool Registry initialized with ${toolRegistry.tools.size} tools`);

    // 2. Initialize Agent Process Manager (APM)
    const agentProcessManager = new AgentProcessManager();
    app.locals.agentProcessManager = agentProcessManager;
    console.log('✅ Agent Process Manager (APM) initialized');

    // 3. Initialize Agent Bus (Redis)
    const agentBus = new AgentBus();
    await agentBus.initialize();
    app.locals.agentBus = agentBus;
    console.log('✅ Agent Bus (Redis) initialized');

    // 4. Initialize Skill System
    const skillSystem = new SkillSystem();
    await skillSystem.initialize();
    app.locals.skillSystem = skillSystem;
    console.log('✅ Skill System initialized');

    // 5. Initialize Local Agent WebSocket Service  
    const localAgentService = new LocalAgentService();
    await localAgentService.start();
    app.locals.localAgentService = localAgentService;
    console.log('✅ Local Agent WebSocket Service started');

    // 6. Load and start active agents from database
    await loadAndStartAgents();

    // ========================================================================
    // API ROUTES
    // ========================================================================
    app.use('/api/v1', agentsAPI);
    app.use('/api/v1', emailAPI);
    app.use('/api/v1', chatAPI);
    app.use('/api/v1', templatesAPI);
    app.use('/api/v1', templatesMarketplaceAPI);
    app.use('/api/v1', llmAPI);
    app.use('/api/v1', usageAPI);
    app.use('/api/v1', driveAPI);
    app.use('/api/v1', openclawAPI);
    app.use('/api/v1', runtimeAPI);
    app.use('/api/v1', workspaceAPI);
    app.use('/api/v1', toolsAPI);       // S11.2 — Agent Tools Framework
    app.use('/api/v1', memoryAPI);       // Agent Memory (Snipara)
    app.use('/api/v1', adminAPI);       // S12 — Admin Dashboard
    app.use("/api/v1", billingAPI);       // Stripe Billing Integration
    app.use('/api/v1', analyticsAPI);
    app.use('/api/v1', signaturesAPI);
    app.use("/api/v1", sniparaWebhookAPI); // Snipara Webhook
    app.use("/api/v1", sniparaAdminAPI);
    vchatAPI(app); // Vchat Bridge
    app.use('/api/v1', sniparaAPI);   // S5.5 — Snipara Integration
    app.use("/api/v1", knowledgeAPI);   // Agent Knowledge Bases
    app.use('/api/v1', connectAPI);   // S5.6 — Vutler Connect
    app.use('/api/v1', rcChannelsAPI); // S6.1 — RC Channel Assignments + Runtime Control
    app.use('/api/v1', agentEmailAPI); // S6.5 — Agent Email Config
    app.use('/api/v1', healthAPI);     // S6.7 — Health Dashboard
    app.use('/api/v1', webhookAPI);   // S8.5 — Webhook Integration
    // Sprint 11 — E2E Encryption + VDrive Chat + GitHub Connector
    app.use("/api/v1/crypto", cryptoAPI);         // E2E encryption endpoints
    app.use("/api/v1/vdrive", driveChatAPI);      // VDrive-Chat integration
    app.use("/api/v1/github", githubAPI);         // GitHub connector
    app.use("/api/v1/onboarding", onboardingAPI); // S9.5 — Onboarding API
    
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
    console.log('   - GET    /api/v1/workspace/llm-providers');
    console.log('   - POST   /api/v1/workspace/llm-providers');
    console.log('   - PUT    /api/v1/workspace/llm-providers/:id');
    console.log('   - DELETE /api/v1/workspace/llm-providers/:id');
    console.log('   - GET    /api/v1/agents/:id/model');
    console.log('   - PUT    /api/v1/agents/:id/model');
    console.log('🔄 Runtime v3: /local-agent WebSocket endpoint');
    
    // Setup WebSocket (S4.3 — full real-time chat + LLM routing)
    setupWebSocket(server, app);
    
    // ========================================================================
    // LEGACY AGENT RUNTIME (S6.1) — WITH APM INTEGRATION
    // ========================================================================
    const agentRuntime = new AgentRuntime(db, app, app.locals.agentProcessManager);
    app.locals.agentRuntime = agentRuntime;
    app.locals.runtime = agentRuntime;
    // Expose provisioning for API endpoints
    app.locals.provisioning = agentRuntime.provisioning;
    agentRuntime.start().catch(err =>
      console.error('[Runtime] Startup error:', err.message)
    );

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
    
    // Health endpoints now handled by api/health.js (S6.7)
    
    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        service: 'Vutler API',
        version: '1.0.0',
        docs: 'See README.md for API documentation',
        runtime: 'v3-active'
      });
    });
    
    // Start server
    server.listen(port, '0.0.0.0', () => {
      console.log(`🎉 Vutler API listening on http://0.0.0.0:${port}`);
      console.log(`   Health check: http://localhost:${port}/api/v1/health`);
      console.log(`   WebSocket: ws://localhost:${port}/ws`);
      console.log(`   Local Agent WS: ws://localhost:${localAgentService.config.port}/local-agent`);
      console.log('🚀 Runtime v3 ACTIVATED - Real agents are online!');
    });
    
    // Graceful shutdown
    async function gracefulShutdown(signal) {
      console.log(`${signal} received, shutting down gracefully...`);
      
      // Shutdown APM agents first
      if (app.locals.agentProcessManager) {
        await app.locals.agentProcessManager.shutdown();
      }
      
      // Close WebSocket connections
      const wsModule = require('./api/websocket');
      if (wsModule.wsConnections) {
        for (const [, conn] of wsModule.wsConnections) {
          try { conn.ws.close(1001, 'Server shutting down'); } catch (_) {}
        }
      }
      
      // Close local agent service
      if (app.locals.localAgentService) {
        await app.locals.localAgentService.stop();
      }
      
      // Close Redis bus
      if (app.locals.agentBus) {
        await app.locals.agentBus.disconnect();
      }
      
      // Close databases
      try { await client.close(); } catch (_) {}
      const { closePool } = require('./lib/postgres');
      try { await closePool(); } catch (_) {}
      
      process.exit(0);
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to start Vutler API:', error);
    process.exit(1);
  }
}

// ============================================================================
// RUNTIME V3 AGENT LOADING AND TOOL ASSIGNMENT
// ============================================================================

async function loadAndStartAgents() {
  try {
    console.log('📋 Loading active agents from database...');
    
    const { pool } = require('./lib/postgres');
    
    // Get all active agents
    const agentsResult = await pool.query(`
      SELECT id, display_name, llm_model, llm_provider, personality, system_prompt 
      FROM agents 
      WHERE status = 'active'
      ORDER BY created_at
    `);
    
    console.log(`   Found ${agentsResult.rows.length} active agents`);
    
    // Assign default tools to agents
    await assignDefaultTools(agentsResult.rows);
    
    // Start agents in APM
    for (const agent of agentsResult.rows) {
      const agentConfig = {
        id: agent.id,
        displayName: agent.display_name,
        llmModel: agent.llm_model,
        llmProvider: agent.llm_provider,
        personality: agent.personality,
        systemPrompt: agent.system_prompt
      };
      
      await app.locals.agentProcessManager.startAgent(agent.id, agentConfig);
      console.log(`   ✅ Started agent: ${agent.display_name} (${agent.id})`);
    }
    
    console.log('🎯 All active agents loaded and started in Runtime v3');
    
  } catch (error) {
    console.error('❌ Failed to load agents:', error);
    throw error;
  }
}

async function assignDefaultTools(agents) {
  try {
    console.log('🛠️  Assigning default tools to agents...');
    
    const { pool } = require('./lib/postgres');
    
    for (const agent of agents) {
      // Default tools for ALL agents
      const defaultTools = ['knowledge', 'memory', 'email'];
      
      // Special tools based on agent name/role
      if (agent.display_name === 'Mike') {
        defaultTools.push('shell'); // Shell access for Mike
      }
      
      if (['Luna', 'Andrea'].includes(agent.display_name)) {
        defaultTools.push('drive', 'webhook'); // Drive & webhook for Luna/Andrea
      }
      
      // Insert tools (ignore if already exists)
      for (const toolName of defaultTools) {
        await pool.query(`
          INSERT INTO agent_tools (agent_id, tool_name, enabled, config)
          VALUES ($1, $2, true, '{}')
          ON CONFLICT (agent_id, tool_name) DO NOTHING
        `, [agent.id, toolName]);
      }
      
      console.log(`   🔧 ${agent.display_name}: ${defaultTools.join(', ')}`);
    }
    
    console.log('✅ Default tools assigned successfully');
    
  } catch (error) {
    console.error('❌ Failed to assign tools:', error);
    throw error;
  }
}

// S6.7 — Structured error tracking
setupErrorHandlers();

// Start the server
startVutlerAPI();
