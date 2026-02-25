# Agent Memory System (Story 7.3)

Persistent memory storage per agent with Postgres backend. Enables agents to remember facts, preferences, context, and conversation summaries across sessions.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Runtime                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  processMessage()                                    │   │
│  │  1. Load conversation history                       │   │
│  │  2. Inject memories into system prompt ──┐          │   │
│  │  3. Process message with LLM              │          │   │
│  │  4. Save conversation                     │          │   │
│  │  5. Auto-extract memories ────────────────┼──────┐   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        │                           │
                        ▼                           ▼
            ┌───────────────────────┐   ┌───────────────────────┐
            │  injectMemoriesInto   │   │  summarizeConversations│
            │       Prompt()        │   │          ()            │
            └───────────────────────┘   └───────────────────────┘
                        │                           │
                        └───────────┬───────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │   PostgreSQL          │
                        │   agent_memories      │
                        └───────────────────────┘
```

## Database Schema

```sql
CREATE TABLE agent_memories (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  memory_type VARCHAR(50) CHECK (memory_type IN ('fact', 'preference', 'context', 'conversation_summary')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL
);
```

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `fact` | Factual information about the user | "The user's name is Alice" |
| `preference` | User preferences and likes | "I prefer dark mode" |
| `context` | Contextual information from interactions | "Working on bug fix for API issue" |
| `conversation_summary` | Summarized previous conversations | "Discussed project roadmap, 3 tasks assigned" |

## API Endpoints

### 1. Store Memory

```bash
POST /api/v1/agents/:id/memories

Body:
{
  "memory_type": "fact",           # Required: fact|preference|context|conversation_summary
  "content": "User prefers email", # Required: the actual memory
  "metadata": {                    # Optional: any JSON metadata
    "source": "conversation",
    "confidence": 0.95,
    "tags": ["communication", "preference"]
  },
  "embedding_text": "...",         # Optional: text for future semantic search
  "expires_at": "2024-12-31T23:59:59Z" # Optional: TTL
}

Response:
{
  "success": true,
  "memory": {
    "id": 123,
    "agent_id": "agent-abc",
    "memory_type": "fact",
    "content": "User prefers email",
    "metadata": {...},
    "created_at": "...",
    "updated_at": "...",
    "expires_at": null
  }
}
```

### 2. List Memories

```bash
GET /api/v1/agents/:id/memories?type=fact&search=email&limit=50&offset=0

Response:
{
  "success": true,
  "memories": [...],
  "total": 123,
  "count": 50
}
```

**Query Parameters:**
- `type`: Filter by memory_type (fact, preference, context, conversation_summary)
- `search`: ILIKE search in content and embedding_text
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

### 3. Delete Memory

```bash
DELETE /api/v1/agents/:id/memories/:memoryId

Response:
{
  "success": true,
  "deleted": "123"
}
```

### 4. Summarize Conversations

Automatically extracts facts and preferences from conversation messages.

```bash
POST /api/v1/agents/:id/memories/summarize

Body:
{
  "messages": [
    { "role": "user", "content": "My name is Alice and I work at Google." },
    { "role": "assistant", "content": "Nice to meet you, Alice!" },
    { "role": "user", "content": "I prefer email over phone calls." }
  ]
}

Response:
{
  "success": true,
  "extracted": 2,
  "facts": [
    { "id": 124, "memory_type": "fact", "content": "My name is Alice and I work at Google." },
    { "id": 125, "memory_type": "preference", "content": "I prefer email over phone calls." }
  ]
}
```

**Auto-extraction patterns:**
- **Preferences:** "I like", "I prefer", "my favorite", "I enjoy"
- **Facts:** "I am", "my name is", "I work at", "I live in"

### 5. Manual Cleanup

```bash
POST /api/v1/agents/:id/memories/cleanup

Response:
{
  "success": true,
  "message": "Cleanup completed"
}
```

## Memory Lifecycle

### Auto-Cleanup Rules

1. **Expired Memories**: Deleted when `expires_at < NOW()`
2. **FIFO Limit**: Max 1000 memories per agent (oldest deleted first)
3. **Manual Cleanup**: Triggered via API or periodic job

### Auto-Extraction

Memories are automatically extracted from conversations:

- **Trigger**: Every 10 messages in a conversation
- **Method**: Pattern matching (MVP) → LLM summarization (future)
- **Stored as**: `fact`, `preference`, or `conversation_summary`

## Integration with Agent Runtime

The `AgentRuntime` class automatically:

1. **Injects memories** into system prompt before processing messages
2. **Auto-extracts facts** every 10 messages
3. **Updates memory lifecycle** (cleanup on store)

### Example: Memory Injection

```javascript
// Before processing
systemPrompt = "You are a helpful assistant."

// After memory injection
systemPrompt = `You are a helpful assistant.

## Your Memories

**Facts about the user or environment:**
1. The user's name is Alice
2. Alice works at Google

**User preferences:**
1. I prefer dark mode
2. I like my coffee black
`
```

## Usage Examples

### JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

// Store a fact
const memory = await fetch('http://localhost:3001/api/v1/agents/my-agent/memories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    memory_type: 'fact',
    content: 'User prefers dark mode',
    metadata: { source: 'settings', confidence: 1.0 }
  })
});

// List all memories
const memories = await fetch('http://localhost:3001/api/v1/agents/my-agent/memories');
const data = await memories.json();
console.log(`Total memories: ${data.total}`);

// Search memories
const results = await fetch('http://localhost:3001/api/v1/agents/my-agent/memories?search=dark+mode');
```

### cURL

```bash
# Store a preference
curl -X POST http://localhost:3001/api/v1/agents/my-agent/memories \
  -H "Content-Type: application/json" \
  -d '{
    "memory_type": "preference",
    "content": "I like concise responses",
    "metadata": {"source": "user_feedback"}
  }'

# List memories filtered by type
curl "http://localhost:3001/api/v1/agents/my-agent/memories?type=preference&limit=10"

# Delete a memory
curl -X DELETE http://localhost:3001/api/v1/agents/my-agent/memories/123
```

## Testing

Run the test suite:

```bash
node test-memory.js
```

The test script covers:
- ✅ Store memories (all types)
- ✅ List and filter memories
- ✅ Search memories
- ✅ Delete memories
- ✅ Conversation summarization
- ✅ Memory cleanup
- ✅ Pagination
- ✅ Validation (invalid types, missing fields)

## Performance Considerations

### Indexes

The following indexes are created for optimal performance:

```sql
-- Agent queries
CREATE INDEX idx_agent_memories_agent_id ON agent_memories(agent_id);

-- Type filtering
CREATE INDEX idx_agent_memories_type ON agent_memories(agent_id, memory_type);

-- Expiry cleanup
CREATE INDEX idx_agent_memories_expires ON agent_memories(expires_at) WHERE expires_at IS NOT NULL;

-- Sorting by creation date
CREATE INDEX idx_agent_memories_created ON agent_memories(agent_id, created_at DESC);

-- Full-text search (future)
CREATE INDEX idx_agent_memories_content_search ON agent_memories USING GIN (to_tsvector('english', content));
```

### Best Practices

1. **Limit memory injection**: Use `maxMemories` parameter to avoid bloating system prompt
2. **Set expiry for temporary context**: Use `expires_at` for session-specific memories
3. **Use metadata for filtering**: Store structured tags for efficient retrieval
4. **Periodic cleanup**: Run cleanup job daily to remove expired memories

## Future Enhancements

### Phase 2: Vector Search
- Store embeddings in `embedding_text` column
- Use pgvector extension for semantic similarity search
- Replace ILIKE with vector cosine similarity

### Phase 3: LLM Summarization
- Use LLM to summarize conversations instead of pattern matching
- Extract more nuanced facts and preferences
- Generate conversation summaries automatically

### Phase 4: Memory Importance Scoring
- Rank memories by importance/relevance
- Prioritize injection based on current context
- Auto-archive low-importance memories

## Troubleshooting

### "Database not available" error
**Cause**: PostgreSQL connection not initialized

**Fix**: Ensure `DATABASE_URL` environment variable is set:
```bash
export DATABASE_URL="postgresql://vutler:vutler@localhost:5432/vutler"
```

### Memories not appearing in agent responses
**Cause**: Agent runtime not injecting memories

**Fix**: Verify agent runtime has access to `pg` connection:
```javascript
const rt = new AgentRuntime(agentId, config, pgPool);
```

### Cleanup not removing old memories
**Cause**: No cron job or manual trigger

**Fix**: Set up a cron job or call cleanup API periodically:
```bash
# Every hour
0 * * * * curl -X POST http://localhost:3001/api/v1/agents/my-agent/memories/cleanup
```

## Migration

Run the migration to create the table:

```bash
psql $DATABASE_URL < migrations/007_agent_memories.sql
```

Or let the API auto-create it on first use (ensureTables).

## Related Files

- **API Router**: `app/custom/api/agent-memory.js`
- **Integration**: `app/custom/api/agent-runtime.js`
- **Migration**: `migrations/007_agent_memories.sql`
- **Tests**: `test-memory.js`
- **Server**: `app/custom/index.js` (mounts router, initializes PG)

---

**Story**: 7.3 — Agent Memory (5 SP)  
**Sprint**: 7  
**Status**: ✅ Complete  
**Date**: 2026-02-24
