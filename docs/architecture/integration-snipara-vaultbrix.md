# Integration Guide: Snipara & Vaultbrix

**Version:** 1.0  
**Date:** 2026-02-16  
**Status:** Draft

---

## 1. Overview

Vutler integrates with two critical external services:
- **Vaultbrix**: PostgreSQL database (Supabase-compatible) for structured data
- **Snipara**: Agent context/memory service for semantic search and knowledge retrieval

This document defines integration architecture, API contracts, and implementation patterns.

---

## 2. Vaultbrix Integration (PostgreSQL)

### 2.1 Architecture

**What is Vaultbrix:**
- PostgreSQL 16+ database service
- Supabase-compatible (REST API + Realtime subscriptions)
- Managed by Starbox team
- Provides: ACID transactions, relational queries, row-level security (optional)

**Integration Pattern:**
```
Vutler App → pg driver (node-postgres) → Vaultbrix (PostgreSQL)
             ↓
          ORM/Query Builder (Prisma or Kysely)
```

**Why not Supabase SDK?**
- MVP uses direct PostgreSQL driver (simpler, no SDK lock-in)
- Post-MVP: Use Supabase client for Realtime features (live queries)

### 2.2 Connection Configuration

**Environment variables:**
```bash
POSTGRES_HOST=vaultbrix.starbox.ai
POSTGRES_PORT=5432
POSTGRES_DB=vutler
POSTGRES_USER=vutler_app
POSTGRES_PASSWORD=<secure-password>
POSTGRES_SSL=true
POSTGRES_MAX_CONNECTIONS=20
```

**Connection string:**
```
postgresql://vutler_app:<password>@vaultbrix.starbox.ai:5432/vutler?sslmode=require
```

**Connection pooling (pg-pool):**
```typescript
// src/database/vaultbrix.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;
```

### 2.3 Schema Management

**ORM Choice: Prisma** (TypeScript-first, strong typing)

**Prisma schema (`prisma/schema.prisma`):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("POSTGRES_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Agent {
  id          String   @id @default(uuid())
  name        String
  email       String   @unique
  role        String   @default("agent")
  status      String   @default("active")
  avatarUrl   String?  @map("avatar_url")
  contextId   String?  @map("context_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  messages    Message[]
  files       File[]
  
  @@map("agents")
}

model Message {
  id          String   @id @default(uuid())
  channelId   String   @map("channel_id")
  authorId    String   @map("author_id")
  text        String
  threadId    String?  @map("thread_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  
  author      Agent    @relation(fields: [authorId], references: [id])
  channel     Channel  @relation(fields: [channelId], references: [id])
  
  @@index([channelId, createdAt])
  @@map("messages")
}

// ... (rest of schema from database-schema.md)
```

**Migrations:**
```bash
# Generate migration
npx prisma migrate dev --name add_agents_table

# Apply to Vaultbrix
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### 2.4 Data Access Patterns

**Example: Create agent**
```typescript
// src/services/agent.service.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function createAgent(data: {
  name: string;
  email: string;
  role?: string;
}) {
  return await prisma.agent.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role || 'agent',
      status: 'active',
    },
  });
}
```

**Example: Get channel messages (paginated)**
```typescript
export async function getChannelMessages(
  channelId: string,
  limit: number = 50,
  before?: Date
) {
  return await prisma.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(before && { createdAt: { lt: before } }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  });
}
```

### 2.5 Performance Optimization

**Caching strategy:**
- Cache agent profiles in Redis (TTL: 5 min)
- Cache channel member lists (TTL: 2 min)
- Invalidate on write operations

**Example: Cached agent fetch**
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function getAgent(id: string) {
  const cacheKey = `agent:${id}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Fetch from Vaultbrix
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw new Error('Agent not found');
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(agent));
  
  return agent;
}
```

**Read replicas (Post-MVP):**
```typescript
// Use Vaultbrix read replica for queries
const readPool = new Pool({
  host: 'vaultbrix-replica.starbox.ai',
  // ... same config
});

// Route read queries to replica
export async function getChannelMessagesFromReplica(channelId: string) {
  const client = await readPool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 50',
      [channelId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
```

### 2.6 Error Handling

**Common Vaultbrix errors:**

```typescript
import { Prisma } from '@prisma/client';

export async function createAgentSafe(data: any) {
  try {
    return await prisma.agent.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (email already exists)
      if (error.code === 'P2002') {
        throw new Error('Agent with this email already exists');
      }
      
      // Foreign key constraint violation
      if (error.code === 'P2003') {
        throw new Error('Invalid reference (channel/agent not found)');
      }
    }
    
    // Connection error
    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new Error('Database connection failed');
    }
    
    // Generic error
    throw error;
  }
}
```

**Retry logic for transient failures:**
```typescript
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Only retry on connection/timeout errors
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientKnownRequestError && 
        error.code === 'P1001' // Connection timeout
      ) {
        console.warn(`Retry ${attempt}/${maxRetries} after error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      // Don't retry other errors
      throw error;
    }
  }
  
  throw lastError!;
}
```

---

## 3. Snipara Integration (Context/Memory)

### 3.1 Architecture

**What is Snipara:**
- Agent context and memory service
- Semantic search (vector embeddings)
- Document indexing and retrieval
- MCP (Model Context Protocol) server

**Integration Pattern:**
```
Vutler App → HTTP Client (axios) → Snipara API
             ↓
        MCP Tools (context_query, remember, recall)
