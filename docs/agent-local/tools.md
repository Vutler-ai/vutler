# Available Tools

Vutler agents have access to 7 built-in tools plus Snipara agentic tools for orchestration and multi-agent coordination.

---

## Built-in Tools

### 1. `web_search`

Search the web using DuckDuckGo Instant Answer API.

```json
{
  "name": "web_search",
  "input": {
    "query": "Node.js latest version",
    "max_results": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "query": "Node.js latest version",
  "results": [
    { "title": "Node.js", "snippet": "Node.js 22 is the current LTS...", "url": "https://nodejs.org", "source": "DuckDuckGo" }
  ],
  "count": 1
}
```

---

### 2. `http_request`

Make HTTP GET/POST requests to external APIs. **URL allowlist enforced.**

```json
{
  "name": "http_request",
  "input": {
    "url": "https://api.github.com/repos/nodejs/node",
    "method": "GET",
    "headers": { "Accept": "application/json" }
  }
}
```

**Allowed domains:**
- `api.github.com`
- `httpbin.org`
- `jsonplaceholder.typicode.com`
- `api.weather.gov`
- `api.openweathermap.org`
- `api.coindesk.com`
- `restcountries.com`

Requests to unlisted domains return an error.

---

### 3. `calculator`

Evaluate mathematical expressions safely. Only numbers and `+ - * / ( ) .` are allowed.

```json
{
  "name": "calculator",
  "input": {
    "expression": "2 + 3 * 4"
  }
}
```

**Response:**
```json
{
  "success": true,
  "expression": "2 + 3 * 4",
  "result": 14,
  "formatted": "14"
}
```

Max expression length: 200 characters.

---

### 4. `send_email`

Send email messages. Currently a placeholder for Haraka SMTP integration.

```json
{
  "name": "send_email",
  "input": {
    "to": "user@example.com",
    "subject": "Hello from Vutler",
    "body": "This is a test email."
  }
}
```

---

### 5. `knowledge`

Search agent knowledge bases via Snipara MCP.

```json
{
  "name": "knowledge",
  "input": {
    "query": "how to deploy agents",
    "max_results": 5
  }
}
```

Requires `SNIPARA_API_KEY` to be configured on the server.

---

### 6. `memory`

Store and recall agent memories for context persistence.

```json
// Remember
{
  "name": "memory",
  "input": {
    "action": "remember",
    "content": "User prefers concise responses",
    "type": "preference"
  }
}

// Recall
{
  "name": "memory",
  "input": {
    "action": "recall",
    "content": "user preferences"
  }
}

// Forget
{
  "name": "memory",
  "input": {
    "action": "forget",
    "content": "outdated fact about X"
  }
}
```

**Memory types:** `fact`, `decision`, `learning`, `preference`

---

### 7. `handoff`

Transfer the conversation to another agent.

```json
{
  "name": "handoff",
  "input": {
    "agent_name": "mike",
    "reason": "User needs technical help"
  }
}
```

Returns a `handoff: true` flag that the runtime uses to route the conversation.

---

## Snipara Agentic Tools

These tools are available to the Agent Runtime for orchestration and multi-agent coordination:

| Tool | Description | Usage |
|------|-------------|-------|
| `plan` | Create execution plan for a complex goal | `{ question: "..." }` |
| `decompose` | Break a task into sub-tasks | `{ query: "..." }` |
| `create_task` | Create a task for another agent | `{ description, assignee, priority }` |
| `claim_task` | Pick up a task from the queue | `{ agentId, taskId }` |
| `complete_task` | Mark task as done | `{ taskId, result, status }` |
| `broadcast` | Send event to all agents | `{ event, data }` |
| `claim_resource` | Exclusive lock on a resource | `{ resourceId, agentId, ttlMs }` |
| `release_resource` | Release a resource lock | `{ resourceId, agentId }` |
| `get_state` | Read shared state | `{ key }` |
| `set_state` | Write shared state | `{ key, value }` |

---

## Listing Available Tools

```bash
# Get all available tools
curl http://your-server:3001/api/v1/tools
```

```json
{
  "success": true,
  "tools": [
    { "name": "web_search", "description": "Search the web...", "input_schema": { ... } },
    { "name": "http_request", "description": "Make HTTP requests...", "input_schema": { ... } },
    { "name": "calculator", "description": "Evaluate math...", "input_schema": { ... } },
    { "name": "send_email", "description": "Send email...", "input_schema": { ... } },
    { "name": "knowledge", "description": "Search knowledge bases...", "input_schema": { ... } },
    { "name": "memory", "description": "Store and recall memories...", "input_schema": { ... } },
    { "name": "handoff", "description": "Transfer conversation...", "input_schema": { ... } }
  ],
  "count": 7
}
```

---

## Get Agent Tool Config

```bash
curl http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/tools \
  -H 'x-workspace-id: default'
```

---

## Enable/Disable Tools

```bash
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/tools \
  -H 'Content-Type: application/json' \
  -H 'x-workspace-id: default' \
  -d '{
    "tools": [
      { "tool_name": "web_search", "enabled": true },
      { "tool_name": "calculator", "enabled": true },
      { "tool_name": "http_request", "enabled": false },
      { "tool_name": "knowledge", "enabled": true },
      { "tool_name": "memory", "enabled": true },
      { "tool_name": "send_email", "enabled": false },
      { "tool_name": "handoff", "enabled": true }
    ]
  }'
```

---

## Test a Tool

```bash
curl -X POST http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/tools/test/calculator \
  -H 'Content-Type: application/json' \
  -d '{"input": {"expression": "42 * 3.14"}}'
```

```json
{
  "success": true,
  "tool_name": "calculator",
  "input": { "expression": "42 * 3.14" },
  "result": { "success": true, "result": 131.88, "formatted": "131.88" }
}
```

---

## Adding Custom Tools

To add a new tool to Vutler, you need to modify the server-side `services/tools.js`:

### 1. Define the tool schema

Add to the `AVAILABLE_TOOLS` object:

```javascript
my_custom_tool: {
  name: 'my_custom_tool',
  description: 'What this tool does',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'integer', description: 'Second parameter' }
    },
    required: ['param1']
  }
}
```

### 2. Implement the handler

Add a method to the `ToolsService` class:

```javascript
static async _executeMyCustomTool(input, config) {
  const { param1, param2 = 0 } = input;
  // Your logic here
  return { success: true, result: '...' };
}
```

### 3. Register in the dispatcher

Add a case in `executeTool()`:

```javascript
case 'my_custom_tool':
  return await this._executeMyCustomTool(input, config);
```

### 4. Restart the server

```bash
docker compose restart vutler-api
```

---

## Tool Permission Model

- Tools are **disabled by default** for new agents
- Each tool must be explicitly enabled per agent via `PUT /agents/:id/tools`
- Tool configs are stored in PostgreSQL `agent_tools` table
- The `http_request` tool has an additional **URL allowlist** security layer
- All tool enable/disable actions are logged in `audit_logs`
