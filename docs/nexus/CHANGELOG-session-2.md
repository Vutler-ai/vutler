# Nexus Frontend & Agent Bridge — Session 2 Changelog

## Date: 2026-03-30

## Summary

This session focused on building the **agent↔nexus bridge**, enabling agents to use local capabilities (file search, document reading, mail, calendar, contacts, clipboard) through LLM function calling. The bridge connects TaskExecutor → llmRouter → WebSocket dispatch to the local Nexus node, with execution results fed back to the LLM. Concurrently, the frontend deploy modal was simplified to clarify that Nexus is a capability worker (not an agent clone), with permission toggles and macOS/Windows installer downloads. Infrastructure improvements included aligning Docker port configuration and fixing WebSocket initialization order.

---

## Bug Fixes

### 1. Dockerfile PORT and HEALTHCHECK Mismatch (c299267)
**Problem:** Frontend Dockerfile exposed port 3000 but API server runs on 3002, causing container health checks to fail.

**Root Cause:** Port hardcoded to 3000 in HEALTHCHECK; API changed to 3002 months ago but Dockerfile was never updated.

**Fix:**
- Changed `EXPOSE 3000` to `EXPOSE 3002`
- Updated `HEALTHCHECK --interval=10s CMD curl -f http://localhost:3000 ...` to use `localhost:3002`
- Port now dynamically read from env var in startup script

**Files:** `frontend/Dockerfile`

---

### 2. Deploy Modal Token Overflow (e446d3f)
**Problem:** Long authentication tokens displayed in modal would overflow or truncate, breaking the copy-paste experience.

**Root Cause:** No CSS constraints on token display (width, overflow, scroll).

**Fix:**
- Added `break-all` to allow tokens to wrap
- Added `max-h-20` (5rem) to bound height
- Added `overflow-y-auto` to enable scrolling for very long tokens
- Tokens now display in a responsive scrollable container

**Files:** `frontend/src/app/(app)/nexus/page.tsx`

---

### 3. WebSocket Connection Null Reference (0d2de2f)
**Problem:** TaskExecutor tried to access `wsConnections` but it was null because it was assigned before the WebSocket server initialized.

**Root Cause:** Initialization order: `taskExecutor.wsConnections = ...` happened before `wsConnections = wss.clients` was set (which only happens on server init).

**Fix:**
- Moved `taskExecutor.wsConnections = wsConnections` to **after** WebSocket server initialization
- Ensured `wsConnections` reference exists before TaskExecutor tries to use it for dispatching tool calls

**Files:** `index.js`

---

### 4. Duplicate path Require (18e3c3d)
**Problem:** `const path = require('path')` declared twice in index.js.

**Root Cause:** Refactoring artifact during feature development.

**Fix:** Removed duplicate declaration.

**Files:** `index.js`

---

### 5. Missing /downloads Public Path (34fd749)
**Problem:** Nexus installer downloads (macOS .dmg, Windows .exe) blocked by authentication middleware.

**Root Cause:** `/downloads/*` not added to public paths whitelist in auth middleware.

**Fix:** Added `/downloads` to `publicPaths` array in auth middleware, allowing unauthenticated installer access.

**Files:** `api/middleware/auth.js`

---

### 6. 400 Error on POST /nexus/tokens/local (6940af3)
**Problem:** Deploy flow failed with 400 when creating local node tokens.

**Root Cause:** Backend endpoint expected `agentIds` as a single ID string; frontend sent an array `[]`.

**Fix:** Updated backend POST handler to accept `agentIds` as an array, matching frontend expectations.

**Files:** `index.js` (backend route handler)

---

## New Features

### Feature 1: Agent↔Nexus Bridge — LLM Tool Use Integration (38193e4)

**What it does:**
When a Nexus local node comes online, agents can now automatically use its local capabilities. The LLM can call 7 tools (search_files, read_document, list_directory, read_emails, read_calendar, read_contacts, read_clipboard), which are dispatched via WebSocket to the local node, executed by the Nexus orchestrator, and results fed back to the LLM for final response generation.