```

**Use Cases:**
- Store agent conversation context
- Retrieve relevant memories for agent decisions
- Index Vutler documentation for agents
- Semantic search across messages (post-MVP)

### 3.2 Connection Configuration

**Environment variables:**
```bash
SNIPARA_API_URL=https://api.snipara.ai
SNIPARA_API_KEY=<api-key>
SNIPARA_PROJECT_ID=vutler-production
SNIPARA_TIMEOUT_MS=5000
```

**HTTP client setup:**
```typescript
// src/services/snipara.client.ts
import axios, { AxiosInstance } from 'axios';

class SniparaClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.SNIPARA_API_URL,
      timeout: parseInt(process.env.SNIPARA_TIMEOUT_MS || '5000'),
      headers: {
        'Authorization': `Bearer ${process.env.SNIPARA_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    // Retry logic
    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 429) {
          // Rate limit: wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.client.request(error.config);
        }
        throw error;
      }
    );
  }

  // ... methods below
}

export default new SniparaClient();
```

### 3.3 Key Operations

#### 3.3.1 Store Agent Context

**When:** Agent sends message, joins channel, updates profile

```typescript
interface ContextEntry {
  agentId: string;
  type: 'message' | 'action' | 'decision';
  content: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

async storeContext(entry: ContextEntry): Promise<void> {
  try {
    await this.client.post('/contexts', {
      project_id: process.env.SNIPARA_PROJECT_ID,
      agent_id: entry.agentId,
      type: entry.type,
      content: entry.content,
      metadata: {
        ...entry.metadata,
        timestamp: entry.timestamp || new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to store context in Snipara:', error);
    // Degrade gracefully: Don't fail the main operation
  }
}
```

**Example usage:**
```typescript
// After agent sends message
await sniparaClient.storeContext({
  agentId: message.authorId,
  type: 'message',
  content: `Sent message in #${channel.name}: "${message.text}"`,
  metadata: {
    channelId: channel.id,
    messageId: message.id,
  },
});
```

#### 3.3.2 Retrieve Agent Context

**When:** Agent needs to recall recent activity, answer questions

```typescript
interface ContextQuery {
  agentId: string;
  query: string;
  limit?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

async queryContext(params: ContextQuery): Promise<any[]> {
  const response = await this.client.post('/contexts/query', {
    project_id: process.env.SNIPARA_PROJECT_ID,
    agent_id: params.agentId,
    query: params.query,
    limit: params.limit || 10,
    time_range: params.timeRange,
  });

  return response.data.results;
}
```

**Example usage:**
```typescript
// Agent asks: "What channels am I in?"
const context = await sniparaClient.queryContext({
  agentId: agent.id,
  query: 'channels I joined or am member of',
  limit: 20,
});

// Parse context and generate response
const channels = context
  .filter(c => c.type === 'action' && c.content.includes('joined'))
  .map(c => c.metadata.channelName);
```

#### 3.3.3 Remember (Long-term Memory)

**When:** Agent learns preferences, makes decisions

```typescript
interface Memory {
  agentId: string;
  type: 'fact' | 'decision' | 'preference' | 'learning';
  key: string;
  value: string;
  importance?: number; // 1-10
}

async remember(memory: Memory): Promise<void> {
  await this.client.post('/memories', {
    project_id: process.env.SNIPARA_PROJECT_ID,
    agent_id: memory.agentId,
    type: memory.type,
    key: memory.key,
    value: memory.value,
    importance: memory.importance || 5,
  });
}
```

**Example usage:**
```typescript
// Agent sets preference
await sniparaClient.remember({
  agentId: agent.id,
  type: 'preference',
  key: 'notification_frequency',
  value: 'only urgent messages',
  importance: 7,
});
```

#### 3.3.4 Recall (Retrieve Memory)

**When:** Agent needs to recall learned facts, preferences

```typescript
async recall(agentId: string, query: string): Promise<Memory[]> {
  const response = await this.client.post('/memories/recall', {
    project_id: process.env.SNIPARA_PROJECT_ID,
    agent_id: agentId,
    query: query,
    limit: 5,
  });

  return response.data.memories;
}
```

**Example usage:**
```typescript
// Agent asks: "What's my notification preference?"
const memories = await sniparaClient.recall(
  agent.id,
  'notification frequency preference'
);

if (memories.length > 0) {
  console.log(`Preference: ${memories[0].value}`);
}
```

### 3.4 Integration Points in Vutler

**Where to integrate Snipara:**

| Event | Snipara Action | Purpose |
|-------|----------------|---------|
| **Agent sends message** | `storeContext` (type: message) | Build conversation history |
| **Agent joins channel** | `storeContext` (type: action) | Track agent activity |
| **Agent uploads file** | `storeContext` (type: action) | Log file operations |
| **Agent sets preference** | `remember` (type: preference) | Personalization |
| **Agent makes decision** | `remember` (type: decision) | Decision audit trail |
| **Agent asks question** | `queryContext` + `recall` | Context-aware responses |

**Implementation example:**

```typescript
// src/services/message.service.ts
import sniparaClient from './snipara.client';

export async function sendMessage(data: {
  channelId: string;
  authorId: string;
  text: string;
}) {
  // 1. Create message in Vaultbrix
  const message = await prisma.message.create({ data });

  // 2. Broadcast via DDP (real-time)
  Meteor.publish('messages', message);

  // 3. Store context in Snipara (async, non-blocking)
  sniparaClient.storeContext({
    agentId: data.authorId,
    type: 'message',
    content: `Sent message in channel ${data.channelId}: "${data.text}"`,
    metadata: {
      channelId: data.channelId,
      messageId: message.id,
    },
  }).catch(error => {
    // Log error but don't fail message send
    console.error('Snipara context storage failed:', error);
  });

  return message;
}
```

### 3.5 Error Handling & Fallbacks

**Snipara unavailable:**
```typescript
// Graceful degradation
async function storeContextSafe(entry: ContextEntry): Promise<void> {
  try {
    await sniparaClient.storeContext(entry);
  } catch (error) {
    // Don't fail the main operation
    console.warn('Snipara unavailable, caching context locally');
    
    // Store in local queue (Redis) for retry
    await redis.lpush('snipara:context:queue', JSON.stringify(entry));
  }
}

// Background job: retry queued contexts
async function retryQueuedContexts() {
  const queued = await redis.lrange('snipara:context:queue', 0, 100);
  
  for (const item of queued) {
    try {
      const entry = JSON.parse(item);
      await sniparaClient.storeContext(entry);
      await redis.lrem('snipara:context:queue', 1, item); // Remove from queue
    } catch (error) {
      console.error('Retry failed:', error);
      // Leave in queue for next retry
    }
  }
}
```

**Timeout handling:**
```typescript
// Set lower timeout for non-critical Snipara calls
async function queryContextWithTimeout(params: ContextQuery): Promise<any[]> {
  try {
    return await Promise.race([
      sniparaClient.queryContext(params),
      new Promise<any[]>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      ),
    ]);
  } catch (error) {
    console.warn('Snipara query timeout, using fallback');
    return []; // Return empty, agent proceeds without context
  }
}
```

### 3.6 Performance Optimization

**Batch context storage:**
```typescript
// Buffer contexts and send in batches
class ContextBuffer {
  private buffer: ContextEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds

