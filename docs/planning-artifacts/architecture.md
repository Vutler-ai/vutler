---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - docs/planning-artifacts/prd.md
  - docs/product-briefs/nexus-local-integrations.md
  - docs/specs/mobile-dispatch-architecture.md
workflowType: 'architecture'
project_name: 'Nexus Local Integrations'
user_name: 'Alex'
date: '2026-03-29'
status: 'complete'
completedAt: '2026-03-29'
---

# Architecture Decision Document — Nexus Local Integrations

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 37 FRs across 8 capability areas. Core challenge: each provider must work identically on macOS and Windows via a common interface. Nexus orchestrates task dispatch from cloud, permission validation, and result streaming. Agents (cloud) formulate tasks; Nexus (local) executes and returns extracted data — never raw files.

**Non-Functional Requirements:** 20 NFRs driving architecture:
- Performance: < 5s e2e search, < 500ms WebSocket latency, < 50MB idle RAM
- Security: WSS/TLS, whitelisted actions only, no raw files to cloud, audit logging
- Reliability: auto-reconnect, offline queue, graceful errors, auto-restart via OS
- Compatibility: macOS 12-15, Windows 10-11, UTF-8/Latin-1/unicode paths

**Scale & Complexity:** Medium-high. ~15 components (13 providers + task orchestrator + permission engine). Cross-platform with fundamentally different OS APIs.

### Technical Constraints & Dependencies

- Existing Nexus runtime with 6 providers — must not regress
- HTTP polling (10s) replaced by WebSocket for real-time tasks
- Local-daemon already implements WebSocket to `wss://api.vutler.com/ws/chat` — reusable pattern
- ShellProvider uses naive `execSync` argument parsing — security hardening needed
- AgentWorker bug: calls `.read()` instead of `.readFile()` on FilesystemProvider
- macOS requires AppleScript for Mail/Calendar/Contacts; Windows requires COM/PowerShell

### Cross-Cutting Concerns

| Concern | Scope |
|---------|-------|
| Cross-platform abstraction | All providers — common interface, OS-specific impl |
| Permission enforcement | All file-accessing providers — validate before execute |
| Error handling | All components — structured errors, never crash |
| Structured logging | All providers — timestamp, path, action, agent ID |
| Offline resilience | Communication layer — queue, reconnect, degraded mode |
| Security boundary | Task orchestrator — whitelisted actions only |

## Technology Stack

### Existing (Brownfield)

- **Runtime:** Node.js 20 LTS
- **Language:** JavaScript (existing codebase, no TS migration)
- **Cloud Frontend:** Next.js 14 + Tailwind + shadcn/ui
- **Cloud Database:** Supabase PostgreSQL (schema `tenant_vutler`)
- **Cloud API:** Express.js

### Packaging: pkg + lightweight tray

**Decision:** `pkg` for native binary + web UI on localhost:3100 + `node-systray` for tray.

**Rationale:** Electron rejected (~100MB RAM, overkill for headless). pkg binary ~30MB, idle ~40MB — meets NFR4 (< 50MB). Settings UI served via existing Express dashboard. Auto-update via HTTP version check. Installer: `create-dmg` (macOS) + Inno Setup (Windows).

### New Dependencies

| Dependency | Purpose | Cross-platform |
|------------|---------|----------------|
| ws | WebSocket client | Yes |
| chokidar | File watching | Yes |
| pdf-parse | PDF text extraction | Yes |
| xlsx (SheetJS) | Excel/CSV parsing | Yes |
| mammoth | Word (.docx) extraction | Yes |
| fast-glob | Recursive file search | Yes |
| node-systray | System tray icon | Yes |

## Core Architectural Decisions

### ADR-1: Communication — WebSocket replacing HTTP Polling

**Decision:** Replace HTTP polling (10s interval) with persistent WebSocket connection to Vutler Cloud.

