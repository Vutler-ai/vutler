# Frontend Wiring Audit & Fixes — 2026-02-26

**Auditor:** Mike ⚙️ (Lead Engineer)

---

## Mission 1: Frontend API Wiring Audit

### Files Audited
All 11 HTML files in `app/custom/admin/`:

| File | API Calls | Status |
|------|-----------|--------|
| index.html | Uses `API.getAgents()` + `API.getUsage()` from admin.js | **Fixed via admin.js** |
| agents.html | No API calls (static HTML) | ✅ OK |
| agent-builder.html | No API calls (static HTML) | ✅ OK |
| agent-detail.html | No API calls (static HTML) | ✅ OK |
| providers.html | No API calls (static HTML) | ✅ OK |
| llm-settings.html | No API calls (static HTML) | ✅ OK |
| usage.html | No API calls (static HTML) | ✅ OK |
| templates.html | No API calls (static HTML) | ✅ OK |
| marketplace.html | No API calls (static HTML) | ✅ OK |
| activity.html | No API calls (static HTML) | ✅ OK |
| onboarding.html | No API calls (wizard with local JS only) | ✅ OK |

### Fixes in `admin.js` (6 route corrections)

| # | Function | Before (wrong) | After (correct) | Notes |
|---|----------|----------------|------------------|-------|
| 1 | `getAgents()` | `/api/agents` | `/api/v1/agents` | Missing `/v1/` prefix |
| 2 | `getAgent(id)` | `/api/agents/${id}` | `/api/v1/agents/${id}` | Missing `/v1/` prefix |
| 3 | `getAgentStatus(id)` | `/api/agents/${id}/status` | `/api/v1/agents/${id}` | No `/status` route exists |
| 4 | `deleteAgent(id)` | `/api/agents/${id}` DELETE | `/api/v1/agents/${id}` DELETE | Missing `/v1/` prefix |
| 5 | `getProviders()` | `/api/llm/providers` | `/api/v1/providers` | Wrong path entirely |
| 6 | `getUsage()` | `/api/llm/usage` | `/api/v1/dashboard` | No `/llm/usage` route; dashboard has stats |

---

## Mission 2: token_usage Column Fix

### Problem
`api/dashboard.js` line 131 queried `SUM(tokens)` but the `token_usage` table has no `tokens` column.

### Actual table schema (PostgreSQL)
| Column | Type |
|--------|------|
| id | uuid |
| agent_id | text |
| provider | text |
| model | text |
| **input_tokens** | integer |
| **output_tokens** | integer |
| cost_usd | numeric |
| created_at | timestamptz |

### Fix Applied
```sql
-- Before (broken):
SELECT COALESCE(SUM(tokens), 0)::bigint as total FROM token_usage

-- After (fixed):
SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint as total FROM token_usage
```

Fixed in:
- **VPS**: `/app/api/dashboard.js` (via `docker exec sed`) + `docker restart vutler-api`
- **Local**: `api/routes/dashboard.js`
