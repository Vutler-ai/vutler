# Jarvis Context Audit — 2026-02-19

## Problem
Jarvis loads too much context on every session, leading to confusion, slow responses, and token waste.

## What Gets Loaded Per Session

### 1. Workspace Files (AGENTS.md instructs to read on every session)
| File | Lines | Tokens (est.) | Load Trigger |
|------|-------|---------------|--------------|
| SOUL.md | 48 | ~600 | Every session |
| USER.md | 23 | ~300 | Every session |
| AGENTS.md | 212 | ~2,800 | Every session (it IS the instruction file) |
| MEMORY.md | 177 | ~2,500 | Every main session |
| HEARTBEAT.md | 52 | ~800 | Every heartbeat (~30s!) |
| TOOLS.md | 62 | ~900 | On demand |
| SECURITY.md | 50 | ~700 | On demand |
| BOOTSTRAP.md | 55 | ~500 | Every session (should have been deleted!) |
| memory/2026-02-17.md | 202 | ~2,700 | Every session (today) |
| memory/2026-02-18.md | 15 | ~200 | Every session (yesterday) |
| **Subtotal workspace** | **~896** | **~12,000** | |

### 2. Snipara Hooks (inject ADDITIONAL context)
| Hook | Trigger | What it loads | Tokens (est.) |
|------|---------|---------------|---------------|
| snipara-startup | Gateway start | 3 memories + shared context + 2 decisions | ~2,000 |
| snipara-bootstrap | Every agent session | 4,000 token project docs + shared context + 3 facts + reminder | ~5,000 |
| snipara-session | Every new command | Session context recall | ~1,000 |
| **Subtotal hooks** | | | **~8,000** |

### 3. Stale / Redundant Files in Workspace
| File | Lines | Issue |
|------|-------|-------|
| BOOTSTRAP.md | 55 | Should have been deleted after first run (per AGENTS.md instructions) |
| bmad-analysis.md | 775 | 31KB analysis doc sitting in workspace root — not referenced |
| blog-article-jarvis-snipara.md | 131 | Blog draft, doesn't need to be in workspace root |
| channel_routes.js | 139 | Code patch file, not context |
| loginAgentRC_method.js | 42 | Code patch file |
| new_loadAssignments.js | 36 | Code patch file |
| new_postToRC.js | 21 | Code patch file |
| onboarding.js | 215 | Code patch file |
| replace_method.py | 28 | Code patch file |
| s92-patch.js | 122 | Code patch file |
| update_provision_project.js | 86 | Code patch file |
| update_s92.py | 161 | Code patch file |
| update_snipara.py | 21 | Code patch file |

These .js/.py files are leftover code patches from Vutler sprints. They shouldn't be in the workspace root.

### 4. Overlap / Duplication
| Content | Found in |
|---------|----------|
| Company info (Starbox, products) | MEMORY.md + USER.md + snipara shared context |
| Team roster | MEMORY.md + AGENTS.md (partially) |
| Snipara tools reference | TOOLS.md + snipara-bootstrap inject |
| Channel routing | HEARTBEAT.md + MEMORY.md |
| kChat credentials | HEARTBEAT.md (inline curl!) |

## Total Context Per Session (Estimated)
| Source | Tokens |
|--------|--------|
| Workspace files | ~12,000 |
| Snipara hooks | ~8,000 |
| System prompt + tools | ~4,000 |
| **TOTAL** | **~24,000** |

That's ~24K tokens burned before Jarvis even reads the user's message. On Opus 4, that's significant cost and context pollution.

## Recommendations

### Quick Wins (Do Now)
1. **Delete BOOTSTRAP.md** — it says to delete itself after first run, it's been 6 days
2. **Move code patch files to `tmp/` or `projects/vutler/`** — they're not context, they're artifacts
3. **Move bmad-analysis.md to `projects/`** — 775 lines of one-time analysis
4. **Move blog-article to `tmp/`** — not operational context
5. **Remove inline credentials from HEARTBEAT.md** — move curl template to a script

### Medium Effort (Reduce Duplication)
6. **Deduplicate USER.md ↔ MEMORY.md** — USER.md should be the single source for "who Alex is", MEMORY.md should only have operational memories
7. **Trim MEMORY.md** — remove pricing tables, detailed Vutler sprint status, and other info that belongs in Snipara docs, not in-context memory
8. **Reduce AGENTS.md** — it's 212 lines. The heartbeat section alone is 80 lines of rules. Split into AGENTS.md (core rules, ~80 lines) and a separate HEARTBEAT-GUIDE.md that's only loaded during heartbeats

### Structural (Reduce Hook Bloat)
9. **snipara-bootstrap: reduce token budget** — currently 4,000 tokens of "project overview" injected on every session. Reduce to 1,500 or make it conditional (only inject if session is about code/projects)
10. **snipara-startup + snipara-bootstrap overlap** — both load shared context and memories. Deduplicate: startup loads memories, bootstrap loads docs (not both)
11. **Set `SNIPARA_BOOTSTRAP_TOKENS=1500`** in openclaw.json env

### Target State
| Source | Current | Target |
|--------|---------|--------|
| Workspace files | ~12,000 | ~5,000 |
| Snipara hooks | ~8,000 | ~3,000 |
| System + tools | ~4,000 | ~4,000 |
| **TOTAL** | **~24,000** | **~12,000** |

50% reduction in startup context = faster responses, less confusion, lower cost.
