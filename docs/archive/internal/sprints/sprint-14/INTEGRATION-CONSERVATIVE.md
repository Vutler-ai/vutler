# Conservative Integration Guide
## Add Agent Runtime WITHOUT Breaking Existing Functionality

**CRITICAL:** This is an ADD-ON, not a replacement. Your existing chat handler continues to work exactly as before.

---

## How It Works

```
User sends message →
  Check: Does agent have tools configured?
    ├─ YES → Use new agent runtime (with tools)
    └─ NO  → Use existing chat handler (unchanged)
```

**Zero breaking changes.** Agents without tools continue working exactly as before.

---

## Step 1: Deploy Runtime Files (No Integration Yet)

```bash
# Copy to VPS
cd /Users/lopez/.openclaw/workspace/projects/vutler/sprint-14
scp -i ~/.secrets/vps-ssh-key.pem -r runtime/ ubuntu@83.228.222.180:/tmp/vutler-runtime/
scp -i ~/.secrets/vps-ssh-key.pem runtime-wrapper.js ubuntu@83.228.222.180:/tmp/vutler-runtime/

# SSH and copy to container
ssh -i ~/.secrets/vps-ssh-key.pem ubuntu@83.228.222.180

docker cp /tmp/vutler-runtime/runtime vutler-api:/app/runtime
docker cp /tmp/vutler-runtime/runtime-wrapper.js vutler-api:/app/runtime-wrapper.js

# Verify (but don't integrate yet)
docker exec vutler-api ls -la /app/runtime
docker exec vutler-api ls -la /app/runtime-wrapper.js
```

**At this point: NOTHING is broken. Files are deployed but not used yet.**

---

## Step 2: Understand Your Existing Handler

Locate your existing chat handler. It probably looks like this:

```javascript
// routes/agents.js or similar

router.post('/agents/:id/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const agentId = req.params.id;
  
  // Your existing code:
  // 1. Get agent config
  // 2. Build prompt
  // 3. Call Anthropic API
  // 4. Return response
  
  res.json({ response: "..." });
});
```

**DO NOT MODIFY THIS YET.** Just identify where it is.

---

## Step 3: Extract Your Existing Handler Into a Function

Create a new file or modify your existing routes file:

```javascript
// routes/agents.js

// STEP 3A: Extract existing logic into a standalone function
async function existingChatHandler(agentId, message, options = {}) {
  // Copy your EXISTING chat logic here
  // This should be IDENTICAL to what you have now
  
  // Example (replace with your actual code):
  const config = await getAgentConfig(agentId);
  const prompt = buildPrompt(config, message);
  const response = await callAnthropicAPI(prompt);
  
  return {
    response: response,
    metadata: {
      runtime: 'existing',
      // ... your existing metadata
    }
  };
}

// STEP 3B: Your existing route handler now calls this function
router.post('/agents/:id/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const agentId = req.params.id;
  
  try {
    const result = await existingChatHandler(agentId, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Test this refactor BEFORE adding the runtime wrapper.**

```bash
# Restart and test
docker restart vutler-api
# Send a test chat message → should work exactly as before
```

**If this breaks anything, STOP and fix it before proceeding.**

---

## Step 4: Add the Conservative Wrapper (Safe Integration)

Now that your existing handler is a standalone function, wrap it:

```javascript
// routes/agents.js

const { createConservativeHandler } = require('../runtime-wrapper');

// Your existing handler function (from Step 3)
async function existingChatHandler(agentId, message, options = {}) {
  // ... your existing code (unchanged)
}

// REPLACE your route handler with the conservative wrapper
router.post('/agents/:id/chat', authMiddleware,
  createConservativeHandler(
    pgPool,                    // Your existing pg pool
    process.env.ANTHROPIC_API_KEY,  // Your existing API key
    existingChatHandler        // Your existing handler function
  )
);
```

**That's it. One line change to enable the runtime.**

---

## Step 5: Configure Which Agents Use Tools

The wrapper checks two places to determine if an agent should use the runtime:

### Option A: Via `capabilities` array (Recommended)
```sql
-- Enable tools for an agent
UPDATE tenant_vutler.agent_llm_configs
SET capabilities = ARRAY['tasks', 'goals', 'memories', 'email', 'web_search', 'calendar']
WHERE agent_id = 'YOUR_AGENT_ID';

-- Disable tools (use existing handler)
UPDATE tenant_vutler.agent_llm_configs
SET capabilities = NULL  -- or = ARRAY[]::text[]
WHERE agent_id = 'YOUR_AGENT_ID';
```

### Option B: Via `metadata` flag
```sql
-- Enable tools
UPDATE tenant_vutler.agent_llm_configs
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{enable_tools}', 'true')
WHERE agent_id = 'YOUR_AGENT_ID';

-- Disable tools
UPDATE tenant_vutler.agent_llm_configs
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{enable_tools}', 'false')
WHERE agent_id = 'YOUR_AGENT_ID';
```

---

## Step 6: Test with ONE Agent First

```bash
# 1. Enable tools for ONE test agent
psql -h 84.234.19.42 -p 6543 -U tenant_vutler_service.vaultbrix-prod -d postgres
# Run the UPDATE query from Step 5

# 2. Test that agent
curl -X POST http://83.228.222.180:3001/api/agents/TEST_AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"message": "Create a task: Test the runtime"}'

# Expected: Should use new runtime (check response metadata.runtime === 'agent-loop')