  constructor() {
    setInterval(() => this.flush(), this.flushInterval);
  }

  add(entry: ContextEntry) {
    this.buffer.push(entry);
    if (this.buffer.length >= 50) {
      this.flush(); // Flush early if buffer full
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, 50); // Take up to 50
    try {
      await sniparaClient.storeBatch(batch);
    } catch (error) {
      console.error('Batch storage failed:', error);
      // Re-queue failed items
      this.buffer.unshift(...batch);
    }
  }
}

export const contextBuffer = new ContextBuffer();
```

---

## 4. Data Flow Examples

### 4.1 Agent Sends Message

```
1. Agent → POST /api/v1/messages { channel, text }
2. Vutler → Validate & create message in Vaultbrix (Prisma)
3. Vutler → Store context in Snipara (async, non-blocking)
4. Vutler → Broadcast message via DDP (WebSocket)
5. Other agents receive message in real-time
```

**Code flow:**
```typescript
// POST /api/v1/messages
export async function handleSendMessage(req: Request, res: Response) {
  const { channelId, text } = req.body;
  const agentId = req.auth.agentId; // From API key

  // 1. Validate permissions
  const isMember = await isChannelMember(channelId, agentId);
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  // 2. Create message in Vaultbrix
  const message = await prisma.message.create({
    data: {
      channelId,
      authorId: agentId,
      text,
    },
  });

  // 3. Store context in Snipara (async)
  contextBuffer.add({
    agentId,
    type: 'message',
    content: `Sent message: "${text}"`,
    metadata: { channelId, messageId: message.id },
  });

  // 4. Broadcast via DDP
  Meteor.publish(`channel:${channelId}:messages`, message);

  // 5. Return response
  res.status(201).json(message);
}
```

### 4.2 Agent Recalls Recent Activity

```
1. Agent → POST /api/v1/context/query { query: "my recent messages" }
2. Vutler → Query Snipara API
3. Snipara → Return relevant context (semantic search)
4. Vutler → Format and return to agent
```

**Code flow:**
```typescript
// POST /api/v1/context/query
export async function handleContextQuery(req: Request, res: Response) {
  const { query } = req.body;
  const agentId = req.auth.agentId;

  // Query Snipara with timeout
  const results = await queryContextWithTimeout({
    agentId,
    query,
    limit: 10,
  });

  // Format response
  const formattedResults = results.map(r => ({
    content: r.content,
    type: r.type,
    timestamp: r.metadata.timestamp,
    relevance: r.score,
  }));

  res.json({ results: formattedResults });
}
```

---

## 5. Testing Integration

### 5.1 Vaultbrix Tests

**Unit test with in-memory PostgreSQL:**
```typescript
// tests/vaultbrix.test.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://test:test@localhost:5433/test' } },
});

