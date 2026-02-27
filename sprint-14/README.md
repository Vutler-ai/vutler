# Agent Runtime Engine — Sprint 14

**Status:** ✅ Complete and ready for deployment  
**Built by:** Mike ⚙️ (Lead Engineer, INTP)  
**Target:** Vutler workspace agents

## Overview

This is the agent runtime engine that transforms Vutler agents from simple chat bots into **living, autonomous agents** with:

- ✅ **Tool execution** — Tasks, goals, memories, email, web search, calendar
- ✅ **Active memory** — Recall context, auto-save conversations, decay old memories
- ✅ **Agentic loop** — Think → act → observe → repeat (max 10 iterations)
- ✅ **Streaming support** — Real-time response streaming
- ✅ **Dynamic system prompts** — SOUL + MBTI + context + tasks + memories
- ✅ **Graceful error handling** — Tools can fail without crashing the loop

## Architecture

### Core Components

#### 1. `agent-loop.js` — The Brain
Main orchestration loop:
```
User message →
  Recall memories →
  Build system prompt (SOUL + MBTI + context) →
  Call LLM with tools →
  Parse response →
  Execute tools →
  Observe results →
  Loop (max 10x) →
  Save memories →
  Respond to user
```

**Key features:**
- Max 10 tool iterations per message (prevents infinite loops)
- Streaming and non-streaming modes
- Updates `agent_runtime_status` table
- Logs all tool calls for debugging

#### 2. `memory-manager.js` — The Memory
Handles agent memory:
- **Recall:** Top 5 relevant memories for context
- **Save:** Store conversations, facts, decisions, observations
- **Auto-save:** Extract important facts from conversations
- **Decay:** Reduce importance of old, unused memories
- **Cleanup:** Delete memories with decay_factor = 0

#### 3. `system-prompt-builder.js` — The Identity
Dynamically builds system prompts:
- Agent name, role, MBTI type
- SOUL (core identity/personality)
- Recent memories (top 5)
- Assigned tasks (active, sorted by priority)
- Current date/time
- Custom instructions from `system_prompt_template`

#### 4. Tools (in `runtime/tools/`)

All tools follow the same pattern:
```javascript
class ToolHandler {
  getDefinitions() {
    // Returns Anthropic tool schema
  }
  
  async execute(toolName, args) {
    // Executes the tool
  }
}
```

**Available tools:**

| Tool | File | What it does |
|------|------|--------------|
| `create_task`, `update_task`, `list_tasks`, `get_task` | `tasks.js` | CRUD on tasks table |
| `create_goal`, `update_goal`, `list_goals`, `get_goal` | `goals.js` | CRUD on goals table |
| `store_memory`, `recall_memories`, `search_memories` | `memories.js` | Memory operations |
| `send_email` | `email.js` | Send via Postal API |
| `web_search` | `web-search.js` | Search via Brave API |
| `create_event`, `update_event`, `list_events`, `get_event`, `delete_event` | `calendar.js` | Event CRUD |

### Chat Handler Integration

`chat-handler-runtime.js` provides two integration options:

**Option A: Full handler replacement**
```javascript
const { createRuntimeChatHandler } = require('./chat-handler-runtime');
router.post('/agents/:id/chat', authMiddleware, 
  createRuntimeChatHandler(pgPool, anthropicApiKey)
);
```

**Option B: Minimal wrapper**
```javascript
const { runAgentChat } = require('./chat-handler-runtime');
const result = await runAgentChat(pgPool, anthropicApiKey, agentId, message);
```

## Usage Examples

### Basic chat
```javascript
const AgentLoop = require('./runtime/agent-loop');
const loop = new AgentLoop(pgPool, anthropicApiKey);

const result = await loop.run(agentId, 'Create a task: Review sprint 14');
// result = { response: string, toolCalls: [], iterations: number }
```

### Streaming chat
```javascript
const result = await loop.run(agentId, message, {
  streaming: true,
  onChunk: (text) => {
    console.log(text); // Stream each chunk
  }
});
```

### Example conversation flow

**User:** "Create a task to review the deployment guide, then search for best practices on agent memory management"

**Agent Runtime Flow:**
1. **Iteration 1:** LLM decides to use `create_task`
   - Tool call: `create_task({ title: "Review deployment guide", ... })`
   - Tool result: `{ success: true, task: {...} }`
2. **Iteration 2:** LLM processes task creation, decides to use `web_search`
   - Tool call: `web_search({ query: "agent memory management best practices" })`
   - Tool result: `{ success: true, results: [...] }`
3. **Iteration 3:** LLM synthesizes results, responds to user
   - Stop reason: `end_turn`
   - Final response: "I've created the task and found 5 articles on memory management..."

Total: 3 iterations, 2 tool calls

## Configuration