# 3. Test an agent WITHOUT tools enabled
curl -X POST http://83.228.222.180:3001/api/agents/OTHER_AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"message": "Hello"}'

# Expected: Should use existing handler (metadata.runtime === 'existing')
```

---

## Step 7: Monitor Logs

```bash
docker logs -f vutler-api | grep RuntimeWrapper
```

You should see:
- `[RuntimeWrapper] Agent XXX has tools enabled → Using agent runtime`
- `[RuntimeWrapper] Agent YYY has NO tools → Using existing handler`

**If you see errors → The wrapper will automatically fallback to existing handler**

---

## Step 8: Gradual Rollout

```sql
-- Enable tools for a few agents at a time
UPDATE tenant_vutler.agent_llm_configs
SET capabilities = ARRAY['tasks', 'web_search']
WHERE agent_id IN (
  'agent-1-id',
  'agent-2-id'
);

-- Monitor for 24 hours, then enable for more agents
```

---

## Rollback Plan

### If anything breaks, instant rollback:

**Option 1: Disable tools for all agents**
```sql
-- This reverts ALL agents to existing handler (zero code changes)
UPDATE tenant_vutler.agent_llm_configs
SET capabilities = NULL;
```

**Option 2: Revert the route handler**
```javascript
// routes/agents.js
// Remove the wrapper, restore original:

router.post('/agents/:id/chat', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const agentId = req.params.id;
  
  const result = await existingChatHandler(agentId, message);
  res.json(result);
});
```

**Restart:**
```bash
docker restart vutler-api
```

**Everything is back to normal. Runtime files can stay deployed (they're not used).**

---

## Safety Features

The wrapper has multiple safety nets:

1. **Tool check fails?** → Fallback to existing handler
2. **Agent runtime crashes?** → Fallback to existing handler
3. **Database error?** → Fallback to existing handler
4. **No tools configured?** → Use existing handler
5. **Any unexpected error?** → Fallback to existing handler

**You cannot break existing functionality with this integration.**

---

## Verification Checklist

Before considering this complete:

- [ ] Runtime files deployed to container
- [ ] Existing handler extracted into standalone function
- [ ] Existing handler tested and working (unchanged behavior)
- [ ] Conservative wrapper integrated
- [ ] Container restarted
- [ ] Test agent with tools enabled works
- [ ] Test agent WITHOUT tools works (uses existing handler)
- [ ] Logs show correct routing (`[RuntimeWrapper]` messages)
- [ ] No errors for agents without tools
- [ ] Rollback tested (disable tools → existing handler used)

---

## Example: Complete Integration

```javascript
// routes/agents.js

const { createConservativeHandler } = require('../runtime-wrapper');

// Your existing chat logic (unchanged)
async function existingChatHandler(agentId, message, options = {}) {
  try {
    // Get agent config
    const configResult = await pgPool.query(
      'SELECT * FROM tenant_vutler.agent_llm_configs WHERE agent_id = $1',
      [agentId]
    );
    
    if (configResult.rowCount === 0) {
      throw new Error('Agent not found');
    }
    
    const config = configResult.rows[0];
    
    // Build prompt (your existing logic)
    const systemPrompt = config.system_prompt_template || 'You are a helpful assistant.';
    
    // Call Anthropic (your existing logic)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: config.max_tokens || 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    });
    
    const data = await response.json();
    const text = data.content.find(c => c.type === 'text')?.text || '';
    
    return {
      response: text,
      metadata: {
        runtime: 'existing',
        model: config.model
      }
    };
    
  } catch (error) {
    console.error('[ExistingHandler] Error:', error);
    throw error;
  }
}

// Conservative wrapper route handler
router.post('/agents/:id/chat', authMiddleware,
  createConservativeHandler(
    pgPool,
    process.env.ANTHROPIC_API_KEY,
    existingChatHandler
  )
);
```

---

## FAQ

**Q: What if I don't have an `agent_llm_configs` table?**  
A: The wrapper will fail the tool check and always use the existing handler. You're safe.

**Q: What if my existing handler is structured differently?**  
A: Extract your logic into a function that takes `(agentId, message, options)` and returns `{ response, metadata }`. The wrapper is flexible.

**Q: Can I test the runtime without deploying?**  
A: Yes. Use `test-runtime.js` locally (update DB connection to point to your dev DB).

**Q: What if the runtime breaks for one agent?**  
A: That agent falls back to existing handler automatically. Other agents are unaffected.

**Q: How do I know which runtime was used?**  
A: Check `response.metadata.runtime` → `'agent-loop'` or `'existing'`

---

## Summary

| Step | What | Risk | Rollback |
|------|------|------|----------|
| 1. Deploy files | Copy runtime files to container | Zero | Just files, not used |
| 2. Understand existing | Identify your current handler | Zero | Nothing changed |
| 3. Extract handler | Refactor into function | Low | Revert code |
| 4. Add wrapper | Integrate conservative wrapper | Low | Revert code |
| 5. Configure agents | Enable tools for select agents | Zero | Disable tools in DB |
| 6. Test ONE agent | Verify runtime works | Zero | Disable for that agent |
| 7. Monitor | Watch logs | Zero | N/A |
| 8. Gradual rollout | Enable for more agents | Low | Disable in DB |

**Worst case scenario:** Disable all tools in DB → Everything reverts to existing behavior.

---

**Built by Mike ⚙️ — Conservative Integration, Zero Breaking Changes**

Test thoroughly. Roll out gradually. Monitor constantly.
