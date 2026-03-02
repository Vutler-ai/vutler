# AGENTS.md - Vutler Project Guide

> Guide for AI coding agents working on the Vutler platform.  
> This project uses **English** for code/comments and **French** for documentation/business docs.

---

## Project Overview

**Vutler** is an AI agent management platform developed by **Starbox Group** (Geneva, Switzerland). It enables businesses to create, deploy, and orchestrate AI agents that interact through chat (Rocket.Chat integration), email, and webhooks.

### Core Features
- **AI Agent Runtime**: Multi-agent orchestration with LLM routing (OpenAI, Anthropic, MiniMax)
- **Chat Integration**: Deep Rocket.Chat integration for agent-human collaboration
- **Email Support**: Inbound/outbound email processing for agents
- **Tool Framework**: Extensible tool system (web search, file operations, shell execution)
- **Memory System**: Snipara integration for persistent agent memory
- **Multi-tenant**: Workspace-based data isolation
- **VDrive**: Encrypted file storage with chat integration

### Product Ecosystem
- **vutler.ai** — Main platform (this repo)
- **Snipara** — AI context optimization & agent memory (snipara.com)
- **Vaultbrix** — Swiss-hosted database platform (vaultbrix.com)

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 20+ |
| **Language** | JavaScript (CommonJS) / TypeScript (select files) |
| **API Framework** | Express.js 4.x |
| **Databases** | PostgreSQL 15+ (primary), MongoDB (Rocket.Chat), Redis (cache/pub-sub) |
| **Real-time** | WebSocket (DDP protocol for Rocket.Chat), Socket.io |
| **Container** | Docker + Docker Compose |
| **Reverse Proxy** | nginx |
| **Process Management** | PM2 (production) |

### Key Dependencies
```javascript
// Core
express, cors, helmet, rate-limit
ws (WebSocket), mongodb, pg (PostgreSQL), redis

// Security
crypto, bcrypt, jsonwebtoken

// HTTP/API
axios, node-fetch

// Utilities
uuid, dotenv, winston (logging)

// File handling
multer, mime-types
```

---

## Project Structure

```
vutler/
├── api/                      # Express route handlers (1 file = 1 domain)
│   ├── agents.js             # Agent CRUD operations
│   ├── chat.js               # Rocket.Chat integration
│   ├── email.js              # Email send/receive
│   ├── drive-chat.js         # VDrive file sharing
│   ├── github.js             # GitHub connector API
│   ├── llm.js                # LLM provider management
│   ├── memory.js             # Agent memory (Snipara)
│   ├── onboarding.js         # User onboarding wizard
│   ├── runtime.js            # Agent runtime control
│   ├── tools.js              # Agent tools framework
│   ├── webhook.js            # Webhook integrations
│   └── workspace.js          # Multi-tenant workspace API
│
├── services/                 # Business logic & core services
│   ├── agentRuntime.js       # Main agent runtime (DDP WebSocket)
│   ├── agentManager.js       # Runtime v3: Agent Process Manager (APM)
│   ├── agentBus.js           # Redis pub/sub for inter-agent comms
│   ├── toolRegistry.js       # Tool registration & execution
│   ├── skillSystem.js        # Agent skills framework
│   ├── localAgent.js         # Local WebSocket agent connections
│   ├── llmRouter.js          # LLM provider routing
│   ├── crypto.js             # Encryption/decryption service
│   ├── provisioning.js       # Workspace & agent provisioning
│   └── swagger.js            # API documentation (Swagger)
│
├── lib/                      # Shared utilities & middleware
│   ├── auth.js               # Authentication middleware
│   ├── postgres.js           # PostgreSQL pool & helpers
│   ├── logger.js             # Winston logger configuration
│   └── validators.js         # Input validation helpers
│
├── scripts/                  # Utility scripts
│   ├── email-poll.py         # IMAP email polling
│   ├── kchat-poll.py         # kChat message polling
│   └── jarvis-sync.sh        # Deployment sync script
│
├── skills/                   # Agent skill definitions
│   ├── agile-story-master/
│   ├── dev-story-executor/
│   ├── product-vision-builder/
│   └── system-architect/
│
├── memory/                   # Daily memory logs & reports
│   ├── YYYY-MM-DD.md         # Daily context files
│   ├── rex-health-report.md  # Monitoring reports
│   └── vchat-inbox.jsonl     # Pending chat messages
│
├── social-media/             # Social media content & scheduling
├── prompts/                  # LLM prompt templates
├── projects/                 # Project-specific documentation
├── reports/                  # Generated reports
│
├── *.sql                     # Database migrations
├── *.js                      # Standalone service files
├── *.md                      # Sprint docs & specifications
│
└── docker-compose.yml        # (in production VPS, not in repo)
```

---

## Code Organization

### Module Pattern (CommonJS)
All JavaScript files follow this structure:

```javascript
'use strict';

const dependency = require('./dependency');

// Constants first
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRY_COUNT = 5;

// Main class or functions
class MyService {
  constructor(db) {
    this.db = db;
  }
  
  async doSomething() {
    // Implementation
  }
}

// Private helper (underscore prefix)
function _privateHelper() {}

// Export at bottom
module.exports = MyService;
// OR
module.exports = { function1, function2 };
```