describe('Agent Service', () => {
  beforeAll(async () => {
    await prisma.$executeRaw`TRUNCATE agents CASCADE`;
  });

  test('create agent', async () => {
    const agent = await createAgent({
      name: 'Test Agent',
      email: 'test@example.com',
    });

    expect(agent.id).toBeDefined();
    expect(agent.email).toBe('test@example.com');
  });

  test('duplicate email fails', async () => {
    await expect(
      createAgent({ name: 'Duplicate', email: 'test@example.com' })
    ).rejects.toThrow('Agent with this email already exists');
  });
});
```

### 5.2 Snipara Tests

**Mock Snipara API:**
```typescript
// tests/snipara.test.ts
import nock from 'nock';
import sniparaClient from '../src/services/snipara.client';

describe('Snipara Integration', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  test('store context', async () => {
    nock('https://api.snipara.ai')
      .post('/contexts')
      .reply(200, { success: true });

    await expect(
      sniparaClient.storeContext({
        agentId: 'agent-123',
        type: 'message',
        content: 'Test message',
      })
    ).resolves.toBeUndefined();
  });

  test('handle Snipara timeout gracefully', async () => {
    nock('https://api.snipara.ai')
      .post('/contexts')
      .delay(6000) // Longer than timeout
      .reply(200);

    // Should not throw, just log warning
    await expect(
      storeContextSafe({
        agentId: 'agent-123',
        type: 'message',
        content: 'Test',
      })
    ).resolves.toBeUndefined();
  });
});
```

---

## 6. Monitoring & Observability

### 6.1 Metrics to Track

**Vaultbrix:**
- Query latency (p50, p95, p99)
- Connection pool usage
- Slow query count (> 1s)
- Transaction rollback rate

**Snipara:**
- API request latency
- Success rate (2xx responses)
- Timeout rate
- Context queue length (if using buffering)

**Prometheus metrics:**
```typescript
// src/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const sniparaRequestDuration = new Histogram({
  name: 'snipara_request_duration_seconds',
  help: 'Snipara API request duration',
  labelNames: ['operation'],
});

