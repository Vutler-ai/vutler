# Sprint 7.3 + 7.5 Implementation — Agent Memory v2 & Agent Tools

**Date:** 2026-02-26
**Engineer:** Mike ⚙️

---

## 7.3 Agent Memory API (v2)

### Files
| File | Description |
|------|-------------|
| `api/routes/memory.js` | Express router — POST/GET/DELETE |
| `migrations/008_agent_memories_v2.sql` | Schema (UUID PK, new types) |
| `api/tests/memory.test.js` | 4 unit tests |

### Schema
```sql
agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255),
  type VARCHAR(50) CHECK (IN: fact|decision|learning|preference|todo),
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ  -- auto-updated via trigger
)
```

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/memory` | Store memory (body: agent_id, type, content, metadata) |
| GET | `/api/memory/:agent_id` | List memories (?type=, ?search=, ?limit=, ?offset=) |
| DELETE | `/api/memory/:id` | Delete by UUID |

### Breaking Changes from v1
- `id` is now UUID (was SERIAL)
- `type` field renamed from `memory_type`, new values: fact|decision|learning|preference|todo (was: fact|preference|context|conversation_summary)
- Removed: embedding_text, expires_at columns
- Migration 008 **drops** old table

---

## 7.5 Agent Tools API

### Files
| File | Description |
|------|-------------|
| `api/routes/tools.js` | Express router — 3 tool endpoints |
| `api/tests/tools.test.js` | 12 unit tests |

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tools/web-search` | Brave Search proxy (needs BRAVE_SEARCH_API_KEY) |
| POST | `/api/tools/file-read` | Sandboxed file read from agent workspace |
| POST | `/api/tools/shell-exec` | Sandboxed shell command execution |

### Security
- **Rate limit:** 10 calls/minute per agent_id (in-memory, resets each minute)
- **Shell whitelist:** `ls, cat, head, tail, grep, wc, echo, date, curl`
- **Dangerous patterns blocked:** `;`, `|`, `&&`, backticks, `sudo`, `rm`, `>>`, `$()`
- **File read sandbox:** resolved path must be under `AGENT_WORKSPACE/{agent_id}/`
- **Shell timeout:** 30 seconds max
- **File size limit:** 1MB max for file-read

### Environment Variables
| Var | Default | Description |
|-----|---------|-------------|
| `BRAVE_SEARCH_API_KEY` | — | Brave Search API key |
| `AGENT_WORKSPACE` | `/home/ubuntu/vutler/agent-workspaces` | Root dir for agent files |

---

## Integration

Add to your Express app (see `api/routes/index.example.js`):
```js
const memoryRoutes = require('./routes/memory');
const toolsRoutes = require('./routes/tools');
app.use('/api/memory', memoryRoutes);
app.use('/api/tools', toolsRoutes);
```

## Testing
```bash
NODE_PATH=app/custom/node_modules node --test api/tests/memory.test.js
NODE_PATH=app/custom/node_modules node --test api/tests/tools.test.js
```

## Deploy
1. Run migration: `psql < migrations/008_agent_memories_v2.sql`
2. Copy `api/routes/memory.js` and `api/routes/tools.js` to server
3. Wire routes in main index.js
4. Set env vars (BRAVE_SEARCH_API_KEY, AGENT_WORKSPACE)
5. Restart app