### Express Router Pattern
```javascript
// api/agents.js
const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../lib/auth');

// Apply auth middleware to all routes
router.use(authenticateAgent);

// RESTful routes
router.get('/', async (req, res) => {
  try {
    const agents = await getAgents(req.workspaceId);
    res.json({ success: true, data: agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

### Response Format Standard
```javascript
// Success response
res.json({
  success: true,
  data: { /* payload */ },
  meta: { total: 100, page: 1 }  // optional
});

// Error response
res.status(400).json({
  success: false,
  error: 'Validation failed',
  details: { field: 'email', message: 'Invalid format' }  // optional
});
```

---

## Naming Conventions

### Files
- **kebab-case** for new files: `agent-runtime.js`, `llm-router.js`
- **camelCase** accepted for legacy: `agentRuntime.js`
- Suffixes: `*.test.js`, `*.spec.js`, `*.config.js`

### Variables & Functions
```javascript
// camelCase for variables
const agentConfig = {};
const isActive = true;

// SCREAMING_SNAKE_CASE for constants
const RC_WS_URL = process.env.RC_WS_URL || 'ws://localhost:3000';
const MAX_RETRY_COUNT = 5;

// camelCase, verb-first for functions
function getAgentById(id) {}
function createWorkspace(data) {}
async function fetchMessages() {}

// underscore prefix for "private" functions
async function _loadFromPG() {}
function _handleError(err) {}
```

### Classes
```javascript
// PascalCase for classes
class AgentRuntime {
  constructor(db, app) {
    this.db = db;
    this.app = app;
  }
}

class LLMRouter {}
class AgentProcessManager {}
```

### API Routes
```javascript
// RESTful naming, plural for collections
router.get('/agents', listAgents);
router.get('/agents/:id', getAgent);
router.post('/agents', createAgent);
router.put('/agents/:id', updateAgent);
router.delete('/agents/:id', deleteAgent);

// Special actions: verb after ID
router.post('/agents/:id/start', startAgent);
router.post('/agents/:id/stop', stopAgent);
```

---

## Database Patterns

### PostgreSQL Queries (Always Parameterized)
```javascript
// ALWAYS use parameterized queries (anti-SQL injection)
const result = await pool.query(
  'SELECT * FROM agents WHERE workspace_id = $1 AND status = $2',
  [workspaceId, 'active']
);

// NEVER use string interpolation
// ❌ `SELECT * FROM agents WHERE id = '${id}'`
```

### Transactions
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO agents ...', [...]);
  await client.query('INSERT INTO agent_channels ...', [...]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

### Multi-tenant Isolation
All tables have `workspace_id` with Row Level Security (RLS) policies:
```sql
CREATE POLICY ws_isolation_agents ON agents
  USING (workspace_id = current_setting('app.workspace_id', true));
```

---

## Environment Variables

Critical env vars used across the codebase:
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vutler
MONGODB_URI=mongodb://localhost:27017/rocketchat
REDIS_URL=redis://localhost:6379

# Rocket.Chat
RC_WS_URL=ws://localhost:3000/websocket
RC_API_URL=http://localhost:3000
RC_ADMIN_TOKEN=xxx
RC_ADMIN_USER_ID=xxx

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINIMAX_API_KEY=...

# External Services
SNIPARA_API_URL=https://api.snipara.com/mcp/vutler
SNIPARA_API_KEY=rlm_...

# Security
JWT_SECRET=...
ENCRYPTION_KEY=...

# Server
PORT=3001
NODE_ENV=production
```

---

## Testing

### Test Files
```javascript
// test-{feature}.js OR {feature}.test.js
describe('AgentRuntime', () => {
  describe('start()', () => {
    it('should load agents from PostgreSQL', async () => {
      // Test implementation
    });

    it('should handle connection errors gracefully', async () => {
      // Test implementation
    });
  });
});
```

### Running Tests
```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:e2e      # End-to-end tests
npm run test:coverage # With coverage report
```

### E2E Test Coverage
Key E2E flows (from `e2e-test-s8.5.js`):
- User signup → onboarding → LLM setup → agent creation → channel assignment
- Agent receives message → processes via LLM → posts response
- Multi-tenant isolation verification

---

## Security Guidelines

### Authentication Headers
```javascript
// Required headers for authenticated requests
const authToken = req.headers['x-auth-token'];
const userId = req.headers['x-user-id'];
const workspaceId = req.headers['x-workspace-id'];
```

### Input Validation
```javascript
// Always validate before processing
const { name, email } = req.body;
if (!name || typeof name !== 'string' || name.length > 100) {
  return res.status(400).json({ success: false, error: 'Invalid name' });
}
```

### Secret Management
- NEVER commit secrets to git
- Use environment variables
- Encrypt sensitive data at rest (CryptoService)
- Validate all external inputs

---

## Deployment