export const sniparaRequestTotal = new Counter({
  name: 'snipara_request_total',
  help: 'Total Snipara API requests',
  labelNames: ['operation', 'status'],
});

export const contextQueueLength = new Gauge({
  name: 'snipara_context_queue_length',
  help: 'Number of contexts queued for retry',
});
```

### 6.2 Alerts

**Critical:**
- Vaultbrix connection pool exhausted → PagerDuty
- Snipara timeout rate > 50% → Slack

**Warning:**
- Snipara context queue length > 1000 → Slack
- Vaultbrix slow query detected → Log

---

## 7. Migration & Rollback

**If Snipara becomes unavailable long-term:**
- Vutler continues to operate (graceful degradation)
- Context storage queued in Redis
- Agents can still send messages, upload files
- Context queries return empty (agents informed)

**If Vaultbrix becomes unavailable:**
- **Critical failure**: App cannot function
- Automatic failover to read replica (if configured)
- Rollback to last backup if corruption detected

---

## 8. OpenClaw Integration (NEW - Agent Builder)

### 8.1 Architecture

**What is OpenClaw:**
- Agent orchestration platform (built by Starbox)
- Provides full agent runtime: LLM access, tools (browser, exec, files), MCP, memory
- Runs in Docker containers
- CLI for agent lifecycle management

**Integration Pattern:**
```
Vutler Agent Builder → Docker API (dockerode) → Launch OpenClaw container
                       ↓
                  Configure agent (env vars, volumes, networking)
                       ↓
                  Monitor health (heartbeat, logs)
```

**Use Case:**
- When user creates agent via Agent Builder, Vutler launches an OpenClaw container
- Agent runs autonomously, connects to Vutler via API
- Vutler monitors health, can start/stop/restart agents

---

### 8.2 Docker Container Configuration

**OpenClaw Image:**
```
openclaw/runtime:latest
```

**Environment Variables (passed to container):**
```bash
# Agent Identity
AGENT_ID=agent-uuid                      # Vutler agent ID
AGENT_NAME="Support Bot"                 # Agent display name
AGENT_EMAIL=support-bot@vutler.team      # Agent email

# Vutler Connection
VUTLER_API_URL=https://vutler.team       # Vutler API endpoint
VUTLER_API_KEY=clx_generated_key         # API key for this agent
VUTLER_WEBSOCKET_URL=wss://vutler.team/websocket

# LLM Configuration
LLM_MODEL=anthropic/claude-sonnet-4      # From agent_configs.model
ANTHROPIC_API_KEY=<from-vutler-secrets>  # Vutler manages API keys
OPENAI_API_KEY=<from-vutler-secrets>

# Agent Behavior (from agent_configs)
SYSTEM_PROMPT="You are a helpful..."     # From agent_configs.system_prompt
TOOLS=email,web_search,knowledge_base    # Comma-separated tools
PERSONALITY="helpful, patient"           # From agent_configs.personality

# OpenClaw Configuration
OPENCLAW_WORKSPACE=/workspace            # Mounted volume
OPENCLAW_MODE=agent                      # Run as agent (not interactive)
OPENCLAW_AUTO_CONNECT=true               # Auto-connect to Vutler on start

# Snipara Context (optional)
SNIPARA_API_URL=https://api.snipara.ai
SNIPARA_API_KEY=<from-vutler-config>
SNIPARA_PROJECT_ID=vutler-production
SNIPARA_CONTEXT_ID=<agent-specific>

# Resource Limits (from agent_configs.resource_limits)
MEMORY_LIMIT=512M
CPU_LIMIT=0.5
```

**Docker Compose Service (example):**
```yaml
services:
  agent-support-bot:
    image: openclaw/runtime:latest
    container_name: vutler-agent-<agent-uuid>
    hostname: support-bot
    
    environment:
      - AGENT_ID=<agent-uuid>
      - AGENT_NAME=Support Bot
      - VUTLER_API_URL=https://vutler.team
      - VUTLER_API_KEY=clx_generated_key
      - LLM_MODEL=anthropic/claude-sonnet-4
      - SYSTEM_PROMPT="You are a helpful customer support agent..."
      - TOOLS=email,web_search,knowledge_base
      - OPENCLAW_MODE=agent
      - OPENCLAW_AUTO_CONNECT=true
    
    volumes:
      - agent-<agent-uuid>-workspace:/workspace
      - /var/run/docker.sock:/var/run/docker.sock # If agent needs exec tool
    
    networks:
      - vutler-network
    
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
    
    restart: unless-stopped
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    
    labels:
      - "vutler.agent.id=<agent-uuid>"
      - "vutler.agent.name=Support Bot"
      - "vutler.managed=true"