**Rationale:** NFR1 requires < 5s e2e latency. Polling adds 0-10s random delay. FR30 requires streaming progress — impossible with polling. Local-daemon already uses WebSocket to same endpoint — proven pattern.

**Implementation:** Reuse `wss://api.vutler.com/ws/chat` endpoint. Nexus connects on startup with auth token. Messages: `task.dispatch` (cloud→nexus), `task.progress` (nexus→cloud), `task.result` (nexus→cloud), `nexus.status` (bidirectional). Fallback to polling if WebSocket fails to connect (degraded mode).

### ADR-2: Provider Architecture — Interface + OS-specific Implementation

**Decision:** Every provider defines a common interface. OS-specific implementations in separate files. Factory selects implementation at runtime via `process.platform`.

**Pattern:**
```
providers/
  search/
    ISearchProvider.js      ← interface definition
    SearchProviderDarwin.js  ← macOS (mdfind)
    SearchProviderWin32.js   ← Windows (Windows Search)
    index.js                 ← factory: returns correct impl
  mail/
    IMailProvider.js
    MailProviderDarwin.js    ← AppleScript → Mail.app
    MailProviderWin32.js     ← COM → Outlook
    index.js
  ...
```

**Rationale:** Clean separation. Each impl can be tested independently. Adding a new OS = add one file + factory entry. No `if (platform === 'darwin')` scattered across codebase.

### ADR-3: Task Protocol — Structured Actions with Permission Check

**Decision:** Cloud sends typed task objects to Nexus. Nexus validates permissions, routes to correct provider, streams progress, returns structured result.

**Task schema:**
```json
{
  "taskId": "uuid",
  "action": "search | read_document | open_file | list_emails | read_calendar | read_contacts | read_clipboard | watch_folder",
  "params": {
    "query": "string",
    "scope": ["~/Documents", "~/Google Drive"],
    "filters": { "type": "pdf", "dateAfter": "2026-03-01" }
  },
  "agentId": "uuid",
  "timestamp": "ISO8601"
}
```

**Result schema:**
```json
{
  "taskId": "uuid",
  "status": "success | error | partial",
  "data": { ... },
  "metadata": {
    "filesScanned": 34,
    "executionMs": 2340,
    "provider": "search"
  },
  "error": { "code": "PERMISSION_DENIED", "message": "..." }
}
```

**Permission check:** Before ANY provider execution, TaskOrchestrator calls `PermissionEngine.validate(action, params.scope)`. Denied = immediate error response, no provider invoked.

### ADR-4: Permission System — Folder ACLs + Action Whitelist

**Decision:** Two-layer permission system:
1. **Folder ACLs:** User explicitly enables folders (opt-in toggles in onboarding). Stored in `~/.vutler/permissions.json`.
2. **Action whitelist:** Each provider action is whitelisted. Cloud cannot invoke unlisted actions.

**Storage:** Local JSON file, never synced to cloud. Cloud only knows "Nexus is online" — not which folders are authorized.

**Audit log:** Every access logged to `~/.vutler/logs/access.jsonl` with: timestamp, action, provider, path(s) accessed, agentId, result (success/denied/error).

### ADR-5: Data Privacy — Extract, Never Transfer

**Decision:** Raw file content NEVER leaves the machine. Nexus extracts/summarizes locally (using LLM if needed via Ollama fallback), sends only structured results to cloud.

**Implementation:** Each provider's `execute()` method returns structured data objects. The WebSocket transport layer has a max payload size (1MB). If extraction result exceeds limit, it's chunked or summarized further. Binary files (images, videos) are never read — only metadata returned.

### ADR-6: Error Handling — Structured Errors, Never Crash

**Decision:** Every provider wraps execution in try/catch. Errors return structured error objects. Nexus process never crashes from a provider failure.

