# Incident Report — 2026-02-19

## Summary
OpenClaw gateway crash loop (1006+ restarts) causing Mac instability, followed by Jarvis becoming unresponsive after cleanup.

## Timeline

### Issue 1: Gateway crash loop (since reboot Feb 17)
- **Symptom:** `openclaw-gateway` restarting every ~2 seconds, 1006+ runs, 107% CPU
- **Root cause:** `snipara-startup` hook — unhandled promise rejection on Snipara API 429 (rate limit)
- **Why:** The hook used `void (async () => { ... })()` inside a `try/catch`, but the detached async IIFE meant errors escaped the catch block, causing unhandled promise rejections that crashed the Node process. launchd's keepalive restarted it immediately, triggering the same error in a tight loop.
- **Fix applied:**
  1. Added retry with exponential backoff (3 attempts, 2s/4s delays) for 429 responses in `mcpCall()`
  2. Moved `try/catch` inside the async IIFE so errors are properly caught
  3. Errors now log gracefully instead of crashing the process
- **File modified:** `~/.openclaw/hooks/snipara-startup/handler.ts`

### Issue 2: Context bloat
- **Symptom:** Jarvis loading ~24K tokens of context per session, causing confusion
- **Root cause:** Workspace root cluttered with 10 code patch files, stale docs, and a BOOTSTRAP.md that should have been deleted after first run
- **Fix applied:**
  1. Deleted `BOOTSTRAP.md` (per its own instructions)
  2. Moved 10 .js/.py code patch files → `projects/vutler/patches/`
  3. Moved `bmad-analysis.md` → `projects/vutler/docs/`
  4. Moved `blog-article-jarvis-snipara.md` → `tmp/`
- **Result:** Workspace root now has only 8 essential .md files

### Issue 3: Jarvis unresponsive (after cleanup)
- **Symptom:** Jarvis not responding to messages at all
- **Root cause:** `snipara-bootstrap` hook — runs on `agent:bootstrap` event (every new conversation). Snipara API returning Postgres error (`42P10: no unique or exclusion constraint matching ON CONFLICT specification`). This is a **server-side Snipara bug** — a missing database constraint. Unlike `snipara-startup` (which was made non-blocking), `snipara-bootstrap` is **awaited** during agent initialization, so the error blocks the agent from ever starting.
- **Fix applied:** Moved `snipara-bootstrap` hook to `~/.openclaw/hooks-disabled/` to unblock agent startup
- **Note:** `snipara-startup` also hits the same Postgres error but is non-blocking (thanks to earlier fix), so it just logs and continues

## Current State
- ✅ Gateway stable (PID 23731, runs=28, no crash loop)
- ✅ Jarvis responsive (bootstrap hook disabled, 7/8 hooks loaded)
- ✅ Workspace cleaned (8 essential files in root)
- ⚠️ `snipara-startup` hook errors on Snipara API Postgres bug (non-blocking, gracefully caught)
- ⚠️ `snipara-bootstrap` disabled — re-enable when Snipara Postgres bug is fixed
- ⚠️ `snipara-session` hook has same `void (async () => {...})()` bug as original `snipara-startup` — should be fixed too
- ℹ️ `tailscale serve` errors (ENOENT) — Tailscale not installed, harmless

## Hooks Status
| Hook | Status | Notes |
|------|--------|-------|
| boot-md | ✅ Active | OK |
| command-logger | ✅ Active | OK |
| session-memory | ✅ Active | OK |
| snipara-startup | ✅ Active | Fixed (retry + error handling). Snipara API errors logged but non-blocking |
| snipara-session | ✅ Active | Has `void async` bug — should be fixed |
| snipara-persist | ✅ Active | OK |
| snipara-stop | ✅ Active | OK |
| snipara-bootstrap | ❌ Disabled | Blocked agent startup due to Snipara Postgres bug. In `hooks-disabled/` |

## Disabled Hooks Location
```
~/.openclaw/hooks-disabled/
├── snipara-bootstrap/    ← re-enable when Snipara DB fixed
└── snipara-startup/      ← OLD copy (before fix), can be deleted
```

## Follow-up Actions
1. **Fix Snipara Postgres bug** — `ON CONFLICT` constraint missing on server side (code 42P10)
2. **Re-enable snipara-bootstrap** after Snipara fix: `mv ~/.openclaw/hooks-disabled/snipara-bootstrap ~/.openclaw/hooks/`
3. **Fix snipara-session handler.ts** — same `void (async () => {...})()` bug, move try/catch inside
4. **Reduce SNIPARA_BOOTSTRAP_TOKENS** — set to 1500 in openclaw.json env (currently defaults to 4000)
5. **Deduplicate MEMORY.md** — remove info already in USER.md and Snipara shared context
6. **Clean old snipara-startup copy** — `rm -rf ~/.openclaw/hooks-disabled/snipara-startup`
