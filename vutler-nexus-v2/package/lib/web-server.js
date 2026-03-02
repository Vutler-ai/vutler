/**
 * @vutler/nexus — Local Web Server
 * Express server providing web interface for chat and configuration
 * Supports both local (Claude CLI) and cloud (Vutler API) modes
 */
const express = require('express');
const path = require('path');
const { EventEmitter } = require('events');

const multer = require('multer');
const fs = require('fs');
const NexusCloudOrchestrator = require('./orchestrator-cloud');

class WebServer extends EventEmitter {
  constructor(config, agentRuntime) {
    super();
    this.config = config;
    this.agentRuntime = agentRuntime;
    this.cloudOrchestrator = null;
    this.app = express();
    this.server = null;
    this.activeConnections = new Set();
    
    // Initialize cloud orchestrator if in cloud mode
    if (config.mode === 'cloud' && config.vutlerApiKey) {
      try {
        process.env.VUTLER_API_KEY = config.vutlerApiKey;
        this.cloudOrchestrator = new NexusCloudOrchestrator();
      } catch (error) {
        console.error('[web] Failed to initialize cloud orchestrator:', error.message);
      }
    }
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Serve static files from lib/web directory
    const webDir = path.join(__dirname, 'web');
    this.app.use(express.static(webDir));
    
    // CORS for local development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[web] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // API Routes
    
    // Get agent status
    this.app.get('/api/status', (req, res) => {
      try {
        const runtimeStatus = this.agentRuntime ? this.agentRuntime.getStatus() : null;
        const isCloud = this.config.mode === 'cloud' && this.cloudOrchestrator;
        
        res.json({
          server: 'running',
          agent: runtimeStatus,
          config: {
            workspace: this.config.workspace,
            webPort: this.config.webPort,
            agentName: this.config.agent?.name,
            mode: this.config.mode || 'local',
            provider: isCloud ? 'cloud' : this.config.llm?.provider,
            model: isCloud ? 'Vutler Cloud' : this.config.llm?.model,
            hasApiKey: !!(this.config.llm?.apiKey || this.config.vutlerApiKey),
            vutlerUrl: isCloud ? this.config.vutlerUrl : undefined
          },
          connections: this.activeConnections.size,
          cloudReady: isCloud
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get configuration
    this.app.get('/api/config', (req, res) => {
      try {
        const safeConfig = { ...this.config };
        // Hide API keys but show which provider has keys
        if (safeConfig.llm?.apiKey) {
          safeConfig.llm.apiKey = safeConfig.llm.apiKey.slice(0, 8) + '...';
        }
        res.json(safeConfig);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update configuration
    this.app.post('/api/config', async (req, res) => {
      try {
        const updates = req.body;
        
        // Update config
        Object.assign(this.config, updates);
        
        // Update agent runtime if it exists
        if (this.agentRuntime) {
          await this.agentRuntime.updateConfig(this.config);
        }
        
        // Emit config update event
        this.emit('configUpdated', this.config);
        
        res.json({ success: true, message: 'Configuration updated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test LLM connection
    this.app.post('/api/test-connection', async (req, res) => {
      try {
        if (!this.agentRuntime) {
          return res.status(500).json({ 
            success: false, 
            error: 'Agent runtime not initialized' 
          });
        }

        const result = await this.agentRuntime.testConnection();
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Chat endpoint - supports both local and cloud modes
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, stream = true, attachments = [] } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        // Route based on mode
        if (this.config.mode === 'cloud' && this.cloudOrchestrator) {
          // Cloud mode - route to Vutler cloud agents
          try {
            console.log('[web] ☁️  Cloud mode - executing via Vutler');
            const result = await this.cloudOrchestrator.executeTask(message, {
              userId: 'web-ui',
              stream: false
            });

            if (!stream) {
              res.json({
                type: 'text',
                content: result.result || result.output || 'No response',
                source: 'cloud',
                duration: result.duration,
                agent: result.agentName
              });
            } else {
              // Streaming cloud response
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
              });

              this.activeConnections.add(res);
              res.on('close', () => {
                this.activeConnections.delete(res);
              });

              // Send result chunks
              const chunks = (result.result || '').split(' ');
              for (const chunk of chunks) {
                if (!res.destroyed) {
                  res.write(`data: ${JSON.stringify({ type: 'text', content: chunk + ' ' })}\\n\\n`);
                }
              }

              if (!res.destroyed) {
                res.write(`data: ${JSON.stringify({ type: 'complete', agent: result.agentName, duration: result.duration })}\\n\\n`);
                res.end();
              }

              this.activeConnections.delete(res);
            }
          } catch (error) {
            console.error('[web] Cloud execution error:', error);
            if (!res.headersSent) {
              res.status(500).json({ error: error.message });
            }
          }
        } else if (this.agentRuntime) {
          // Local mode - use agent runtime
          if (!stream) {
            // Non-streaming response
            const response = await this.agentRuntime.processMessage(message, { attachments });
            res.json(response);
          } else {
            // Streaming response using Server-Sent Events
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });

            // Track connection
            this.activeConnections.add(res);
            
            // Handle client disconnect
            res.on('close', () => {
              this.activeConnections.delete(res);
            });

            try {
              await this.agentRuntime.processMessage(message, {
                stream: true,
                attachments,
                onChunk: (chunk) => {
                  if (!res.destroyed) {
                    res.write(`data: ${JSON.stringify(chunk)}\\n\\n`);
                  }
                }
              });
              
              // Send completion marker
              if (!res.destroyed) {
                res.write('data: {"type":"complete"}\\n\\n');
                res.end();
              }
            } catch (error) {
              if (!res.destroyed) {
                res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\\n\\n`);
                res.end();
              }
            }
            
            this.activeConnections.delete(res);
          }
        } else {
          return res.status(500).json({ error: 'No execution runtime available' });
        }

      } catch (error) {
        console.error('[web] Chat error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    });

    // Get conversation history
    this.app.get('/api/history', (req, res) => {
      try {
        const history = this.agentRuntime ? this.agentRuntime.getHistory() : [];
        res.json({ history });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clear conversation history
    this.app.post('/api/history/clear', (req, res) => {
      try {
        if (this.agentRuntime) {
          this.agentRuntime.clearHistory();
        }
        res.json({ success: true, message: 'History cleared' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // File operations
    this.app.get('/api/files', async (req, res) => {
      try {
        if (!this.agentRuntime?.fileManager) {
          return res.status(500).json({ error: 'File manager not available' });
        }
        
        const { directory = '.' } = req.query;
        const files = await this.agentRuntime.fileManager.listFiles(directory);
        res.json({ files });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/files/read', async (req, res) => {
      try {
        if (!this.agentRuntime?.fileManager) {
          return res.status(500).json({ error: 'File manager not available' });
        }
        
        const { path: filePath } = req.query;
        if (!filePath) {
          return res.status(400).json({ error: 'File path is required' });
        }
        
        const content = await this.agentRuntime.fileManager.readFile(filePath);
        res.json({ content });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });


    // File upload endpoint
    const uploadDir = path.join(this.config.workspace || path.join(__dirname, '..'), 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });

    const upload = multer({
      storage,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/markdown', 'text/csv',
          'application/json', 'application/javascript', 'application/pdf',
          'application/xml', 'application/x-yaml', 'application/octet-stream'
        ];
        const codeExts = ['.js','.ts','.py','.rb','.go','.rs','.java','.c','.cpp','.h','.sh','.yml','.yaml','.toml','.md','.txt','.json','.xml','.html','.css','.sql'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedMimes.includes(file.mimetype) || codeExts.includes(ext)) cb(null, true);
        else cb(new Error('File type not allowed: ' + file.mimetype));
      }
    });

    this.app.post('/api/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const file = req.file;
        const isImage = file.mimetype.startsWith('image/');
        const isText = file.mimetype.startsWith('text/') || 
          ['application/json', 'application/javascript', 'application/xml', 'application/x-yaml'].includes(file.mimetype) ||
          ['.js','.ts','.py','.rb','.go','.rs','.java','.c','.cpp','.h','.sh','.yml','.yaml','.toml','.md','.txt','.json','.xml','.html','.css','.sql','.env','.cfg','.ini','.log'].includes(path.extname(file.originalname).toLowerCase());

        const result = {
          name: file.originalname,
          storedName: file.filename,
          size: file.size,
          mimeType: file.mimetype,
          path: file.path,
          isImage,
          isText
        };

        // For images, include base64
        if (isImage) {
          const data = fs.readFileSync(file.path);
          result.base64 = data.toString('base64');
        }

        // For text/code files, include content
        if (isText && !isImage) {
          try {
            const textContent = fs.readFileSync(file.path, 'utf-8');
            if (textContent.length <= 100000) {
              result.textContent = textContent;
            } else {
              result.textContent = textContent.substring(0, 100000) + '\n... (truncated)';
            }
          } catch (e) {
            // Binary file disguised as text
          }
        }

        // For PDFs, try to extract text (basic)
        if (file.mimetype === 'application/pdf') {
          result.textContent = `[PDF file: ${file.originalname}, ${(file.size / 1024).toFixed(1)}KB]`;
        }

        res.json(result);
      } catch (error) {
        console.error('[web] Upload error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve uploaded files
    this.app.use('/uploads', express.static(uploadDir));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Catch-all route - serve index.html for SPA routing
    this.app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, 'web', 'index.html');
      res.sendFile(indexPath);
    });
  }

  // Start the server
  async start() {
    try {
      const port = this.config.webPort || 3939;
      
      this.server = this.app.listen(port, 'localhost', () => {
        console.log(`[web] 🌐 Web interface running at http://localhost:${port}`);
        this.emit('started', { port });
      });

      this.server.on('error', (error) => {
        console.error('[web] Server error:', error);
        this.emit('error', error);
      });

      return port;
    } catch (error) {
      console.error('[web] Failed to start server:', error);
      throw error;
    }
  }

  // Stop the server
  async stop() {
    try {
      if (this.server) {
        // Close all active connections
        for (const connection of this.activeConnections) {
          if (!connection.destroyed) {
            connection.end();
          }
        }
        this.activeConnections.clear();

        await new Promise((resolve, reject) => {
          this.server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        this.server = null;
        console.log('[web] 🌐 Web server stopped');
        this.emit('stopped');
      }
    } catch (error) {
      console.error('[web] Error stopping server:', error);
      throw error;
    }
  }

  // Get server status
  getStatus() {
    return {
      running: !!this.server,
      port: this.config.webPort,
      connections: this.activeConnections.size,
      uptime: process.uptime()
    };
  }

  // Update agent runtime reference
  setAgentRuntime(runtime) {
    this.agentRuntime = runtime;
  }
}

module.exports = { WebServer };