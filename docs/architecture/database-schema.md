# Database Schema Design - Vutler

**Version:** 1.0  
**Date:** 2026-02-16  
**Database:** PostgreSQL 16+ (Vaultbrix)

---

## Overview

Vutler uses PostgreSQL as primary database (see ADR-002). This document defines the complete schema for MVP.

**Design Principles:**
- **Relational model**: Clear foreign keys, normalized data
- **snake_case naming**: PostgreSQL convention
- **UUIDs for IDs**: Globally unique, no collision across distributed systems
- **Timestamps**: `created_at`, `updated_at` for all entities
- **Soft deletes**: `deleted_at` for recoverability
- **Indexes**: Optimized for common queries

---

## Entity-Relationship Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   agents    │────┬────│   channels   │────┬────│  messages   │
│             │    │    │              │    │    │             │
│ - id (PK)   │    │    │ - id (PK)    │    │    │ - id (PK)   │
│ - name      │    │    │ - name       │    │    │ - channel_id│
│ - email     │    │    │ - type       │    │    │ - author_id │
│ - role      │    │    │ - topic      │    │    │ - text      │
│ - status    │    │    │              │    │    │ - thread_id │
└─────────────┘    │    └──────────────┘    │    └─────────────┘
                   │                        │
                   │    ┌──────────────┐    │
                   └────│channel_members│───┘
                        │              │
                        │ - channel_id │
                        │ - agent_id   │
                        │ - role       │
                        └──────────────┘

┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   files     │         │email_accounts│         │  presence   │
│             │         │              │         │             │
│ - id (PK)   │         │ - id (PK)    │         │ - agent_id  │
│ - agent_id  │         │ - agent_id   │         │ - status    │
│ - filename  │         │ - email      │         │ - last_seen │
│ - s3_key    │         │ - smtp_cfg   │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
```

---

## Core Tables

### 1. `agents`

Represents AI agents (and optionally human users).

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'agent', -- 'admin', 'agent', 'human_user'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  avatar_url TEXT,
  context_id VARCHAR(255), -- Snipara context ID
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CHECK (role IN ('admin', 'agent', 'human_user')),
  CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX idx_agents_email ON agents(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_status ON agents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_role ON agents(role) WHERE deleted_at IS NULL;
```

**Notes:**
- `context_id`: Links to Snipara context for agent memory
- `deleted_at`: Soft delete (keep data for audit)

---

### 2. `channels`

Chat rooms (public, private, or DM).

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'public', 'private', 'dm'
  topic TEXT,
  description TEXT,
  created_by UUID NOT NULL REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CHECK (type IN ('public', 'private', 'dm'))
);

CREATE INDEX idx_channels_type ON channels(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_channels_created_by ON channels(created_by);
CREATE INDEX idx_channels_name ON channels(name) WHERE deleted_at IS NULL;
```

**Notes:**
- `type = 'dm'`: Direct message (2 members only)
- `type = 'public'`: Anyone can join
- `type = 'private'`: Invite-only

---

### 3. `channel_members`

Many-to-many relationship between agents and channels.

```sql
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'moderator', 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  
  UNIQUE(channel_id, agent_id),
  CHECK (role IN ('owner', 'moderator', 'member'))
);

CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX idx_channel_members_agent ON channel_members(agent_id);
CREATE INDEX idx_channel_members_last_read ON channel_members(last_read_at);
```

**Notes:**
- `last_read_at`: For unread message count
- `role = 'owner'`: Can delete channel, change settings
- `role = 'moderator'`: Can kick members, pin messages

---

### 4. `messages`

Chat messages.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  thread_id UUID REFERENCES messages(id) ON DELETE SET NULL, -- Parent message for threads
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  
  -- Store reactions as JSONB (array of {emoji, agent_ids[]})
  reactions JSONB DEFAULT '[]'::jsonb,
  
  -- Attachments (file IDs)
  attachments JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_messages_channel_time ON messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_author ON messages(author_id);
CREATE INDEX idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

**Notes:**
- `thread_id`: References parent message (for threaded replies)
- `reactions`: JSON array: `[{"emoji": "👍", "agent_ids": ["uuid1", "uuid2"]}]`
- `attachments`: JSON array of file IDs: `["file-uuid1", "file-uuid2"]`

**Example reactions:**
```json
[
  {"emoji": "👍", "agent_ids": ["550e8400-e29b-41d4-a716-446655440000"]},
  {"emoji": "❤️", "agent_ids": ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"]}
]
```

---

### 5. `files`

File metadata (blobs stored in MinIO).

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(127),
  s3_key TEXT NOT NULL UNIQUE, -- MinIO object key
  s3_bucket VARCHAR(127) NOT NULL DEFAULT 'vutler-files',
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL, -- If shared in a channel
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_files_agent ON files(agent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_channel ON files(channel_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_s3_key ON files(s3_key);
```

**Notes:**
- `s3_key`: Unique key in MinIO (e.g., `agents/uuid/filename-timestamp`)
- `channel_id`: Optional (files can be private or shared in channels)

---

### 6. `email_accounts`

Email configuration for agents.

```sql
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  
  -- SMTP config (outgoing mail)
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_username VARCHAR(255) NOT NULL,
  smtp_password_encrypted TEXT NOT NULL, -- Encrypted with app key
  smtp_use_tls BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- IMAP config (incoming mail)
  imap_host VARCHAR(255) NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_username VARCHAR(255) NOT NULL,
  imap_password_encrypted TEXT NOT NULL,
  imap_use_tls BOOLEAN NOT NULL DEFAULT TRUE,
  
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_accounts_agent ON email_accounts(agent_id);
CREATE INDEX idx_email_accounts_email ON email_accounts(email);
```

**Notes:**
- Passwords encrypted with application key (use `pgcrypto` extension)
- One email account per agent (unique constraint on `agent_id`)

---

### 7. `email_threads`

Map email threads to channels.

```sql
CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  subject VARCHAR(511),
  participants TEXT[], -- Array of email addresses
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(email_account_id, subject) -- One channel per email thread
);

CREATE INDEX idx_email_threads_account ON email_threads(email_account_id);
CREATE INDEX idx_email_threads_channel ON email_threads(channel_id);
```

**Notes:**
- When agent receives email, create or find channel for that thread
- Subject used to group email replies into same channel

---

### 8. `presence`

Agent online status (ephemeral, could use Redis instead).

```sql
CREATE TABLE presence (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'offline', -- 'online', 'busy', 'idle', 'offline'
  status_text VARCHAR(255),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (status IN ('online', 'busy', 'idle', 'offline'))
);

CREATE INDEX idx_presence_status ON presence(status);
CREATE INDEX idx_presence_last_seen ON presence(last_seen DESC);
```

**Notes:**
- Could move to Redis for performance (MVP: PostgreSQL is fine)
- Update every 30s via heartbeat

---

### 9. `api_keys`

API keys for agent authentication.

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, -- Bcrypt hash of API key
  key_prefix VARCHAR(10) NOT NULL, -- First 8 chars (for identification)
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'], -- Permissions
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_agent ON api_keys(agent_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

**Notes:**
- API key format: `clx_<random>` (e.g., `clx_a1b2c3d4e5f6g7h8`)
- Store bcrypt hash, never plaintext
- Scopes: `['read', 'write', 'admin', 'files.upload', 'messages.send']`

---

### 10. `sessions`

Web sessions (for human users via UI).

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device VARCHAR(255), -- User-agent
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_agent ON sessions(agent_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash) WHERE expires_at > NOW();
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**Notes:**
- Clean up expired sessions with cron job
- Session TTL: 30 days (configurable)

---

## Agent Builder Tables (NEW)

### 11. `agent_templates`

Pre-configured agent blueprints (Customer Support, Data Analyst, etc.).

```sql
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(10), -- Emoji or icon identifier
  category VARCHAR(100), -- 'support', 'analytics', 'development', etc.
  
  -- Base configuration (JSON)
  base_config JSONB NOT NULL,
  -- Example: {
  --   "model": "anthropic/claude-sonnet-4",
  --   "system_prompt": "You are a helpful...",
  --   "tools": ["email", "knowledge_base"],
  --   "personality": "helpful, patient",
  --   "runtime_type": "openclaw"
  -- }
  
  customizable_fields TEXT[] DEFAULT ARRAY['name', 'system_prompt', 'tools', 'personality'],
  example_usage TEXT,
  
  created_by UUID REFERENCES agents(id) ON DELETE SET NULL, -- Who created this template
  is_public BOOLEAN NOT NULL DEFAULT TRUE, -- Public templates vs private
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_templates_category ON agent_templates(category) WHERE is_public = TRUE;
CREATE INDEX idx_agent_templates_created_by ON agent_templates(created_by);
```

**Notes:**
- `base_config`: JSONB for flexibility (can add new fields without migrations)
- `customizable_fields`: Which fields users can customize when creating agent from template
- Ship with 3-5 default templates (see migration seed)

---

### 12. `agent_configs`

Configuration for each created agent (model, tools, personality).

```sql
CREATE TABLE agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  
  -- LLM configuration
  model VARCHAR(255) NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
  system_prompt TEXT NOT NULL,
  temperature NUMERIC(3, 2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  
  -- Agent behavior
  tools TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['email', 'web_search', 'file_access']
  personality TEXT, -- 'helpful, patient, empathetic'
  
  -- Runtime configuration
  runtime_type VARCHAR(50) NOT NULL DEFAULT 'openclaw', -- 'openclaw', 'llm_api'
  
  -- Resource limits (for Docker containers)
  resource_limits JSONB DEFAULT '{
    "cpus": 0.5,
    "memory_mb": 512,
    "storage_mb": 1024
  }'::jsonb,
  
  -- Advanced settings
  extra_config JSONB DEFAULT '{}'::jsonb, -- Extensible for future settings
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (runtime_type IN ('openclaw', 'llm_api'))
);

CREATE INDEX idx_agent_configs_agent ON agent_configs(agent_id);
CREATE INDEX idx_agent_configs_runtime_type ON agent_configs(runtime_type);
```

**Notes:**
- One config per agent (unique constraint on `agent_id`)
- `runtime_type = 'openclaw'`: Full-featured agent in Docker container
- `runtime_type = 'llm_api'`: Simple agent using direct LLM API (no tools)
- `tools`: Array of tool identifiers (validated against available tools)

---

### 13. `agent_runtime_state`

Runtime state and health for created agents (container management).

```sql
CREATE TABLE agent_runtime_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  
  -- Runtime status
  status VARCHAR(50) NOT NULL DEFAULT 'stopped', -- 'stopped', 'starting', 'running', 'stopping', 'error'
  container_id VARCHAR(255), -- Docker container ID (if runtime_type=openclaw)
  
  -- Health monitoring
  health VARCHAR(50) DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'unknown'
  last_heartbeat TIMESTAMPTZ,
  uptime_seconds BIGINT DEFAULT 0,
  
  -- Resource usage (updated periodically)
  cpu_percent NUMERIC(5, 2),
  memory_mb INTEGER,
  
  -- Lifecycle timestamps
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  
  -- Error tracking
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  restart_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (status IN ('stopped', 'starting', 'running', 'stopping', 'error')),
  CHECK (health IN ('healthy', 'unhealthy', 'unknown'))
);

CREATE INDEX idx_agent_runtime_state_agent ON agent_runtime_state(agent_id);
CREATE INDEX idx_agent_runtime_state_status ON agent_runtime_state(status);
CREATE INDEX idx_agent_runtime_state_health ON agent_runtime_state(health);
CREATE INDEX idx_agent_runtime_state_container ON agent_runtime_state(container_id) WHERE container_id IS NOT NULL;
```

**Notes:**
- `status = 'running'`: Agent container is up and responding
- `health = 'healthy'`: Last heartbeat < 60s ago
- `last_heartbeat`: Updated by agent container health check (every 30s)
- Background job monitors health and restarts unhealthy agents

---

### 14. `agent_logs`

Runtime logs for created agents (debugging, monitoring).

```sql
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(20) NOT NULL, -- 'DEBUG', 'INFO', 'WARN', 'ERROR'
  message TEXT NOT NULL,
  source VARCHAR(50), -- 'runtime', 'agent', 'system'
  
  -- Structured context (optional)
  context JSONB,
  
  CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR'))
);

-- Partition by timestamp for performance (future optimization)
CREATE INDEX idx_agent_logs_agent_time ON agent_logs(agent_id, timestamp DESC);
CREATE INDEX idx_agent_logs_level ON agent_logs(level) WHERE level IN ('ERROR', 'WARN');
CREATE INDEX idx_agent_logs_timestamp ON agent_logs(timestamp DESC);
```

**Notes:**
- Hot logs: Keep last 7 days in PostgreSQL
- Archive older logs to S3 (compressed)
- Use for debugging agent behavior, errors, performance issues

---

## Migrations

We'll use a migration tool (Prisma Migrate or Flyway) for schema versioning.

**Migration 001: Initial schema**
- Create all tables above
- Add indexes
- Add foreign keys

**Migration 002+: Incremental changes**
- Add columns, indexes as needed
- Always have `up` and `down` (rollback) scripts

**Example (Prisma Migrate):**
```bash
npx prisma migrate dev --name initial_schema
npx prisma migrate deploy # Apply to production
```

---

## Sample Data (Seed Script)

For development, seed with:
- 3 agents (admin, agent1, agent2)
- 2 channels (general, random)
- 10 messages
- 1 file
- 3 agent templates (Customer Support, Data Analyst, Code Reviewer)

**Seed script location:** `/scripts/seed.sql` (to be created)

**Default Agent Templates (seed):**

```sql
-- Customer Support Agent Template
INSERT INTO agent_templates (id, name, description, icon, category, base_config, example_usage) VALUES (
  'tmpl-customer-support',
  'Customer Support Agent',
  'Friendly agent for customer inquiries and support tickets',
  '🎧',
  'support',
  '{
    "model": "anthropic/claude-sonnet-4",
    "system_prompt": "You are a helpful and patient customer support agent. Always be polite, empathetic, and solution-focused. Ask clarifying questions when needed.",
    "tools": ["email", "knowledge_base"],
    "personality": "helpful, patient, empathetic",
    "runtime_type": "openclaw"
  }'::jsonb,
  'Great for customer service teams, helpdesk, FAQ answering'
);

-- Data Analyst Agent Template
INSERT INTO agent_templates (id, name, description, icon, category, base_config, example_usage) VALUES (
  'tmpl-data-analyst',
  'Data Analyst Agent',
  'Analyzes data, generates reports, creates visualizations',
  '📊',
  'analytics',
  '{
    "model": "openai/gpt-4",
    "system_prompt": "You are a data analyst. Analyze data thoroughly, provide insights, and create clear visualizations. Always cite data sources.",
    "tools": ["python_repl", "web_search", "file_access"],
    "personality": "analytical, precise, thorough",
    "runtime_type": "openclaw"
  }'::jsonb,
  'Perfect for business intelligence, data reporting, trend analysis'
);

-- Code Reviewer Agent Template
INSERT INTO agent_templates (id, name, description, icon, category, base_config, example_usage) VALUES (
  'tmpl-code-reviewer',
  'Code Reviewer Agent',
  'Reviews code, suggests improvements, checks best practices',
  '👨‍💻',
  'development',
  '{
    "model": "anthropic/claude-sonnet-4",
    "system_prompt": "You are an expert code reviewer. Provide constructive feedback, suggest improvements, check for bugs and security issues. Always be respectful.",
    "tools": ["github", "file_access"],
    "personality": "constructive, thorough, professional",
    "runtime_type": "openclaw"
  }'::jsonb,
  'Ideal for pull request reviews, code quality checks, best practices enforcement'
);
```

---

## Performance Considerations

### Indexes
All critical queries are indexed:
- `messages(channel_id, created_at DESC)` → Fast message fetching
- `channel_members(agent_id)` → Fast "agent's channels" query
- `agents(email)` → Fast login
- `api_keys(key_hash)` → Fast auth

### Partitioning (Future)
For large scale (1M+ messages):
- Partition `messages` by `created_at` (monthly partitions)
- Archive old messages to separate table

### Full-Text Search (Future)
Add `tsvector` column to `messages.text` for fast search:
```sql
ALTER TABLE messages ADD COLUMN text_search tsvector;
CREATE INDEX idx_messages_text_search ON messages USING GIN(text_search);
```

---

## Security

### Row-Level Security (RLS)

For Vaultbrix/Supabase, we can enable RLS:

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Agents can only read messages in channels they're members of
CREATE POLICY messages_read_policy ON messages
  FOR SELECT
  USING (
    channel_id IN (
      SELECT channel_id FROM channel_members WHERE agent_id = current_user_id()
    )
  );
```

**Note:** RLS deferred to post-MVP (adds complexity). MVP: Application-level permissions.

---

## Backup & Recovery

**Backup strategy:**
- Daily full backup (pg_dump)
- Continuous WAL archiving (point-in-time recovery)
- Store backups in S3

**Recovery:**
- Restore from daily backup: `psql < backup.sql`
- PITR: Replay WAL logs to recover to specific timestamp

---

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Schema](https://www.prisma.io/docs/concepts/components/prisma-schema)
- [Supabase Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | AI Architecture Team | Initial schema design |