volumes:
  agent-<agent-uuid>-workspace:

networks:
  vutler-network:
    external: true
```

---

### 8.3 Agent Lifecycle Management

#### 8.3.1 Create Agent

**Flow:**
1. User creates agent via API: `POST /builder/agents`
2. Vutler creates agent record in `agents` table
3. Vutler creates agent config in `agent_configs`
4. Vutler generates API key for agent
5. **If `auto_start=true`**: Launch OpenClaw container
6. Update `agent_runtime_state` with container ID and status

**Code (TypeScript):**
```typescript
// src/services/agent-builder.service.ts
import Docker from 'dockerode';
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function createAndStartAgent(data: {
  name: string;
  template_id?: string;
  config: AgentConfig;
  auto_start: boolean;
}) {
  // 1. Create agent record
  const agent = await prisma.agent.create({
    data: {
      name: data.name,
      email: `${slugify(data.name)}@vutler.team`,
      role: 'agent',
      status: 'inactive',
    },
  });

  // 2. Create agent config
  const config = await prisma.agentConfig.create({
    data: {
      agent_id: agent.id,
      ...data.config,
    },
  });

  // 3. Generate API key
  const apiKey = await generateApiKey(agent.id);

  // 4. Create runtime state record
  await prisma.agentRuntimeState.create({
    data: {
      agent_id: agent.id,
      status: 'stopped',
    },
  });

  // 5. Launch container (if auto_start)
  if (data.auto_start) {
    await startAgentContainer(agent.id);
  }

  return { agent, config, apiKey };
}
```

---

#### 8.3.2 Start Agent

**Flow:**
1. Load agent config from `agent_configs`
2. Create Docker container with OpenClaw image
3. Pass environment variables (agent ID, API key, model, tools, etc.)
4. Start container
5. Update `agent_runtime_state` (status: starting → running)
6. Monitor health via Docker healthcheck

**Code:**
```typescript
export async function startAgentContainer(agentId: string): Promise<void> {
  // Load config
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  const config = await prisma.agentConfig.findUnique({ where: { agent_id: agentId } });
  if (!agent || !config) throw new Error('Agent not found');

  // Get API key
  const apiKey = await getAgentApiKey(agentId);

  // Update runtime state to 'starting'
  await prisma.agentRuntimeState.update({
    where: { agent_id: agentId },
    data: { status: 'starting' },
  });

  // Create Docker container
  const container = await docker.createContainer({
    Image: 'openclaw/runtime:latest',
    name: `vutler-agent-${agentId}`,
    Hostname: slugify(agent.name),
    Env: [
      `AGENT_ID=${agentId}`,
      `AGENT_NAME=${agent.name}`,
      `AGENT_EMAIL=${agent.email}`,
      `VUTLER_API_URL=${process.env.VUTLER_API_URL}`,
      `VUTLER_API_KEY=${apiKey}`,
      `LLM_MODEL=${config.model}`,
      `SYSTEM_PROMPT=${config.system_prompt}`,
      `TOOLS=${config.tools.join(',')}`,
      `PERSONALITY=${config.personality}`,
      `OPENCLAW_MODE=agent`,
      `OPENCLAW_AUTO_CONNECT=true`,
      // ... (LLM API keys from Vutler secrets)
    ],
    HostConfig: {
      Memory: config.resource_limits.memory_mb * 1024 * 1024,
      NanoCpus: config.resource_limits.cpus * 1e9,
      RestartPolicy: { Name: 'unless-stopped' },
      NetworkMode: 'vutler-network',
      Binds: [
        `vutler-agent-${agentId}-workspace:/workspace`,
      ],
    },
    Labels: {
      'vutler.agent.id': agentId,
      'vutler.agent.name': agent.name,
      'vutler.managed': 'true',
    },
  });

  // Start container
  await container.start();

  // Update runtime state
  await prisma.agentRuntimeState.update({
    where: { agent_id: agentId },
    data: {
      status: 'running',
      container_id: container.id,
      started_at: new Date(),
    },
  });

  // Start health monitoring
  monitorAgentHealth(agentId);
}
```

---

#### 8.3.3 Stop Agent

**Flow:**
1. Graceful shutdown: Send SIGTERM to container
2. Wait up to 30s for clean shutdown
3. Force kill if still running (SIGKILL)
4. Update `agent_runtime_state` (status: stopped)

**Code:**
```typescript
export async function stopAgentContainer(agentId: string): Promise<void> {
  const runtimeState = await prisma.agentRuntimeState.findUnique({
    where: { agent_id: agentId },
  });

  if (!runtimeState?.container_id) {
    throw new Error('Agent not running');
  }

  // Update status to 'stopping'
  await prisma.agentRuntimeState.update({
    where: { agent_id: agentId },
    data: { status: 'stopping' },
  });

  // Get container
  const container = docker.getContainer(runtimeState.container_id);

  try {
    // Graceful stop (30s timeout)
    await container.stop({ t: 30 });
  } catch (error) {
    // Force kill if stop fails
    console.warn(`Force killing container ${runtimeState.container_id}`);
    await container.kill();
  }

  // Update runtime state
  await prisma.agentRuntimeState.update({
    where: { agent_id: agentId },
    data: {
      status: 'stopped',
      stopped_at: new Date(),
    },
  });
}
```

---

#### 8.3.4 Restart Agent

**Flow:**
1. Stop agent (graceful)
2. Wait for stop to complete
3. Start agent (with new config)

**Code:**
```typescript
export async function restartAgentContainer(agentId: string): Promise<void> {
  await stopAgentContainer(agentId);
  
  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await startAgentContainer(agentId);
}
```

---

### 8.4 Health Monitoring

**Health Check Strategy:**
- Docker healthcheck every 30s: `curl http://localhost:8080/health`
- OpenClaw agent exposes `/health` endpoint (returns `{ status: "ok", uptime: 3600 }`)
- Vutler polls `agent_runtime_state.last_heartbeat`
- If heartbeat > 60s old → mark as unhealthy
- If unhealthy for 5 min → auto-restart (configurable)

