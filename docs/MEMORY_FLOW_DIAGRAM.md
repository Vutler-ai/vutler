# Agent Memory System — Flow Diagrams

## 1. Memory Storage Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /api/v1/agents/:id/memories
       │ { type: "fact", content: "User prefers dark mode" }
       ▼
┌──────────────────────────────────────────┐
│  Express Router (agent-memory.js)        │
│  ┌────────────────────────────────────┐  │
│  │ 1. Validate input                  │  │
│  │    - Check memory_type enum        │  │
│  │    - Require content               │  │
│  ├────────────────────────────────────┤  │
│  │ 2. Store in Postgres               │  │
│  │    INSERT INTO agent_memories...   │  │
│  ├────────────────────────────────────┤  │
│  │ 3. Auto-cleanup                    │  │
│  │    - Delete expired (expires_at)   │  │
│  │    - FIFO limit (keep 1000 max)    │  │
│  └────────────────────────────────────┘  │
└──────────────┬───────────────────────────┘
               │
               ▼
        ┌──────────────┐
        │  PostgreSQL  │
        │ agent_memories│
        └──────────────┘
```

## 2. Memory Injection Flow (Agent Runtime)

```
┌──────────────┐
│ User Message │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  AgentRuntime.processMessage()                      │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ 1. Load conversation history               │    │
│  │    FROM agent_conversations                │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 2. Load memories from Postgres             │    │
│  │    SELECT * FROM agent_memories            │    │
│  │    WHERE agent_id = :id                    │    │
│  │    ORDER BY created_at DESC LIMIT 20       │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 3. Inject into system prompt               │    │
│  │    "You are a helpful assistant.           │    │
│  │     ## Your Memories                       │    │
│  │     Facts:                                 │    │
│  │     1. User prefers dark mode              │    │
│  │     2. User's name is Alice"               │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 4. Send to LLM                             │    │
│  │    [system: prompt + memories]             │    │
│  │    [history: past 40 messages]             │    │
│  │    [user: current message]                 │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 5. Get LLM response                        │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 6. Save conversation                       │    │
│  └────────────────────────────────────────────┘    │
│                     │                               │
│                     ▼                               │
│  ┌────────────────────────────────────────────┐    │
│  │ 7. Auto-extract memories (every 10 msgs)   │    │
│  │    IF history.length % 10 == 0:            │    │
│  │       - Extract facts (pattern matching)   │    │
│  │       - Extract preferences                │    │
│  │       - Store in Postgres                  │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## 3. Memory Retrieval & Search

```
┌────────────┐
│   Client   │
└─────┬──────┘
      │ GET /api/v1/agents/:id/memories?type=fact&search=dark
      ▼
┌─────────────────────────────────────────────────────────┐
│  Express Router                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Build SQL query                                   │ │
│  │   WHERE agent_id = :id                            │ │
│  │   AND memory_type = 'fact'                        │ │
│  │   AND (content ILIKE '%dark%'                     │ │
│  │        OR embedding_text ILIKE '%dark%')          │ │
│  │   AND (expires_at IS NULL OR expires_at > NOW())  │ │
│  │   ORDER BY created_at DESC                        │ │
│  │   LIMIT 50 OFFSET 0                               │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   PostgreSQL    │
              │  agent_memories │
              │                 │
              │  Indexes:       │
              │  - agent_id     │
              │  - (agent_id,   │
              │    memory_type) │
              │  - content GIN  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Return results │
              │  [              │
              │    {id: 1, ...},│
              │    {id: 5, ...} │
              │  ]              │
              └─────────────────┘
```

## 4. Auto-Extract from Conversation