**Architecture Flow:**
```
TaskExecutor.executeTask()
  ↓
llmRouter.chat({ workspaceId, taskId, ... })
  ↓
[Query DB] Is an online Nexus node registered for this workspace?
  ├─ NO: Standard LLM chat (text-only, no local tools)
  └─ YES: Inject 7 Nexus tool definitions into system prompt
  ↓
LLM generates response (may include tool calls)
  ↓
[Loop] While tool calls pending:
  ├─ Identify tool (search_files, read_document, etc.)
  ├─ Map LLM tool name → Nexus action (search_files → search, read_document → read_document, etc.)
  ├─ executeNexusTool(nodeId, toolName, args, wsConnections)
  │   ├─ Generate requestId UUID
  │   ├─ Set 30s timeout timer
  │   ├─ Send { type: 'tool.call', payload: { request_id, tool_name, args } } via WebSocket
  │   └─ Wait for tool.result message (async/await with Promise)
  ├─ [Nexus node receives tool.call]
  │   ├─ Route to task-orchestrator
  │   ├─ Execute locally (file search, read email, etc.)
  │   └─ Send back { type: 'tool.result', request_id, success, data }
  ├─ llmRouter resolves pending promise with result
  └─ Pass result to LLM for next iteration
  ↓
LLM returns final response (with insights from local data)
  ↓
Store execution in DB with metadata.execution_mode = 'llm_with_nexus'
```

**Key Characteristics:**
- **7 Tools Available:** search_files, read_document, list_directory, read_emails, read_calendar, read_contacts, read_clipboard
- **Smart Tool Mapping:** read_emails with query → search_emails; read_contacts with query → search_contacts
- **30s Timeout:** Tool calls automatically fail if Nexus node doesn't respond in time
- **Graceful Fallback:** If no Nexus node online, agents get empty tool list and respond with text only
- **Database Lookup:** Checks `nexus_nodes` table for online status per workspace
- **WebSocket-Based:** Real-time dispatch with Promise-based async/await for clean integration

**Implementation:**

**New file: `services/nexusTools.js` (203 lines)**
- `NEXUS_TOOLS`: Tool definitions with JSON schemas
- `getNexusToolsForWorkspace(workspaceId, pool)`: Checks if online node exists; returns tools if yes, empty array if no
- `mapToolToNexus(toolName, args)`: Maps LLM tool names to Nexus actions (handles search/query variants)
- `executeNexusTool(nodeId, toolName, args, wsConnections)`: Core dispatch logic
  - Generates requestId UUID
  - Sends tool.call via WebSocket with 30s timeout
  - Returns Promise that resolves when tool.result arrives
- `handleToolResult(requestId, success, data, error)`: Called by websocket.js to resolve pending promises

**Modified: `services/llmRouter.js`**
- Import `{ getNexusToolsForWorkspace, executeNexusTool }` from nexusTools
- In `chat()` function:
  - Query DB for online Nexus node
  - If online: call `getNexusToolsForWorkspace()` and inject tools into messages
  - In tool-call handling loop: detect Nexus tool names and call `executeNexusTool()`
  - Parse tool results and feed back to LLM
- Receives `wsConnections` parameter from taskExecutor for WebSocket dispatch

**Modified: `api/websocket.js`**
- Handle inbound `'tool.result'` messages from Nexus nodes
- Extract `request_id`, `success`, `data`, `error`
- Call `nexusTools.handleToolResult()` to resolve pending promise

**Modified: `packages/nexus/index.js`**
- Handle inbound `'tool.call'` messages from llmRouter
- Extract tool_name, args, request_id
- Route to task-orchestrator for execution (e.g., 'search' → file search provider)
- Send back `{ type: 'tool.result', request_id, success, data/error }`

**Modified: `app/custom/services/taskExecutor.js`**
- Accept `wsConnections` parameter in `executeTask()`
- Pass `wsConnections` to `llmRouter.chat()` for tool dispatch

**Modified: `index.js` (startup)**
- After WebSocket server initialization: `taskExecutor.wsConnections = wsConnections`
- Ensures TaskExecutor can access WebSocket connections for bridge dispatch

**Files Changed:**
- `services/nexusTools.js` — **Created** (203 lines)
- `services/llmRouter.js` — **Modified** (+43 lines)
- `api/websocket.js` — **Modified** (+8 lines)
- `packages/nexus/index.js` — **Modified** (+28 lines)
- `app/custom/services/taskExecutor.js` — **Modified** (+13 lines)
- `index.js` — **Modified** (+3 lines, for wsConnections link)

---

### Feature 2: Enhanced Frontend Dispatch Panel (6940af3)