**Error hierarchy:**
- `PermissionDeniedError` — folder not authorized
- `ProviderUnavailableError` — OS feature not available (e.g., Outlook not installed)
- `ParseError` — document parsing failed (scanned PDF, corrupted file)
- `TimeoutError` — operation exceeded time limit
- `UnknownError` — unexpected error with stack trace in logs

**Recovery:** Failed tasks get error response to cloud. Agent shows user-friendly message. Nexus continues processing other tasks.

### ADR-7: Offline Mode — Queue + Graceful Degradation

**Decision:** When cloud connection drops, Nexus enters degraded mode. Tasks already in-flight complete locally. Results queue in `~/.vutler/queue/` for sync on reconnect. Local LLM (Ollama) available for document analysis offline.

**Queue:** SQLite file at `~/.vutler/queue.db`. Max 24h retention. On reconnect, drain queue in order.

### ADR-8: Desktop Installer — QR Code Pairing

**Decision:** Install flow: download .dmg/.exe → install → app shows QR code → user scans in Vutler dashboard → token exchange → connected. No CLI, no manual token entry.

**QR payload:** Short-lived pairing code (5 min TTL). Vutler Cloud exchanges pairing code for persistent auth token. Token stored in `~/.vutler/nexus.json` (encrypted at rest).

## Implementation Patterns & Consistency Rules

### Naming Patterns

| Area | Convention | Example |
|------|-----------|---------|
| Provider files | PascalCase + OS suffix | `SearchProviderDarwin.js` |
| Provider interfaces | `I` prefix + PascalCase | `ISearchProvider.js` |
| Task actions | snake_case | `read_document`, `list_emails` |
| Config keys | snake_case | `allowed_folders`, `max_payload_size` |
| Log fields | snake_case | `agent_id`, `execution_ms` |
| Error classes | PascalCase + Error suffix | `PermissionDeniedError` |

### Structure Patterns

- **One file per provider per OS** — no multi-OS logic in single file
- **Factory pattern** for provider instantiation — `index.js` exports ready instance
- **Co-located tests** — `search/__tests__/SearchProviderDarwin.test.js`
- **Config in `~/.vutler/`** — permissions, logs, queue, nexus.json

### API Response Format

All WebSocket messages follow:
```json
{
  "type": "task.progress | task.result | task.error | nexus.status",
  "taskId": "uuid",
  "payload": { ... },
  "timestamp": "ISO8601"
}
```

### Error Response Format

```json
{
  "type": "task.error",
  "taskId": "uuid",
  "payload": {
    "code": "PERMISSION_DENIED | PROVIDER_UNAVAILABLE | PARSE_ERROR | TIMEOUT | UNKNOWN",
    "message": "Human-readable description",
    "provider": "search",
    "recoverable": true
  }
}
```

### Process Patterns

- **Permission check BEFORE provider execution** — always, no exceptions
- **Structured logging on every file access** — audit trail
- **Timeout per provider action** — 30s default, configurable
- **Graceful degradation** — if a provider fails, others continue
- **Progress streaming** — long operations send updates every 2s minimum

## Project Structure & Boundaries

