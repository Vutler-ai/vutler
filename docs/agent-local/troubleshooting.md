# Troubleshooting

Common issues when running Vutler Agent Local and how to fix them.

---

## Connection Problems

### Agent can't connect to server

**Symptoms:** `WebSocket error: connect ECONNREFUSED`

**Fixes:**
1. Verify the server URL is correct and includes the path:
   ```
   ws://your-server:8081/local-agent    ✅
   ws://your-server:8081               ❌ (missing path)
   http://your-server:8081/local-agent  ❌ (wrong protocol)
   ```

2. Check the Local Agent Service is running on the server:
   ```bash
   # On the server
   curl http://localhost:3001/api/v1/health
   ```

3. Check firewall allows port 8081:
   ```bash
   # Test connectivity
   nc -zv your-server 8081
   ```

4. If using Docker, ensure port 8081 is exposed in `docker-compose.yml`:
   ```yaml
   vutler-api:
     ports:
       - "3001:3001"
       - "8081:8081"
   ```

### Frequent disconnections

**Symptoms:** Agent reconnects every 30-60 seconds

**Fixes:**
1. **Heartbeat too slow.** Ensure heartbeat interval is ≤ 30 seconds:
   ```bash
   HEARTBEAT_INTERVAL=25000  # 25s, safely under the 60s timeout
   ```

2. **Network instability.** Add exponential backoff to reconnection:
   ```javascript
   let delay = 5000;
   ws.on('close', () => {
     setTimeout(connect, delay);
     delay = Math.min(delay * 1.5, 60000); // Cap at 60s
   });
   ```

3. **Server restarts.** Check server logs for crash loops:
   ```bash
   docker compose logs -f vutler-api
   ```

---

## Authentication Failures

### `auth_failed: Invalid credentials`

**Fixes:**
1. Verify your token matches what was returned during registration:
   ```bash
   # Re-register to get a fresh token
   curl -X POST http://your-server:3001/api/v1/agents/local/register \
     -H 'Content-Type: application/json' \
     -d '{"agentId":"your-id","workspaceId":"default","name":"Your Agent"}'
   ```

2. Ensure `agentId`, `workspaceId`, AND `token` all match the same registration

3. Check the workspace exists:
   ```bash
   curl http://your-server:3001/api/v1/agents/local/status?workspaceId=default
   ```

### `auth_failed: Missing credentials`

All three fields are required in the auth message:
```json
{
  "type": "auth",
  "agentId": "required",
  "workspaceId": "required",
  "token": "required"
}
```

---

## Task Errors

### `Task timeout: task_xxxxx`

The task took longer than `TASK_TIMEOUT` (default 5 minutes).

**Fixes:**
1. Increase the timeout:
   ```bash
   TASK_TIMEOUT=600000  # 10 minutes
   ```

2. Send progress updates to keep the connection alive:
   ```javascript
   send({ type: 'status_update', status: 'processing' });
   ```

3. Break large tasks into smaller sub-tasks

### `Agent not connected`

**HTTP 503** when sending tasks — the agent isn't connected.

**Fixes:**
1. Check agent status:
   ```bash
   curl http://your-server:3001/api/v1/agents/local/status
   ```

2. Restart the local agent:
   ```bash
   node agent-local.js
   ```

3. Check the agent wasn't force-disconnected by an admin:
   ```bash
   # Server logs
   docker compose logs vutler-api | grep "disconnected by admin"
   ```

---

## Tool Errors

### `Unknown tool: xxx`

The tool doesn't exist in the registry.

```bash
# List available tools
curl http://your-server:3001/api/v1/tools
```

### `URL not allowed` (http_request)

The target URL isn't in the allowlist. Currently allowed:
- `api.github.com`
- `httpbin.org`
- `jsonplaceholder.typicode.com`
- `api.weather.gov`
- `api.openweathermap.org`
- `api.coindesk.com`
- `restcountries.com`

To add domains, modify `URL_ALLOWLIST` in `services/tools.js` on the server.

### `Snipara API key not configured`

Knowledge and memory tools need Snipara:

```bash
# On the server .env
SNIPARA_API_URL=https://api.snipara.com/mcp/vutler
SNIPARA_API_KEY=rlm_your_key_here
```

---

## Performance Tips

### Reduce latency

1. **Run close to the server.** Local network > internet
2. **Use Redis locally** for AgentBus instead of remote Redis
3. **Minimize task payload size** — send references, not full data

### Reduce token usage

1. **Enable context compaction** — the ContextManager automatically compacts history when it exceeds token limits
2. **Use short system prompts** — every character counts
3. **Set max_results lower** on knowledge and search tools

### Memory management

1. The agent process is long-running — watch for memory leaks
2. Clear large task results after processing:
   ```javascript
   // Don't hold references to large results
   let result = await processTask(task);
   send({ type: 'task_result', taskId, success: true, result });
   result = null; // GC can collect
   ```

### Monitor your agent

```bash
# Check connected agents and uptime
curl http://your-server:3001/api/v1/agents/local/status

# Check token usage
curl http://your-server:3001/api/v1/agents/YOUR_ID/usage?period=day \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

---

## Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug node agent-local.js
```

Or add debug logging to your agent:

```javascript
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[DEBUG] ←', JSON.stringify(msg, null, 2));
  handleMessage(msg);
});

function send(msg) {
  console.log('[DEBUG] →', JSON.stringify(msg, null, 2));
  ws.send(JSON.stringify(msg));
}
```

---

## Getting Help

1. Check server health: `GET /api/v1/health`
2. Check server logs: `docker compose logs -f vutler-api`
3. Check WebSocket stats: `GET /api/v1/ws/stats`
4. Review the [Architecture docs](./architecture.md) for protocol details