**What it does:**
Replaces simple text input in the Nexus node control panel with a structured dispatch interface. Users can select from 9 action types (search, read, list, open, write, shell, clipboard, email, calendar), fill type-specific forms, and view results in formatted tables, cards, or code blocks.

**UI Components:**
1. **ActionDispatchPanel** — 9 pill-button tabs, each with dynamic form fields
   - `search`: query, scope (folder path)
   - `read_document`: path
   - `list_dir`: path, recursive checkbox, pattern (glob)
   - `open_file`: path
   - `write_file`: path, content
   - `shell_exec`: command
   - `read_clipboard`: no fields
   - `list_emails`: limit number
   - `read_calendar`: days ahead
2. **ResultViewer** — Renders results based on action type
   - Tables for file search results (columns: name, path, size, modified)
   - Cards for emails (sender, subject, date preview)
   - Calendar grid for events
   - Contact list with name, email, phone, company
   - Formatted JSON for clipboard
   - Code blocks for shell output
   - Scrollable containers for large datasets
3. **CapabilitiesCard** — Shows node metadata
   - Platform (darwin, linux, win32)
   - Installed providers (Spotlight, Mail, Outlook, Calendar, Contacts, Shell)
   - Folder permissions if configured

**Typed Helpers in `lib/api/endpoints/nexus.ts`:**
- `dispatchSearch(nodeId, query, scope?)`
- `dispatchReadDocument(nodeId, path)`
- `dispatchListDir(nodeId, path, recursive?, pattern?)`
- `dispatchOpenFile(nodeId, path)`
- `dispatchWriteFile(nodeId, path, content)`
- `dispatchShellExec(nodeId, command)`
- `dispatchClipboard(nodeId)`
- `dispatchListEmails(nodeId, limit?)`
- `dispatchReadCalendar(nodeId, days?)`

**Result Types in `lib/api/types.ts`:**
```typescript
export type NexusAction = 'search' | 'read_document' | 'list_dir' | ... (9 total)
export interface NexusDispatchResult<T = unknown> {
  taskId: string;
  status: 'completed' | 'error';
  data?: T;
  error?: string;
  metadata?: { durationMs: number; action: string; truncated?: boolean };
}
export interface NexusSearchResult { path, name, size?, modified? }
export interface NexusDocumentResult { content, format, metadata? }
export interface NexusEmailResult { sender, subject, date, preview }
export interface NexusCalendarEvent { title, start, end, location? }
export interface NexusContact { name, email?, phone?, company? }
export interface NexusShellResult { output, exitCode? }
export interface NexusCapabilities { platform, providers[], permissions? }
```

**Files Changed:**
- `frontend/src/app/(app)/nexus/[id]/page.tsx` — **Modified** (+729 lines)
- `frontend/src/lib/api/endpoints/nexus.ts` — **Created** (96 lines, 11 dispatch helpers)
- `frontend/src/lib/api/types.ts` — **Modified** (+60 lines, 9 result + capability types)
- `index.js` — **Modified** (backend POST handler fix for agentIds array)

---

### Feature 3: Simplified Local Deploy Modal (846d889)

**What it does:**
Reframes the deploy flow to clarify that Nexus is a **capability worker**, not an agent clone. Removes misleading 3-step flow (agents → routing → token) and replaces with 2-step: **Configure Node** (name + 6 permission toggles) → **Install & Connect** (with download links and QR setup).

**Key Changes:**

**1. Removed Agent Selection**
- Old: Users saw a list of agents to "clone" to the node
- New: Single "Personal Node" with clear description: "A capability worker that provides local file, email, calendar, and contact access to your agents in the cloud"
- Rationale: Nexus is a single shared node per workspace; agents query it as a service, not clone to it

**2. Permission Toggles (6 permissions)**
Each node can restrict access to:
- `fs_enabled` — File system access (Spotlight search, file read/write)
- `mail_enabled` — Email access (Mail.app, Outlook)
- `calendar_enabled` — Calendar access (Calendar.app)
- `contacts_enabled` — Contacts access (Contacts.app)
- `clipboard_enabled` — Clipboard read access
- `shell_enabled` — Shell command execution (optional, off by default)

**3. 2-Step Flow**
```
Step 1: Configure Node
├─ Node name (e.g., "My Mac")
└─ Permission toggles (all on by default except shell)

Step 2: Install & Connect
├─ Download macOS .dmg or Windows .exe
├─ Run installer (auto-configures API URL + token)
├─ QR code for quick onboarding (recommended)
└─ CLI fallback: ./nexus-cli --token=XXX --api=https://app.vutler.ai
```

