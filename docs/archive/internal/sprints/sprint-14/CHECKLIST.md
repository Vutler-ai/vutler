# Sprint 14 Deployment Checklist

Use this checklist to verify the agent runtime is deployed and working correctly.

## Pre-Deployment

- [ ] All files are in `/Users/lopez/.openclaw/workspace/projects/vutler/sprint-14/`
- [ ] SSH key exists at `~/.secrets/vps-ssh-key.pem`
- [ ] VPS is accessible: `ssh -i ~/.secrets/vps-ssh-key.pem ubuntu@83.228.222.180`
- [ ] Container `vutler-api` is running: `docker ps | grep vutler-api`
- [ ] Anthropic API key is ready

## Deployment Steps

- [ ] Files copied to VPS `/tmp/vutler-sprint14/`
- [ ] Runtime folder copied to container: `docker cp /tmp/vutler-sprint14/runtime vutler-api:/app/runtime`
- [ ] Chat handler copied: `docker cp /tmp/vutler-sprint14/chat-handler-runtime.js vutler-api:/app/chat-handler-runtime.js`
- [ ] Test script copied: `docker cp /tmp/vutler-sprint14/test-runtime.js vutler-api:/app/test-runtime.js`
- [ ] Files verified: `docker exec vutler-api ls -la /app/runtime`
- [ ] Tools verified: `docker exec vutler-api ls -la /app/runtime/tools`

## Configuration

- [ ] Anthropic API key set: `docker exec vutler-api printenv | grep ANTHROPIC_API_KEY`
- [ ] Database connection tested (see DEPLOYMENT.md troubleshooting section)
- [ ] Chat handler route updated with runtime integration
- [ ] Container restarted: `docker restart vutler-api`
- [ ] No errors in logs: `docker logs vutler-api | tail -50`

## Database Verification

Run these queries to ensure tables exist:

```sql
-- From psql:
\c postgres
SET search_path TO tenant_vutler;

-- Check tables exist:
\dt agent_memories
\dt agent_llm_configs
\dt agent_runtime_status
\dt tasks
\dt goals
\dt events
```

- [ ] All tables exist
- [ ] At least one agent exists in `agent_llm_configs`
- [ ] No orphaned data causing foreign key issues

## Functional Tests

### Test 1: Basic Runtime
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Hello, introduce yourself"
```
- [ ] Script runs without errors
- [ ] Agent responds with text
- [ ] Iterations shown (should be 1-2)
- [ ] No tool calls (simple greeting)

### Test 2: Task Creation
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Create a task: Test runtime deployment"
```
- [ ] Agent uses `create_task` tool
- [ ] Tool executes successfully
- [ ] Task appears in database: `SELECT * FROM tenant_vutler.tasks ORDER BY created_at DESC LIMIT 1;`
- [ ] Agent confirms task creation in response

### Test 3: Web Search
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Search for information about Anthropic Claude"
```
- [ ] Agent uses `web_search` tool
- [ ] Brave API returns results
- [ ] Agent summarizes findings
- [ ] No API errors

### Test 4: Memory Storage
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Remember this: My favorite color is blue"
```
- [ ] Agent uses `store_memory` tool
- [ ] Memory saved to database: `SELECT * FROM tenant_vutler.agent_memories ORDER BY created_at DESC LIMIT 1;`
- [ ] memory_type is 'fact'

### Test 5: Memory Recall
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "What's my favorite color?"
```
- [ ] Agent recalls previous memory
- [ ] Responds with "blue"
- [ ] No new tool calls needed (memory in context)

### Test 6: Goal Creation
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Set a goal to improve response time by 20%"
```
- [ ] Agent uses `create_goal` tool
- [ ] Goal saved to database: `SELECT * FROM tenant_vutler.goals ORDER BY created_at DESC LIMIT 1;`

### Test 7: Calendar Event
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Schedule a meeting for tomorrow at 2pm"
```
- [ ] Agent uses `create_event` tool
- [ ] Event saved: `SELECT * FROM tenant_vutler.events ORDER BY created_at DESC LIMIT 1;`
- [ ] start_time is correctly set for tomorrow 14:00

### Test 8: Email (if Postal is configured)
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Send an email to test@example.com with subject 'Test' and body 'Hello'"
```
- [ ] Agent uses `send_email` tool
- [ ] Postal API called successfully (or graceful error if not configured)
- [ ] Check Postal logs for sent email