```
┌──────────────────────────────────────────┐
│  Conversation Messages (10+ messages)    │
│  [                                       │
│    {role: 'user', content: 'I like...'},│
│    {role: 'assistant', content: '...'},│
│    ...                                   │
│  ]                                       │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  summarizeConversations()                            │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ 1. Pattern matching                            │ │
│  │    Regex: /I like|I prefer|my favorite/        │ │
│  │    → Extract preferences                       │ │
│  │                                                 │ │
│  │    Regex: /I am|my name is|I work at/          │ │
│  │    → Extract facts                             │ │
│  └────────────────────────────────────────────────┘ │
│                     │                                │
│                     ▼                                │
│  ┌────────────────────────────────────────────────┐ │
│  │ 2. Store extracted memories                    │ │
│  │    INSERT INTO agent_memories                  │ │
│  │    (agent_id, type, content, metadata)         │ │
│  │    VALUES (:id, 'preference', :content,        │ │
│  │            '{"source": "auto_extract"}')       │ │
│  └────────────────────────────────────────────────┘ │
│                     │                                │
│                     ▼                                │
│  ┌────────────────────────────────────────────────┐ │
│  │ 3. Create conversation summary                 │ │
│  │    IF messages.length > 5:                     │ │
│  │       INSERT conversation_summary              │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## 5. Memory Lifecycle & Cleanup

```
┌─────────────────────────────────────────────────────┐
│  Trigger: After storing any memory                  │
│           OR manual cleanup API call                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  cleanupMemories(agentId)    │
        └──────────────┬───────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│ Delete Expired      │    │ FIFO Limit (1000)   │
│                     │    │                     │
│ DELETE FROM         │    │ DELETE FROM         │
│ agent_memories      │    │ agent_memories      │
│ WHERE expires_at    │    │ WHERE id IN (       │
│   < NOW()           │    │   SELECT id         │
│                     │    │   ORDER BY created  │
│                     │    │   OFFSET 1000       │
│                     │    │ )                   │
└─────────────────────┘    └─────────────────────┘
         │                           │
         └─────────────┬─────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Cleanup Done  │
              └────────────────┘
```

## 6. End-to-End Example

```
User: "My name is Alice and I prefer dark mode."
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Agent receives message                             │
│                                                     │
│ 1. Load memories:                                  │
│    → [] (no memories yet)                          │
│                                                     │
│ 2. System prompt:                                  │
│    "You are a helpful assistant."                  │
│                                                     │
│ 3. LLM response:                                   │
│    "Nice to meet you, Alice! I've noted your       │
│     preference for dark mode."                     │
│                                                     │
│ 4. Save conversation                               │
│                                                     │
│ 5. Auto-extract (if 10+ messages):                 │
│    → Store fact: "My name is Alice"                │
│    → Store preference: "I prefer dark mode"        │
└────────────────────────────────────────────────────┘
  │
  │ (Later conversation...)
  │
  ▼
User: "What's my name?"
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Agent receives message                             │
│                                                     │
│ 1. Load memories:                                  │
│    → [fact: "My name is Alice"]                    │
│    → [preference: "I prefer dark mode"]            │
│                                                     │
│ 2. System prompt (with memories):                  │
│    "You are a helpful assistant.                   │
│     ## Your Memories                               │
│     Facts:                                         │
│     1. My name is Alice                            │
│     Preferences:                                   │
│     1. I prefer dark mode"                         │
│                                                     │
│ 3. LLM response:                                   │
│    "Your name is Alice!"                           │
│                                                     │
│ 4. Save conversation                               │
└────────────────────────────────────────────────────┘
```

## 7. Data Model

```
┌──────────────────────────────────────────────────────┐
│ agent_memories                                       │
├──────────────────────────────────────────────────────┤
│ id                SERIAL PRIMARY KEY                 │
│ agent_id          VARCHAR(255) NOT NULL              │
│ memory_type       VARCHAR(50) ∈ {fact, preference,  │
│                   context, conversation_summary}     │
│ content           TEXT NOT NULL                      │
│ metadata          JSONB {                            │
│                     source: string,                  │
│                     confidence: float,               │
│                     tags: string[],                  │
│                     ...                              │
│                   }                                  │
│ embedding_text    TEXT (for future vector search)   │
│ created_at        TIMESTAMPTZ DEFAULT NOW()         │
│ updated_at        TIMESTAMPTZ (auto-updated)        │
│ expires_at        TIMESTAMPTZ NULL (optional TTL)   │
└──────────────────────────────────────────────────────┘

Indexes:
  - idx_agent_memories_agent_id (agent_id)
  - idx_agent_memories_type (agent_id, memory_type)
  - idx_agent_memories_expires (expires_at) WHERE expires_at IS NOT NULL
  - idx_agent_memories_created (agent_id, created_at DESC)
  - idx_agent_memories_metadata (metadata) USING GIN
  - idx_agent_memories_content_search (to_tsvector('english', content)) USING GIN
```

---

**Story 7.3 — Agent Memory**  
Mike ⚙️ — 2026-02-24
