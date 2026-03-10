# Sprint 14 — Agent Runtime Engine
## Deployment Guide

### Architecture Overview

```
runtime/
├── agent-loop.js           # Core runtime orchestration
├── memory-manager.js       # Memory recall/save/decay
├── system-prompt-builder.js # Dynamic system prompt generation
└── tools/
    ├── tasks.js            # Task CRUD
    ├── goals.js            # Goals CRUD
    ├── memories.js         # Memory store/recall
    ├── email.js            # Postal email integration
    ├── web-search.js       # Brave search integration
    └── calendar.js         # Event CRUD

chat-handler-runtime.js     # Modified chat handler
```

### Prerequisites

- VPS: 83.228.222.180
- Container: `vutler-api`
- SSH key: `.secrets/vps-ssh-key.pem`
- Database: Vaultbrix (already configured)
- Node.js 18+ with native fetch support
- Anthropic API key configured in environment

### Deployment Steps

#### 1. Copy files to VPS

```bash
# From your local workspace
cd projects/vutler/sprint-14

# Copy runtime folder
scp -i ~/.secrets/vps-ssh-key.pem -r runtime/ ubuntu@83.228.222.180:/tmp/vutler-runtime/

# Copy chat handler
scp -i ~/.secrets/vps-ssh-key.pem chat-handler-runtime.js ubuntu@83.228.222.180:/tmp/vutler-runtime/
```

#### 2. SSH into VPS and copy to container

```bash
ssh -i ~/.secrets/vps-ssh-key.pem ubuntu@83.228.222.180

# Copy into container
docker cp /tmp/vutler-runtime/runtime vutler-api:/app/runtime
docker cp /tmp/vutler-runtime/chat-handler-runtime.js vutler-api:/app/chat-handler-runtime.js

# Verify
docker exec vutler-api ls -la /app/runtime
docker exec vutler-api ls -la /app/runtime/tools
```

#### 3. Update your chat route handler

Locate your existing chat handler (likely in `routes/agents.js` or similar) and integrate the runtime:

**Option A: Replace handler completely**
```javascript
const { createRuntimeChatHandler } = require('../chat-handler-runtime');

// Replace your existing POST /api/agents/:id/chat handler
router.post(
  '/agents/:id/chat',
  authMiddleware,
  createRuntimeChatHandler(pgPool, process.env.ANTHROPIC_API_KEY)
);
```

**Option B: Minimal integration (keep existing structure)**
```javascript
const { runAgentChat } = require('../chat-handler-runtime');

router.post('/agents/:id/chat', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const agentId = req.params.id;

    const result = await runAgentChat(
      pgPool,
      process.env.ANTHROPIC_API_KEY,
      agentId,
      message,
      { streaming: false }
    );

    res.json({
      response: result.response,
      metadata: {
        iterations: result.iterations,
        toolCalls: result.toolCalls
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### 4. Ensure environment variables

```bash
# Inside container or .env file
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Verify
docker exec vutler-api printenv | grep ANTHROPIC
```

#### 5. Restart the service

```bash
docker restart vutler-api

# Check logs
docker logs -f vutler-api
```

### Testing

#### Test via curl (non-streaming)

```bash
curl -X POST http://83.228.222.180:3001/api/agents/YOUR_AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Create a task: Review sprint 14 code",
    "stream": false
  }'
```

#### Test streaming

```bash
curl -X POST http://83.228.222.180:3001/api/agents/YOUR_AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Search the web for latest AI news",
    "stream": true
  }'
```

### Verification Checklist

- [ ] Files copied to container
- [ ] Chat handler updated and integrated
- [ ] ANTHROPIC_API_KEY environment variable set
- [ ] Container restarted successfully
- [ ] Database connection works (check logs)
- [ ] Test chat endpoint responds
- [ ] Tool execution works (create a task, send email, etc.)
- [ ] Memory recall/save works
- [ ] Streaming mode works

### Database Schema Verification

Ensure these tables exist in `tenant_vutler` schema:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'tenant_vutler' 
AND table_name IN (
  'agent_memories',
  'agent_tools',
  'agent_llm_configs',
  'agent_runtime_status',
  'tasks',
  'goals',
  'events',
  'automation_rules'
);
```

### Troubleshooting

**Container can't find modules:**
```bash
# Verify file structure
docker exec vutler-api ls -R /app/runtime
```

**Database connection errors:**
```bash
# Test DB connection from container
docker exec -it vutler-api node -e "
const pg = require('pg');
const pool = new pg.Pool({
  host: '84.234.19.42',
  port: 6543,
  user: 'tenant_vutler_service.vaultbrix-prod',
  password: '74tFUTSgVArkMRfBWjgxAvLt',
  database: 'postgres',
  ssl: false
});
pool.query('SELECT 1', (err, res) => {
  console.log(err ? 'ERROR: ' + err : 'SUCCESS');
  pool.end();
});
"
```

**Anthropic API errors:**
- Verify API key is valid
- Check rate limits
- Ensure internet connectivity from container

### Rollback

If something breaks, revert by:
1. Restore previous chat handler code
2. Restart container: `docker restart vutler-api`

Keep the runtime files in place for debugging.

### Next Steps

Once deployed and tested:
1. Monitor agent_runtime_status table for agent health
2. Implement memory decay cleanup cron (weekly recommended)
3. Add custom tools as needed in `runtime/tools/`
4. Tune LLM configs per agent (model, temperature, max_tokens)

---

**Built by Mike ⚙️ — Sprint 14 Complete**