```
packages/nexus/
├── bin/
│   └── cli.js                          ← CLI entry (init/start/dev/status)
├── lib/
│   ├── index.js                        ← NexusNode main class
│   ├── task-orchestrator.js            ← Receives tasks, validates, routes to providers
│   ├── permission-engine.js            ← Folder ACL validation + audit logging
│   ├── ws-client.js                    ← WebSocket connection to cloud (replaces polling)
│   ├── offline-queue.js                ← SQLite queue for offline task results
│   ├── providers/
│   │   ├── search/
│   │   │   ├── ISearchProvider.js
│   │   │   ├── SearchProviderDarwin.js     ← mdfind (Spotlight)
│   │   │   ├── SearchProviderWin32.js      ← Windows Search / Everything SDK
│   │   │   ├── index.js                    ← factory
│   │   │   └── __tests__/
│   │   ├── document-reader/
│   │   │   ├── IDocumentReader.js
│   │   │   ├── PdfReader.js                ← pdf-parse
│   │   │   ├── XlsxReader.js              ← xlsx (SheetJS)
│   │   │   ├── DocxReader.js              ← mammoth
│   │   │   ├── CsvReader.js               ← built-in or csv-parse
│   │   │   ├── index.js                    ← factory by file extension
│   │   │   └── __tests__/
│   │   ├── app-launcher/
│   │   │   ├── IAppLauncher.js
│   │   │   ├── AppLauncherDarwin.js        ← open command
│   │   │   ├── AppLauncherWin32.js         ← Start-Process
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── clipboard/
│   │   │   ├── IClipboardProvider.js
│   │   │   ├── ClipboardProviderDarwin.js  ← pbpaste/pbcopy
│   │   │   ├── ClipboardProviderWin32.js   ← PowerShell Get-Clipboard
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── mail/
│   │   │   ├── IMailProvider.js
│   │   │   ├── MailProviderDarwin.js       ← AppleScript → Mail.app
│   │   │   ├── MailProviderWin32.js        ← COM → Outlook
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── calendar/
│   │   │   ├── ICalendarProvider.js
│   │   │   ├── CalendarProviderDarwin.js   ← AppleScript → Calendar.app
│   │   │   ├── CalendarProviderWin32.js    ← COM → Outlook Calendar
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── contacts/
│   │   │   ├── IContactsProvider.js
│   │   │   ├── ContactsProviderDarwin.js   ← AppleScript → Contacts.app
│   │   │   ├── ContactsProviderWin32.js    ← COM → Outlook Contacts
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── watcher/
│   │   │   ├── WatchProvider.js            ← chokidar (cross-platform)
│   │   │   ├── index.js
│   │   │   └── __tests__/
│   │   ├── filesystem.js                   ← existing (enhanced: glob, recursive)
│   │   ├── shell.js                        ← existing (hardened: no naive parsing)
│   │   ├── network.js                      ← existing
│   │   ├── llm.js                          ← existing
│   │   ├── env.js                          ← existing
│   │   └── av-control.js                   ← existing
│   ├── errors/
│   │   ├── PermissionDeniedError.js
│   │   ├── ProviderUnavailableError.js
│   │   ├── ParseError.js
│   │   ├── TimeoutError.js
│   │   └── index.js
│   ├── agent-manager.js                    ← existing
│   └── agent-worker.js                     ← existing (fix .read() bug)
├── dashboard/
│   ├── index.html                          ← existing web UI
│   ├── permissions.html                    ← NEW: folder toggle UI
│   └── onboarding.html                     ← NEW: QR code + setup wizard
├── config/
│   └── defaults.js                         ← default config values
├── package.json
└── README.md
```

**Local data directory (`~/.vutler/`):**
```
~/.vutler/
├── nexus.json              ← auth token, node ID, cloud URL
├── permissions.json        ← folder ACLs (opt-in toggles)
├── queue.db                ← SQLite offline task queue
├── logs/
│   ├── nexus.log           ← structured JSON logs
│   └── access.jsonl        ← audit trail (all file accesses)
└── cache/                  ← transient cache (document parsing)
```

### Architectural Boundaries

**Cloud → Nexus boundary:** WebSocket only. Cloud sends typed task objects. Nexus returns structured results. No raw files cross this boundary.

**Provider boundary:** TaskOrchestrator → PermissionEngine → Provider. Each provider is isolated. Failure in one provider doesn't affect others.

**OS boundary:** Provider factory abstracts OS. No OS-specific code outside provider implementations.

**Data boundary:** `~/.vutler/` is the single local data directory. Permissions, logs, queue, cache — all here. Nothing written elsewhere.

### FR to Structure Mapping