**Background Job (runs every minute):**
```typescript
// src/jobs/monitor-agent-health.ts
export async function monitorAllAgents(): Promise<void> {
  const runningAgents = await prisma.agentRuntimeState.findMany({
    where: { status: 'running' },
  });

  for (const state of runningAgents) {
    const container = docker.getContainer(state.container_id);
    
    try {
      // Get container stats
      const inspect = await container.inspect();
      const stats = await container.stats({ stream: false });

      // Update resource usage
      await prisma.agentRuntimeState.update({
        where: { agent_id: state.agent_id },
        data: {
          cpu_percent: calculateCpuPercent(stats),
          memory_mb: stats.memory_stats.usage / (1024 * 1024),
          health: inspect.State.Health?.Status === 'healthy' ? 'healthy' : 'unhealthy',
          last_heartbeat: new Date(),
          uptime_seconds: Math.floor((Date.now() - new Date(inspect.State.StartedAt).getTime()) / 1000),
        },
      });

      // Auto-restart if unhealthy for > 5 min
      if (inspect.State.Health?.Status === 'unhealthy') {
        const unhealthySince = new Date(inspect.State.Health.Log[0].End);
        if (Date.now() - unhealthySince.getTime() > 5 * 60 * 1000) {
          console.warn(`Auto-restarting unhealthy agent: ${state.agent_id}`);
          await restartAgentContainer(state.agent_id);
        }
      }
    } catch (error) {
      console.error(`Health check failed for agent ${state.agent_id}:`, error);
      
      // Mark as error
      await prisma.agentRuntimeState.update({
        where: { agent_id: state.agent_id },
        data: {
          status: 'error',
          last_error: error.message,
          error_count: { increment: 1 },
        },
      });
    }
  }
}
```

---

### 8.5 Log Collection

**Strategy:**
- Stream Docker container logs to `agent_logs` table
- Keep last 7 days in PostgreSQL
- Archive older logs to S3

**Code:**
```typescript
export async function collectAgentLogs(agentId: string): Promise<void> {
  const runtimeState = await prisma.agentRuntimeState.findUnique({
    where: { agent_id: agentId },
  });

  if (!runtimeState?.container_id) return;

  const container = docker.getContainer(runtimeState.container_id);
  
  // Stream logs (last 100 lines)
  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    tail: 100,
    timestamps: true,
  });

  // Parse logs and insert into DB
  const logLines = logStream.toString().split('\n').filter(Boolean);
  
  for (const line of logLines) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (.+)$/);
    if (!match) continue;

    const [, timestamp, message] = match;
    
    // Parse log level (if present)
    const levelMatch = message.match(/^\[(\w+)\]/);
    const level = levelMatch ? levelMatch[1] : 'INFO';

    await prisma.agentLog.create({
      data: {
        agent_id: agentId,
        timestamp: new Date(timestamp),
        level,
        message: message.replace(/^\[\w+\]\s*/, ''),
        source: 'runtime',
      },
    });
  }
}
```