**4. OS Auto-Detection**
- Download buttons show "Download macOS (Recommended)" on Mac
- Show "Download Windows (Recommended)" on Windows
- Other platforms show both options equally

**Files Changed:**
- `frontend/src/app/(app)/nexus/page.tsx` — **Refactored** (-114, +64 lines)

---

### Feature 4: Installer Download Endpoints (5711395)

**What it does:**
Serves Nexus installer binaries (macOS .dmg, Windows .exe) directly from the API server instead of redirecting to GitHub releases (repo is private).

**Endpoints:**
- `GET /downloads/nexus-macos.dmg` — Returns macOS installer (no auth required)
- `GET /downloads/nexus-windows.exe` — Returns Windows installer (no auth required)

**Behavior:**
- Returns file with `Content-Disposition: attachment; filename=...` for download
- If binary not found: returns 404 with message "Installer coming soon, contact support"
- Public paths (no JWT/auth required)
- Frontend URL updated from GitHub release URL to `https://app.vutler.ai/downloads/nexus-macos.dmg`

**Rationale:**
- GitHub private repo releases require auth; API server can serve without exposing credentials
- Single source of truth for installer versions
- Can version control without publishing to GitHub Releases

**Files Changed:**
- `index.js` — **Modified** (+16 lines, new download route handlers)
- `frontend/src/app/(app)/nexus/page.tsx` — **Modified** (download URL updated)

---

### Feature 5: Enhanced Deploy Modal UX (e446d3f)

**What it does:**
Improves the installer/onboarding experience with better visual guidance and QR code option.

**Changes:**

**1. 3-Step Setup Guide**
```
Step 1: Download Installer
├─ macOS .dmg (with OS auto-detect highlight)
└─ Windows .exe

Step 2: Get Authentication Token
├─ Your token is: [scrollable token container]
├─ Auto-generated for security
└─ Copy to clipboard button

Step 3: Start Setup
├─ Option A (Recommended): QR Code
│   └─ Open Nexus installer, scan QR with phone to auto-configure
└─ Option B (CLI): Manual
    └─ ./nexus-installer --token=XXX --api=https://app.vutler.ai
```

**2. Token Display Fix**
- `word-break: break-all` — Allows long tokens to wrap
- `max-h-20` — Limits height to 5rem
- `overflow-y-auto` — Scrollable for very long tokens
- Fixes token truncation and display issues

**3. QR Onboarding Recommended Path**
- QR code generated from token + API URL
- Nexus installer scans QR → auto-populates token and API
- Falls back to CLI copy-paste for manual setup
- Reduces setup errors from typos

**4. Visual Hierarchy**
- Download buttons prominent and OS-aware
- Token section with clear copy affordance
- QR code centered for mobile scanning
- CLI instructions as secondary path

**Files Changed:**
- `frontend/src/app/(app)/nexus/page.tsx` — **Modified** (+62, -13 lines)

---

## Infrastructure Improvements

### Docker Configuration Alignment
- **What:** Dockerfile PORT and HEALTHCHECK now match 3002 (API server port)
- **Impact:** Container health checks pass consistently; no more "unhealthy" status
- **Files:** `frontend/Dockerfile`

### WebSocket Initialization Order Fix
- **What:** `wsConnections` reference now available to TaskExecutor before it needs it
- **Impact:** Tool dispatch via WebSocket works reliably; no null reference errors
- **Files:** `index.js`

### Installer Distribution
- **What:** Nexus binaries served from API instead of GitHub
- **Impact:** Works with private repos; version control inside main codebase; single distribution source
- **Files:** `index.js`, `api/middleware/auth.js`

---

## Architecture Diagram: Complete Agent↔Nexus Bridge

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENT TASK EXECUTION                            │
│                         (TaskExecutor loop)                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ executeTask(taskId)
                               ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                        LLM ROUTER (llmRouter.js)                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. Query: Is online Nexus node registered for workspace?        │   │
