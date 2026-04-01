/**
 * Vutler Custom Extensions Entry Point
 * Loads all custom APIs and integrations into Rocket.Chat
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Import custom APIs
const agentsAPI = require('./api/agents');
const emailAPI = require('./api/email');
const chatAPI = require('./api/chat');
const llmAPI = require('./api/llm');
const usageAPI = require('./api/usage');
const runtimeAPI = require('./api/runtime');
const driveAPI = require('./api/drive-s3');
const uiPackAPI = require('./api/ui-pack');
const tasksV2API = require('./api/tasks-v2');
const memoryAPI = require('./api/memory');
const toolsAPI = require('./api/tools');
const nexusAPI = require('./api/nexus');
const marketplaceAPI = require('./api/marketplace');
const adminAPI = require("./api/admin");
const swarmAPI = require('./api/swarm');
const vaultAPI = require('../../api/vault');
const { authenticateAgent } = require('./lib/auth');
const ImapPoller = require('./services/imapPoller');
const { getSwarmCoordinator } = require('./services/swarmCoordinator');

/**
 * Initialize Vutler custom extensions
 */
async function initializeVutler(app, httpServer) {
  console.log('🚀 Initializing Vutler extensions...');
  
  try {
    // ===================
    // Trust proxy for correct IP detection behind nginx
    app.set('trust proxy', 1);

    // SECURITY MIDDLEWARE
    // ===================
    
    // Helmet - Secure HTTP headers
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
    
    // CORS - Allow cross-origin requests from configured origins
    const corsOptions = {
      origin: process.env.VUTLER_CORS_ORIGIN?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    };
    app.use(cors(corsOptions));
    
    // Rate Limiting - Global limit for all API endpoints
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.VUTLER_RATE_LIMIT_MAX || '100'),
      message: {
        success: false,
        error: 'Too many requests',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/api/v1/health';
      }
    });
    // app.use('/api/v1', apiLimiter); // DISABLED for beta
    
    // Stricter rate limit for sensitive endpoints
    const strictLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: parseInt(process.env.VUTLER_STRICT_RATE_LIMIT || '10'),
      message: {
        success: false,
        error: 'Too many requests to sensitive endpoint',
        retryAfter: '1 minute'
      }
    });
    
    console.log('✅ Security middleware configured');
    
    // MongoDB removed - using Vaultbrix PG only
    console.log('[BOOT] MongoDB removed — using Vaultbrix PG only');
    
    // Store strictLimiter in app locals for API routes
    app.locals.strictLimiter = strictLimiter;
    app.locals.swarmCoordinator = getSwarmCoordinator();
    await app.locals.swarmCoordinator.init();
    
    // ===================
    // WEBSOCKET CHAT (simplified, no MongoDB dependency)
    // ===================
    
    if (httpServer) {
      const { Server } = require('socket.io');
      const io = new Server(httpServer, {
        cors: corsOptions,
        path: '/socket.io/',
        transports: ['websocket', 'polling']
      });
      
      // WebSocket authentication middleware - simplified
      io.use(async (socket, next) => {
        try {
          const token = socket.handshake.auth.token || socket.handshake.query.token;
          
          if (!token) {
            return next(new Error('Authentication token required'));
          }
          
          // Simplified auth - just validate token format
          // In production, this should validate against PG
          socket.agentId = 'agent_' + token.substring(0, 16);
          socket.agentName = 'Agent';
          
          next();
        } catch (error) {
          console.error('WebSocket auth error:', error);
          next(new Error('Authentication failed'));
        }
      });
      
      // Handle connections
      io.on('connection', (socket) => {
        console.log(`✅ WebSocket connected: ${socket.agentName} (${socket.agentId})`);
        
        // Join agent-specific room
        socket.join(`agent:${socket.agentId}`);
        
        // Handle chat message (simplified)
        socket.on('chat:message', async (data) => {
          try {
            const { channelId, text, attachments } = data;
            
            if (!channelId || !text) {
              socket.emit('error', { message: 'channelId and text are required' });
              return;
            }
            
            // Create message (no MongoDB, in-memory only)
            const message = {
              id: generateMessageId(),
              rid: channelId,
              msg: text,
              ts: new Date(),
              u: {
                _id: socket.agentId,
                username: socket.agentName.toLowerCase().replace(/\s+/g, '_'),
                name: socket.agentName
              },
              attachments: attachments || []
            };
            
            // Broadcast to channel
            io.to(`channel:${channelId}`).emit('chat:message', {
              id: message.id,
              channelId,
              text,
              sender: {
                id: socket.agentId,
                name: socket.agentName
              },
              timestamp: message.ts,
              attachments: message.attachments
            });
            
            // Acknowledge to sender
            socket.emit('chat:message:sent', {
              id: message.id,
              channelId,
              timestamp: message.ts
            });
            
          } catch (error) {
            console.error('WebSocket message error:', error);
            socket.emit('error', { message: error.message });
          }
        });
        
        // Handle channel join
        socket.on('chat:join', async (data) => {
          try {
            const { channelId } = data;
            
            if (!channelId) {
              socket.emit('error', { message: 'channelId is required' });
              return;
            }
            
            // Join channel room
            socket.join(`channel:${channelId}`);
            
            socket.emit('chat:joined', {
              channelId,
              channelName: channelId
            });
            
          } catch (error) {
            console.error('WebSocket join error:', error);
            socket.emit('error', { message: error.message });
          }
        });
        
        // Handle channel leave
        socket.on('chat:leave', (data) => {
          const { channelId } = data;
          if (channelId) {
            socket.leave(`channel:${channelId}`);
            socket.emit('chat:left', { channelId });
          }
        });
        
        // Handle disconnect
        socket.on('disconnect', () => {
          console.log(`🔌 WebSocket disconnected: ${socket.agentName}`);
        });
      });
      
      app.locals.io = io;
      console.log('✅ WebSocket server initialized');
    } else {
      console.log('⚠️  WebSocket not initialized (httpServer not provided)');
    }
    
    // Mount custom API routes
    app.use('/api/v1', agentsAPI);
    app.use('/api/v1', emailAPI);
    app.use('/api/v1', chatAPI);
    app.use('/api/v1', llmAPI);
    app.use('/api/v1', usageAPI);
    app.use('/api/v1', runtimeAPI);
    app.use('/api/v1/drive', driveAPI);
    app.use('/api/v1', uiPackAPI);
    app.use('/api/v1', tasksV2API);
    app.use('/api/v1', memoryAPI);
    app.use('/api/v1', toolsAPI);
    app.use('/api/v1', nexusAPI);
    app.use('/api/v1', marketplaceAPI);
    app.use('/api/v1/swarm', swarmAPI);
    app.use('/api/v1', vaultAPI);
    // Admin API & page
    app.use("/api/v1/admin", adminAPI);
    const path = require("path");
    app.get("/admin/users", (req, res) => res.sendFile(path.join(__dirname, "admin/users.html")));
    
    console.log('✅ Vutler APIs mounted:');
    console.log('   - POST   /api/v1/agents');
    console.log('   - GET    /api/v1/agents');
    console.log('   - GET    /api/v1/agents/:id');
    console.log('   - POST   /api/v1/email/send');
    console.log('   - GET    /api/v1/email/sent');
    console.log('   - GET    /api/v1/email/inbox');
    console.log('   - PATCH  /api/v1/email/inbox/:id/read');
    console.log('   - POST   /api/v1/chat/send');
    console.log('   - GET    /api/v1/chat/channels');
    console.log('   - GET    /api/v1/chat/messages');
    console.log('   - POST   /api/v1/agents/:id/chat');
    console.log('   - POST   /api/v1/agents/:id/llm/config');
    console.log('   - GET    /api/v1/agents/:id/llm/config');
    console.log('   - GET    /api/v1/llm/models');
    console.log('   - GET    /api/v1/agents/:id/usage');
    console.log('   - GET    /api/v1/usage/summary');
    console.log('   - POST   /api/v1/agents/:id/start');
    console.log('   - POST   /api/v1/agents/:id/stop');
    console.log('   - GET    /api/v1/agents/:id/health');
    console.log('   - GET    /api/v1/agents/:id/runtime');
    console.log('   - GET    /api/v1/agents/runtime');
    console.log('   - POST   /api/v1/drive/upload');
    console.log('   - GET    /api/v1/drive/files');
    console.log('   - GET    /api/v1/drive/download/:id');
    console.log('   - POST   /api/v1/drive/folders');
    console.log('   - GET    /api/v1/drive/folders');
    console.log('   - GET    /api/v1/drive/folders/tree');
    console.log('   - GET    /api/v1/tasks/kanban');
    console.log('   - GET    /api/v1/tasks/:id');
    console.log('   - POST   /api/v1/marketplace/templates/:templateId/deploy');
    console.log('   - GET    /api/v1/marketplace/deployments/:id');
    console.log('   - GET    /api/v1/vault');
    console.log('   - POST   /api/v1/vault');
    console.log('   - GET    /api/v1/vault/:id');
    console.log('   - DELETE /api/v1/vault/:id');
    console.log('   - PATCH  /api/v1/vault/:id');
    console.log('   - POST   /api/v1/vault/extract');
    console.log('   - POST   /api/v1/vault/extract/confirm');
    console.log('   - POST   /api/v1/vault/resolve  (machine API key)');
    console.log("   - GET    /api/v1/admin/users");
    console.log("   - GET    /admin/users (UI)");
    console.log('   - GET    /api/v1/nexus/status');
    console.log('   - GET    /api/v1/nexus/setup/status');
    console.log('   - GET    /api/v1/inbox/threads');
    console.log('   - GET    /api/v1/inbox/approvals');
    console.log('   - POST   /api/v1/inbox/approvals/:id/decision');
    console.log('   - GET    /api/v1/calendar/events');
    
    // Start IMAP poller if configured (simplified, no MongoDB)
    if (process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS) {
      console.log('⚠️  IMAP poller configured but disabled (MongoDB removed)');
    } else {
      console.log('⚠️  IMAP not configured (set IMAP_HOST, IMAP_USER, IMAP_PASS)');
    }
    
    // Health check endpoint
    app.get('/api/v1/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'vutler',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });
    
    console.log('🎉 Vutler initialization complete!\n');
    
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to initialize Vutler:', error);
    throw error;
  }
}

/**
 * Graceful shutdown
 */
async function shutdownVutler(io) {
  console.log('Shutting down Vutler...');
  
  if (io) {
    io.close();
    console.log('WebSocket server closed');
  }
  
  console.log('Vutler shutdown complete');
}

/**
 * Generate a unique message ID for WebSocket chat
 */
function generateMessageId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return timestamp + random;
}

module.exports = {
  initializeVutler,
  shutdownVutler,
  authenticateAgent
};