---

### 8.6 OpenClaw Agent Startup Behavior

**OpenClaw Container Startup:**
1. Container starts with `OPENCLAW_MODE=agent`
2. OpenClaw reads `SYSTEM_PROMPT`, `TOOLS`, `VUTLER_API_URL` from env
3. OpenClaw auto-connects to Vutler WebSocket (DDP)
4. OpenClaw subscribes to assigned channels
5. Agent starts listening for messages, responds autonomously

**Agent Auto-Join Channels:**
- On first start, agent joins default channels (e.g., `#general`, `#agents`)
- Admin can assign agent to specific channels via UI
- Agent can be mentioned in any channel it's a member of

**Example: OpenClaw Agent Init:**
```typescript
// Inside OpenClaw container (simplified)
async function initializeAgent() {
  const agentId = process.env.AGENT_ID;
  const apiKey = process.env.VUTLER_API_KEY;
  const systemPrompt = process.env.SYSTEM_PROMPT;
  const tools = process.env.TOOLS.split(',');

  // Connect to Vutler
  const vutler = new VutlerClient({
    apiUrl: process.env.VUTLER_API_URL,
    wsUrl: process.env.VUTLER_WEBSOCKET_URL,
    apiKey,
  });

  await vutler.connect();

  // Update presence
  await vutler.setPresence({ status: 'online', status_text: 'Ready to help!' });

  // Subscribe to channels
  const channels = await vutler.getMyChannels();
  for (const channel of channels) {
    vutler.subscribe('channels.messages', [channel.id], (message) => {
      handleMessage(message); // Agent responds if mentioned or in DM
    });
  }

  console.log(`Agent ${agentId} initialized and listening`);
}
```

---

### 8.7 Resource Management

**Per-Agent Limits (from `agent_configs.resource_limits`):**
- **CPU**: 0.5 cores (default), max 2 cores
- **Memory**: 512 MB (default), max 2 GB
- **Storage**: 1 GB (workspace volume)

**Vutler-Wide Limits:**
- **Max concurrent agents**: 50 (MVP), 500 (post-MVP with autoscaling)
- **Total CPU**: 80% of host (leave 20% for Vutler core)
- **Total Memory**: 80% of host

**Resource Monitoring:**
- Alert if Vutler host CPU > 90%
- Auto-stop idle agents (no activity for 24h)
- Admins can set custom limits per agent

---

### 8.8 Security Considerations

**Container Isolation:**
- Agents run in isolated Docker containers (separate network namespace)
- No direct access to Vutler database (only via API)
- No access to host filesystem (except mounted workspace)

**API Key Security:**
- Each agent gets unique API key (scoped to agent's permissions)
- Keys stored hashed in `api_keys` table
- Rotated on agent restart (optional)

**Tool Restrictions:**
- `exec` tool: Only if explicitly enabled (requires `--privileged` or Docker socket mount)
- `file_access` tool: Limited to agent's workspace volume
- `web_search` tool: Rate-limited (100 req/hour per agent)

---

### 8.9 Fallback: LLM API Runtime

**For simple agents without tools:**
- `runtime_type = 'llm_api'` (in `agent_configs`)
- No Docker container needed
- Vutler directly calls LLM API (OpenAI, Anthropic)
- Agent responds to messages via Vutler backend (not autonomous)

**Trade-offs:**
- **Pros**: Lower resource usage, faster startup, simpler
- **Cons**: No tools, no autonomy, basic functionality only

**Use case:** Simple bots (FAQ, greeting, simple Q&A)

---

## 9. References

- [Prisma Documentation](https://www.prisma.io/docs)
- [Snipara API Docs](https://docs.snipara.ai)
- [Vaultbrix PostgreSQL Guide](https://vaultbrix.starbox.ai/docs)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Docker SDK (dockerode)](https://github.com/apocas/dockerode)
- [OpenClaw Documentation](https://github.com/starbox-ai/openclaw)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | AI Architecture Team | Initial integration guide |
| 1.1 | 2026-02-16 | AI Architecture Team | Added OpenClaw integration (Agent Builder) |