│  │    → SELECT FROM nexus_nodes WHERE status='online'              │   │
│  └──────────────────┬─────────────────────────────────────────────┘   │
│                     │                                                   │
│         ┌───────────┴───────────┐                                      │
│         │                       │                                      │
│    NO NODE             YES NODE ONLINE                                │
│         │                       │                                      │
│         ▼                       ▼                                      │
│   [Text-only LLM]    [Inject 7 Nexus tools]                          │
│                      search_files, read_document,                    │
│                      list_directory, read_emails,                    │
│                      read_calendar, read_contacts,                   │
│                      read_clipboard                                  │
│         │                       │                                      │
│         └───────────┬───────────┘                                      │
│                     │                                                   │
│  2. LLM generates response (may call tools)                           │
│  3. Loop while tool calls pending:                                   │
│     ├─ Detect tool (Nexus tool name)                                 │
│     ├─ Map to action (search_files → 'search')                       │
│     ├─ Call executeNexusTool(nodeId, toolName, args, wsConnections) │
│     │                                                                  │
│     └──► DISPATCH VIA WEBSOCKET ────────────────────────────┐        │
│                                                              │         │
└──────────────────────────────────────────────────────────────┼────────┘
                                                               │
                   ┌───────────────────────────────────────────┤
                   │                                           │
                   ▼                                           │
    ┌──────────────────────────────────┐                      │
    │  Nexus Local Node (WebSocket)    │                      │
    │  ┌────────────────────────────┐  │                      │
    │  │ Receive tool.call message  │◄─┘                      │
    │  │ ┌──────────────────────┐   │                         │
    │  │ │ request_id           │   │                         │
    │  │ │ tool_name (action)   │   │                         │
    │  │ │ args                 │   │                         │
    │  │ └──────────────────────┘   │                         │
    │  └────────────┬────────────────┘                         │
    │               │                                          │
    │  Route to Task Orchestrator:                           │
    │  ├─ 'search' → Spotlight provider (file search)        │
    │  ├─ 'read_document' → File reader (PDF, DOCX, etc.)    │
    │  ├─ 'list_dir' → Directory lister                      │
    │  ├─ 'list_emails' / 'search_emails' → Mail provider    │
    │  ├─ 'read_calendar' → Calendar provider                │
    │  ├─ 'read_contacts' / 'search_contacts' → Contacts     │
    │  ├─ 'read_clipboard' → Clipboard reader                │
    │  └─ 'shell_exec' → Shell command executor              │
    │               │                                          │
    │               ▼                                          │
    │  Execute locally, collect results                      │
    │               │                                          │
    │  Send back: {                                           │
    │    type: 'tool.result'                                  │
    │    request_id,                                          │
    │    success: true/false,                                 │
    │    data: { ... },                                       │
    │    error: "..." (if failed)                             │
    │  }                                                       │
    └────────────┬──────────────────────────────────────────┘
                 │ VIA WEBSOCKET
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │  api/websocket.js (inbound handler)                   │
    │  ├─ Receive tool.result message                       │
    │  └─ Call nexusTools.handleToolResult(...)             │
    │     └─ Resolve pending Promise                        │
    └────────────┬──────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │  services/nexusTools.js                               │
    │  handleToolResult() resolves: { success, data/error }  │
    └────────────┬──────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │  services/llmRouter.js (continues)                    │
    │  ├─ Receive tool result from Promise                  │
    │  ├─ Parse result (success, data)                      │
    │  ├─ Add to conversation for next LLM turn             │
    │  └─ LLM generates final response with insights        │
    └────────────┬──────────────────────────────────────────┘
                 │
    ┌────────────▼──────────────────────────────────────────┐
    │  taskExecutor.js (store result)                       │
    │  ├─ Save response to DB                               │
    │  ├─ metadata.execution_mode = 'llm_with_nexus'        │
    │  └─ Include tool execution trace                      │
    └────────────────────────────────────────────────────────┘