### Test 9: Multi-tool Chain
```bash
docker exec vutler-api node test-runtime.js "AGENT_ID" "Create a task to research AI agents, then search for recent papers and add findings as a memory"
```
- [ ] Agent uses multiple tools: `create_task`, `web_search`, `store_memory`
- [ ] Multiple iterations (3-5)
- [ ] All tools execute successfully
- [ ] Final response synthesizes results

### Test 10: Streaming via HTTP
```bash
curl -N -X POST http://83.228.222.180:3001/api/agents/AGENT_ID/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -d '{"message": "Tell me about agent architectures", "stream": true}'
```
- [ ] Response streams in real-time (SSE format)
- [ ] `data:` events received
- [ ] Final `type: done` event received
- [ ] No connection errors

## Runtime Status Checks

### Check agent runtime status
```sql
SELECT agent_id, status, last_heartbeat, error_message, updated_at
FROM tenant_vutler.agent_runtime_status
ORDER BY updated_at DESC;
```
- [ ] Status shows 'idle' after tests (not 'running' or 'error')
- [ ] last_heartbeat is recent (within last minute)
- [ ] error_message is NULL

### Check memory stats
```sql
SELECT 
  agent_id,
  memory_type,
  COUNT(*) as count,
  AVG(importance) as avg_importance,
  MAX(created_at) as last_created
FROM tenant_vutler.agent_memories
GROUP BY agent_id, memory_type;
```
- [ ] Memories exist for test agent
- [ ] 'conversation' type has entries
- [ ] Importance values reasonable (1-10)

### Check task stats
```sql
SELECT status, COUNT(*) as count
FROM tenant_vutler.tasks
GROUP BY status;
```
- [ ] At least one task from tests
- [ ] Status distribution looks correct

## Performance Checks

- [ ] Average response time < 5 seconds for simple queries
- [ ] Average response time < 15 seconds for multi-tool chains
- [ ] Memory usage stable (not growing indefinitely)
- [ ] No memory leaks after 10+ consecutive chats

## Error Handling Tests

### Test graceful tool failure
```bash
# Create task with invalid data
docker exec vutler-api node test-runtime.js "AGENT_ID" "Create a task with due date 'invalid-date'"
```
- [ ] Agent doesn't crash
- [ ] Error handled gracefully
- [ ] Agent responds with helpful message

### Test max iterations
```bash
# Craft a message that might cause infinite loop
docker exec vutler-api node test-runtime.js "AGENT_ID" "Keep searching and creating tasks until you find the meaning of life"
```
- [ ] Loop stops at max 10 iterations
- [ ] No infinite loop
- [ ] Response indicates why it stopped

### Test missing agent
```bash
docker exec vutler-api node test-runtime.js "00000000-0000-0000-0000-000000000000" "Hello"
```
- [ ] Error message: "Agent config not found"
- [ ] Doesn't crash
- [ ] Exit code non-zero

## Monitoring Setup

- [ ] Set up log aggregation for `[AgentLoop]` prefix
- [ ] Set up alerts for status = 'error' in agent_runtime_status
- [ ] Dashboard for tool usage stats
- [ ] Dashboard for average iterations per conversation

## Post-Deployment

- [ ] Document any configuration changes made
- [ ] Update team on new runtime capabilities
- [ ] Schedule memory cleanup cron job (weekly)
- [ ] Plan for custom tool development
- [ ] Monitor for first 48 hours

## Rollback Readiness

- [ ] Backup of original chat handler saved
- [ ] Rollback steps documented
- [ ] Tested rollback in staging (if available)

---

## Summary

**Total checks:** 70+  
**Critical checks:** Database tables, basic runtime, tool execution, memory  
**Optional checks:** Email (if Postal configured), streaming, performance  

**Sign-off:**

- [ ] All critical checks pass
- [ ] Deployment verified by: _______________
- [ ] Date: _______________
- [ ] Ready for production: YES / NO

---

**Built by Mike ⚙️ — Sprint 14**

Methodical. Thorough. Zero shortcuts.