### Agent LLM Config
Each agent has a config in `agent_llm_configs`:
```sql
{
  agent_id: uuid,
  name: string,
  role: string,
  mbti_type: string,          -- e.g., "INTP"
  soul: text,                  -- Core personality/identity
  capabilities: string[],
  system_prompt_template: text,
  model: string,               -- default: "claude-3-5-sonnet-20241022"
  max_tokens: int,             -- default: 4096
  temperature: float           -- default: 0.7
}
```

### Memory Types
- `fact` — Factual information
- `conversation` — Full conversation history
- `decision` — Important decisions made
- `observation` — Observations about user/context
- `learning` — Things learned

### Task Priorities
- `low`, `medium`, `high`, `urgent`

### Task Statuses
- `todo`, `in_progress`, `done`, `blocked`

## Database Tables Used

| Table | Purpose |
|-------|---------|
| `agent_memories` | Stores agent memories with decay |
| `agent_llm_configs` | Agent identity and LLM settings |
| `agent_runtime_status` | Runtime health tracking |
| `tasks` | Task management |
| `goals` | Long-term goals |
| `events` | Calendar events |

## Error Handling

The runtime is designed to be resilient:

1. **Tool failures don't crash the loop** — Error returned as tool result, LLM can try alternative
2. **Max iterations cap** — Prevents infinite loops
3. **Graceful degradation** — If memory/prompt fails, uses minimal fallback
4. **Runtime status tracking** — `running`, `idle`, `error` states in DB
5. **Comprehensive logging** — All tool calls and errors logged

## Performance Considerations

- **Max 10 iterations** — Most conversations complete in 1-3 iterations
- **Memory recall** — Limited to top 5 memories to reduce token usage
- **Tool batching** — LLM can batch multiple tool calls in one iteration
- **Streaming** — Reduces perceived latency for long responses

## Security

- No user input directly executed (all via LLM → tool schema validation)
- Database queries parameterized (SQL injection safe)
- Agent scoped by `workspace_id` and `agent_id`
- Auth handled by existing JWT + RC middleware
- API keys (Postal, Brave) hardcoded in tool handlers (environment vars recommended for production)

## Monitoring

Check agent health:
```sql
SELECT agent_id, status, last_heartbeat, error_message 
FROM tenant_vutler.agent_runtime_status 
WHERE workspace_id = '00000000-0000-0000-0000-000000000001';
```

Recent tool usage:
```sql
SELECT am.content, am.metadata 
FROM tenant_vutler.agent_memories am 
WHERE am.memory_type = 'conversation' 
  AND am.metadata->>'toolCalls' IS NOT NULL 
ORDER BY am.created_at DESC 
LIMIT 10;
```

## Extending

### Add a new tool

1. Create `runtime/tools/my-tool.js`:
```javascript
const TOOL_DEFINITIONS = [{
  name: 'my_tool',
  description: 'Does something cool',
  input_schema: { ... }
}];

class MyToolHandler {
  constructor(pgPool) { this.pool = pgPool; }
  getDefinitions() { return TOOL_DEFINITIONS; }
  async execute(toolName, args) { ... }
}

module.exports = MyToolHandler;
```

2. Register in `agent-loop.js`:
```javascript
const MyToolHandler = require('./tools/my-tool');

initializeTools(agentId) {
  this.tools = {
    // ... existing tools
    myTool: new MyToolHandler(this.pool)
  };
}
```

3. Deploy and restart

## Limitations & Future Work

**Current limitations:**
- No semantic memory search (using recency + importance only)
- Postal/Brave API keys hardcoded
- No tool usage analytics dashboard
- Memory decay runs manually (needs cron)

**Future enhancements:**
- Vector embeddings for semantic memory recall
- Tool usage cost tracking
- Agent-to-agent communication
- Scheduled autonomous actions (cron-triggered loops)
- Custom tool marketplace

## Files Structure

```
projects/vutler/sprint-14/
├── runtime/
│   ├── agent-loop.js              # Main runtime
│   ├── memory-manager.js          # Memory ops
│   ├── system-prompt-builder.js   # Dynamic prompts
│   └── tools/
│       ├── tasks.js
│       ├── goals.js
│       ├── memories.js
│       ├── email.js
│       ├── web-search.js
│       └── calendar.js
├── chat-handler-runtime.js        # Chat integration
├── DEPLOYMENT.md                  # Step-by-step deploy
├── README.md                      # This file
└── SUMMARY.md                     # Quick reference
```

## Credits

Built for **Vutler** — A workspace for living AI agents.

**Sprint 14 completed by Mike ⚙️**  
Lead Engineer (INTP) — Clean code, solid architecture, zero bullshit.

---

**Ready to deploy? See [DEPLOYMENT.md](./DEPLOYMENT.md)**