```

---

## Files Changed: Complete Summary

| File Path | Type | Changes | Lines |
|-----------|------|---------|-------|
| `frontend/Dockerfile` | Modified | PORT 3000→3002, HEALTHCHECK port fix | +4/-4 |
| `frontend/src/app/(app)/nexus/page.tsx` | Modified | Deploy modal simplification + download UI + QR setup | +62/-13, then +178/-114 |
| `frontend/src/app/(app)/nexus/[id]/page.tsx` | Modified | Dispatch panel, result viewer, capabilities card | +729/-59 |
| `frontend/src/lib/api/endpoints/nexus.ts` | Created | 11 dispatch helper functions | +96 |
| `frontend/src/lib/api/types.ts` | Modified | 9 Nexus result types, NexusAction, NexusCapabilities | +60 |
| `services/nexusTools.js` | Created | Tool definitions, WS dispatch, bridge handlers | +203 |
| `services/llmRouter.js` | Modified | Inject tools, dispatch execution, handle results | +43 |
| `api/websocket.js` | Modified | Handle tool.result inbound messages | +8 |
| `api/middleware/auth.js` | Modified | Add /downloads to public paths | +1 |
| `packages/nexus/index.js` | Modified | Handle tool.call, execute task-orchestrator | +28 |
| `app/custom/services/taskExecutor.js` | Modified | Accept wsConnections param, pass to llmRouter | +13 |
| `index.js` | Modified | Download endpoints, wsConnections link, fix require | +25-16 (net) |

**Total: 12 files changed, ~1100 lines added/modified**

---

## Testing Recommendations

1. **Bridge End-to-End:**
   - Create task with Nexus node online
   - Agent should call tool (search_files, read_emails, etc.)
   - Verify tool.call reaches Nexus node
   - Verify tool.result returns to llmRouter
   - Verify LLM uses result in final answer

2. **Fallback (No Nexus):**
   - Offline Nexus node or no node registered
   - Agent tasks should complete without tools
   - LLM should respond with text only, no errors

3. **Timeout Handling:**
   - Simulate slow Nexus response (>30s)
   - Tool should timeout gracefully
   - LLM should handle tool error and respond

4. **Frontend Dispatch Panel:**
   - Test all 9 action types (search, read_document, list_dir, etc.)
   - Verify result formatting (tables, cards, code blocks)
   - Test CapabilitiesCard platform detection
   - Test OS auto-detection for download buttons

5. **Deploy Modal:**
   - Verify QR code generation and scannability
   - Test token display (long tokens scroll, don't overflow)
   - Test permission toggles (persist to DB)
   - Test installer downloads (macOS .dmg, Windows .exe)

---

## Deployment Notes

1. **Database Migration:** No schema changes required (nexus_nodes table already exists)
2. **Environment Variables:** Ensure `/downloads` path writable for installer binaries
3. **WebSocket Configuration:** No changes to existing WS init; just ensure `wsConnections` assigned after server start
4. **Nginx/Caddy:** If using reverse proxy, ensure `/downloads` endpoints exposed and `/api/websocket` proxied correctly
5. **Docker:** Update frontend Docker to use 3002 (or set via env var at runtime)

---

## Key Insights

1. **Nexus is a Capability Service, Not an Agent Clone:** The deploy modal reframing makes this clear—agents query it for local data, not run on it.

2. **Promise-Based Dispatch:** Using UUID + Map + setTimeout for tool call tracking is cleaner than callback hell and integrates well with async/await in llmRouter.

3. **Graceful Degradation:** If no Nexus node online, agents don't break—they just don't see tools. LLM automatically adapts.

4. **WebSocket Real-Time Integration:** Bidirectional dispatch (tool.call → tool.result) keeps LLM loop tight without polling.

5. **Permission Model:** 6 toggles per node (fs, mail, calendar, contacts, clipboard, shell) let users control scope—prevents over-privilege by default.

---

## Commits Summary (Chronological)

| Commit | Message | Impact |
|--------|---------|--------|
| c299267 | fix: align Dockerfile PORT and HEALTHCHECK to 3002 | Infrastructure |
| e446d3f | fix(nexus): deploy modal — installer download buttons, token overflow fix, QR onboarding link | Frontend UX |
| 846d889 | refactor(nexus): simplify local deploy modal — remove agent selection, add permission toggles | Frontend Architecture |
| 6940af3 | feat(nexus): enhanced frontend — dispatch panel, result viewer, capabilities + fix 400 deploy error | Frontend Features |
| 38193e4 | feat(nexus): agent↔nexus bridge — LLM tool use integration for local capabilities | Backend Bridge |
| 0d2de2f | fix: link wsConnections to taskExecutor after WebSocket init (was before, so null) | Bug Fix |
| 5711395 | feat(nexus): add /downloads/nexus-macos.dmg and /downloads/nexus-windows.exe endpoints | Backend Features |
| 18e3c3d | fix: remove duplicate path require (already declared higher up) | Code Quality |
| 34fd749 | fix: add /downloads to public paths (nexus installer download requires no auth) | Bug Fix |

