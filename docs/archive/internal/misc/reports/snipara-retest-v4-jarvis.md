# Snipara MCP Retest V4 — Jarvis

**Date:** 2026-02-17 11:18 CET
**Tester:** Jarvis (Coordinator)
**Endpoint:** `https://api.snipara.com/mcp/vutler`
**API Key:** Vutler project key
**Result:** ✅ 7/7 PASS

---

## Test Results

| # | Tool | Status | Fix Verified | Notes |
|---|------|--------|-------------|-------|
| 1 | `rlm_decompose` | ✅ PASS | Returns sub-queries correctly | Decomposes complex queries into prioritized sub-queries with estimated tokens |
| 2 | `rlm_ask` | ✅ PASS | + relevance_score ✅ | Returns sections with relevance scoring |
| 3 | `rlm_search` | ✅ PASS | + file_path ✅ | Each result now includes `file_path` field |
| 4 | `rlm_recall` | ✅ PASS | Improved scoring ✅ | 70/30 blend working, relevance scores visible (0.54+) |
| 5 | `rlm_context_query` | ✅ PASS | + relevance_score + token_count ✅ | Sections include relevance_score and token_count fields |
| 6 | `rlm_remember_bulk` | ✅ PASS | Batch store ✅ | 2/2 memories stored successfully |
| 7 | `rlm_state_get/set` | ✅ PASS | JSON serialization ✅ | Complex JSON objects stored and retrieved correctly |

## Key Finding: Auth Header

**Previous error:** Using `Authorization: Bearer <key>` returned HTTP 204 (empty response).
**Correct format:** `X-API-Key: <key>` with JSON-RPC 2.0 body format.

```bash
# Correct request format:
curl -X POST "https://api.snipara.com/mcp/vutler" \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}'
```

## Issues Encountered During Testing

1. **IP rate limit** (08:50-10:20) — Hit 300 req/min limit during initial testing. Resolved by Alex flushing Redis.
2. **HTTP 204 responses** (10:20-11:15) — Caused by wrong auth header format. Not a server bug.
3. **Server health** — `/health` endpoint confirmed healthy throughout (v2.0.1).

## Comparison with V3 Reviews

- **Jarvis V3 (9/10):** All issues from V3 review now resolved
- **Mike V3 (8.7/10 MCP, 8.5/10 RLM-Runtime):** MCP issues addressed; RLM-Runtime not retested

## Recommendation

Snipara MCP is production-ready for Vutler integration. All dogfooding fixes confirmed working.
Update all agent configs to use `X-API-Key` header format.