### VPS Context (Production)
- **IP**: 83.228.222.180
- **SSH Key**: `.secrets/vps-ssh-key.pem`
- **Source**: `/home/ubuntu/vutler/app/custom/`
- **Rebuild**: `cd /home/ubuntu/vutler && docker compose up -d --build vutler-api`

### Docker Services
```yaml
# docker-compose.yml structure
services:
  vutler-api:       # Main API server (port 3001)
  vutler-rocketchat:# Rocket.Chat (port 3000)
  vutler-postgres:  # PostgreSQL
  vutler-mongo:     # MongoDB
  vutler-redis:     # Redis cache
  vutler-nginx:     # Reverse proxy
```

### Git Conventions
```
main              # Production
develop           # Integration
feature/S12-xxx   # Features (Sprint-Story format)
fix/S12-xxx       # Bug fixes
hotfix/xxx        # Production hotfixes
```

### Commit Format
```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- docs: Documentation
- test: Tests
- chore: Maintenance

Examples:
feat(agents): add agent memory persistence
fix(chat): resolve message deduplication issue
```

---

## Development Workflow

### Before Coding
1. Read `SOUL.md` — understand the agent persona
2. Read `USER.md` — understand Alex's preferences
3. Read `MEMORY.md` — check recent context
4. Check `TODO.md` for active tasks
5. Read relevant sprint file (e.g., `sprint-11.md`)

### Logging Pattern
```javascript
// Prefix with [Module/Function]
console.log('[Runtime] Starting agent runtime…');
console.warn('[Runtime] Agent bus init skipped:', err.message);
console.error('[AgentRuntime._connect] WebSocket error:', err);

// For production: use structured logger
const { logger } = require('./lib/logger');
logger.info({ agentId, action: 'start' }, 'Agent started');
logger.error({ err, agentId }, 'Agent failed to start');
```

### Error Handling
```javascript
// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

// Always use try/catch with async
async function processMessage(messageId) {
  try {
    const message = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (!message) {
      throw new Error('Message not found');
    }
    return message;
  } catch (err) {
    console.error('[processMessage] Error:', err.message);
    throw err;  // Re-throw for parent handler
  }
}
```

---

## Key Architecture Components

### Agent Runtime (v2)
Located in `services/agentRuntime.js`:
- DDP WebSocket connection to Rocket.Chat
- Message subscription per channel
- Round-robin routing for unmentioned messages
- @mention routing to specific agents
- Each agent posts with own credentials (PAT)

### Agent Process Manager (v3 - Runtime v3)
Located in `services/agentManager.js`:
- Worker thread management for agents
- Health monitoring & auto-restart
- Scalable agent orchestration
- Tool execution isolation

### LLM Router
Located in `services/llmRouter.js`:
- Multi-provider support (OpenAI, Anthropic, MiniMax)
- Model selection per agent/task
- Token usage tracking
- Rate limiting integration

### Tool Registry
Located in `services/toolRegistry.js`:
- 7 built-in tools: knowledge, memory, email, shell, drive, webhook, web_search
- Dynamic tool loading
- Per-agent tool assignment
- Security sandboxing

---

## Sprint Documentation

Active sprint files track development progress:
- `sprint-7.md` — Launch prep, E2E testing
- `sprint-8.md` — Multi-tenant, Snipara integration
- `sprint-9.md` — Onboarding wizard, auto-provisioning
- `sprint-10.md` — Chat polish, branding
- `sprint-11.md` — Agent autonomy: email, tools, multi-agent
- `SPRINT-11.5-FINAL-REPORT.md` — Runtime v3 activation status

---

## Files to Know

### Critical Service Files
| File | Purpose |
|------|---------|
| `agentRuntime.js` | Main agent runtime service (DDP WebSocket) |
| `index-s11.5-integrated.js` | Express server with all routes (main entry) |
| `pg-updated.js` | PostgreSQL connection & helpers |
| `provisioning.js` | Workspace & agent provisioning logic |
| `crypto-service.js` | Encryption/decryption utilities |
| `quotaMiddleware.js` | Rate limiting & quota enforcement |

### Configuration Files
| File | Purpose |
|------|---------|
| `.eslintrc.json` | ESLint rules (semicolons required, single quotes) |
| `.mcp.json` | MCP server configurations (Snipara) |
| `.prettierrc` | Code formatting rules |
| `.editorconfig` | Editor consistency settings |

### Documentation Files
| File | Purpose |
|------|---------|
| `CODING_STANDARDS.md` | Detailed coding conventions (French) |
| `SECURITY.md` | Trust model & security rules |
| `TODO.md` | Active task board |
| `HEARTBEAT.md` | Automated check procedures |
| `TOOLS.md` | MCP tools & integrations reference |

---

## PR Checklist

Before submitting changes:
- [ ] Code follows conventions above
- [ ] No debug `console.log` (use logger)
- [ ] Environment variables documented
- [ ] Tests added/updated
- [ ] No secrets in code
- [ ] SQL uses parameters (`$1`, `$2`)
- [ ] Errors are caught and logged
- [ ] API responses follow standard format
- [ ] RLS policies updated if new tables

---

*Last updated: 2026-03-02*  
*Project: Vutler by Starbox Group*  
*Primary Language: English (code), French (docs)*