| FR Range | Capability | Location |
|----------|-----------|----------|
| FR1-4 | File search | `providers/search/` |
| FR5-9 | Document reading | `providers/document-reader/` |
| FR10-11 | File/app interaction | `providers/app-launcher/` + `providers/filesystem.js` |
| FR12-13 | Clipboard | `providers/clipboard/` |
| FR14-16 | Folder watching | `providers/watcher/` |
| FR17-19 | Local mail | `providers/mail/` |
| FR20-21 | Calendar | `providers/calendar/` |
| FR22-23 | Contacts | `providers/contacts/` |
| FR24-28 | Permissions | `permission-engine.js` + `dashboard/permissions.html` |
| FR29-33 | Cloud communication | `ws-client.js` + `offline-queue.js` |
| FR34-37 | Installation | `bin/cli.js` + `dashboard/onboarding.html` + packaging |

### Data Flow

```
User (Vutler Chat) → Cloud Agent → WebSocket → Nexus TaskOrchestrator
    → PermissionEngine.validate()
    → Provider.execute()
    → [streaming progress via WebSocket]
    → Structured result via WebSocket
    → Cloud Agent → User (Vutler Chat)
```

## Architecture Validation

### Coherence ✅

- All decisions use WebSocket consistently (ADR-1 feeds into ADR-3, ADR-7)
- Provider pattern (ADR-2) is applied uniformly across all 7 new provider categories
- Permission system (ADR-4) is always checked before any provider (ADR-3)
- Error handling (ADR-6) wraps every provider, feeds into task result schema (ADR-3)
- Privacy policy (ADR-5) enforced by structured result schema — no raw file field exists

### Requirements Coverage ✅

- **All 37 FRs** map to specific providers/components (see FR mapping table)
- **All 20 NFRs** addressed: WebSocket for latency (NFR1,3), pkg for RAM (NFR4), TLS (NFR6), error hierarchy (NFR14), chokidar cross-platform (NFR17-18), unicode paths in providers (NFR20)
- **Cross-cutting concerns** handled: permission engine (all providers), structured logging (all providers), error hierarchy (all providers), offline queue (communication layer)

### Implementation Readiness ✅

- Every provider has defined interface + OS-specific implementations
- Task protocol schema is complete and typed
- Error hierarchy covers all failure modes
- Project structure maps every FR to a specific file location
- Naming conventions prevent AI agent conflicts

### Known Gaps (Acceptable for MVP)

| Gap | Impact | Resolution |
|-----|--------|------------|
| Windows Search reliability | May return fewer results than Spotlight | Evaluate Everything SDK during Windows implementation |
| Scanned PDFs | Parse fails on image-only PDFs | Documented as out-of-scope, return ParseError |
| Outlook not installed | Mail/Calendar/Contacts unavailable | Return ProviderUnavailableError, agent tells user |
| pkg system tray | node-systray less mature than Electron tray | Test on target OS versions, fallback to tray-less mode |

## Architecture Completion Summary

**Status:** READY FOR IMPLEMENTATION ✅

**Deliverables:**
- 8 architectural decisions (ADR-1 through ADR-8)
- Provider architecture with factory pattern for 7 new + 6 existing providers
- Complete project structure with FR-to-file mapping
- Task protocol schema (dispatch, progress, result, error)
- Permission system design (folder ACLs + action whitelist + audit)
- Validation confirming coherence and full requirements coverage

**Implementation Sequence:**
1. WebSocket client (ADR-1) — replaces polling, enables everything
2. TaskOrchestrator + PermissionEngine (ADR-3, ADR-4) — routing foundation
3. SearchProvider (macOS first, then Windows) — demo scenario 1
4. DocumentReader (PDF, XLSX, CSV, DOCX) — demo scenario 2
5. AppLauncher — completes demo scenario 1
6. Remaining providers (clipboard, mail, calendar, contacts, watcher)
7. Desktop installer + onboarding (ADR-8)
8. Production hardening (error handling, logging, offline queue)

**Next phases:** Create epics & stories from this architecture, then implement.
