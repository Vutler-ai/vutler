# Nexus Local Integrations — Deployment Summary

**Status**: ✅ Ready for VPS Deployment
**Date**: 2026-03-29
**Commits**: 7c67641 → 6310678 (10 new commits on main)

## What's Deployed

### 6 Complete Epics + TaskExecutor

#### Epic 1: Foundation
- **ws-client.js** - WebSocket client with TLS, 30s heartbeat, exponential backoff reconnect (1s→60s)
- **errors/** - 5 error classes (PermissionDenied, ProviderUnavailable, ParseError, Timeout, Unknown)
- **logger.js** - Structured JSON logging to ~/.vutler/logs/nexus.log
- **task-orchestrator.js** - Routes 10+ actions (search, read_document, open_file, list_dir, write_file, shell_exec, read_clipboard, list_emails, search_emails, read_calendar, read_contacts, search_contacts)
- **permission-engine.js** - Opt-in folder ACLs in ~/.vutler/permissions.json
- **offline-queue.js** - better-sqlite3 backed task queue in ~/.vutler/queue.db

#### Epic 2: File Search & Discovery
- **SearchProviderDarwin.js** - Spotlight (mdfind) on macOS
- **SearchProviderWin32.js** - PowerShell Get-ChildItem + fast-glob on Windows
- **app-launcher.js** - Cross-platform file opener (open/cmd start/xdg-open)
- Enhanced filesystem.js with recursive listing + glob patterns

#### Epic 3: Document Reading
- **PdfReader.js** - pdf-parse (max 50 pages, encrypted detection)
- **XlsxReader.js** - xlsx library with multi-sheet support
- **CsvReader.js** - Auto-detect separator (,/;/\t) + TSV support
- **DocxReader.js** - mammoth text extraction + table parsing
- **batchRead()** - Error-resilient batch processing with progress callbacks

#### Epic 4: Clipboard & Watching
- **clipboard.js** - ClipboardProvider (pbpaste/Get-Clipboard/xclip) with 2s polling
- **watch.js** - WatchProvider using chokidar with awaitWriteFinish stability

#### Epic 5: Mail/Calendar/Contacts
- **MailProviderDarwin.js** - AppleScript to Mail.app (listEmails, searchEmails)
- **MailProviderWin32.js** - PowerShell COM to Outlook (same interface)
- **calendar.js** - CalendarProvider (5-day read, conflict detection)
- **contacts.js** - ContactsProvider (name, email, phone, company)

#### Epic 6: Installer & Onboarding
- **build.js** - pkg packaging (node18-macos-x64, node18-win-x64)
- **create-installer.js** - .dmg (macOS LaunchAgent) + PowerShell install (Windows Task Scheduler)
- **onboarding.html** - 4-step setup (QR pairing → folder permissions → health check → done)
- **dashboard/** - PWA meta tags, manifest.json, sw.js service worker

### TaskExecutor Service
- **taskExecutor.js** - Polls PG every 10s for pending tasks
- Loads agent config + LLM provider (Codex, Anthropic, OpenAI, etc.)
- Calls llmRouter.chat(config, messages, **pool**) ← **OAuth token resolution enabled**
- Stores result + metadata (latency, usage, executed_by, execution_mode) in jsonb
- Agent cache (60s TTL), priority ordering, batch processing (5 tasks/poll)

**Critical Fix**: taskExecutor now passes `pool` to llmChat → enables OAuth token lookup for Codex/ChatGPT provider

## Files to Deploy

### New Files (20 total)
```
packages/nexus/lib/ws-client.js
packages/nexus/lib/errors/
  ├── PermissionDeniedError.js
  ├── ProviderUnavailableError.js
  ├── ParseError.js
  ├── TimeoutError.js
  └── UnknownError.js
packages/nexus/lib/logger.js
packages/nexus/lib/task-orchestrator.js
packages/nexus/lib/permission-engine.js
packages/nexus/lib/offline-queue.js
packages/nexus/lib/providers/search/
  ├── SearchProviderDarwin.js
  ├── SearchProviderWin32.js
  └── index.js
packages/nexus/lib/providers/app-launcher.js
packages/nexus/lib/providers/documents/
  ├── IDocumentReader.js
  ├── PdfReader.js
  ├── XlsxReader.js
  ├── CsvReader.js
  ├── DocxReader.js
  └── index.js
packages/nexus/lib/providers/clipboard.js
packages/nexus/lib/providers/watch.js
packages/nexus/lib/providers/mail/
  ├── MailProviderDarwin.js
  ├── MailProviderWin32.js
  └── index.js
packages/nexus/lib/providers/calendar.js
packages/nexus/lib/providers/contacts.js
packages/nexus/scripts/build.js
packages/nexus/scripts/create-installer.js
packages/nexus/dashboard/onboarding.html
app/custom/services/taskExecutor.js

docs/nexus/
  ├── ARCHITECTURE.md (2000 words)
  ├── INSTALLATION.md (1500 words)
  ├── API_REFERENCE.md (2000 words)
  ├── DEPLOYMENT.md (1000 words)
  └── DEPLOYMENT_CHECKLIST.md (troubleshooting + tests)
```

### Modified Files (3 total)
```
packages/nexus/lib/index.js
  - Integrated WSClient, orchestrator, offline queue, permissions, graceful shutdown

packages/nexus/lib/providers/shell.js
  - execFileSync for injection prevention

packages/nexus/lib/providers/filesystem.js
  - Enhanced listDir() with recursive + pattern filtering
  - glob() and searchRecursive() methods

packages/nexus/lib/providers/agent-worker.js
  - .read() → .readFile() for document support

packages/nexus/package.json
  - Added: better-sqlite3, chokidar, mammoth, pdf-parse, xlsx

services/llmRouter.js (commits dade489)
  - Already passes workspace_id to all callers

app/custom/services/taskExecutor.js (commits 45bfa44, f343916, dade489)
  - Loads agents from DB, routes to llmRouter
  - Passes pool for OAuth resolution
  - Stores results in task metadata jsonb
```

## Deployment Steps

### 1. Pull Latest Code
```bash
cd /var/www/vutler
git fetch origin main
git reset --hard origin/main
```

### 2. Install Dependencies
```bash
cd packages/nexus
npm install
# New: better-sqlite3, chokidar, mammoth, pdf-parse, xlsx
```

### 3. Initialize ~/.vutler Structure
```bash
mkdir -p ~/.vutler/logs
touch ~/.vutler/permissions.json
# queue.db created automatically on first offline event
```

### 4. Start TaskExecutor Service
```bash
# PM2:
pm2 start app/custom/services/taskExecutor.js --name "task-executor"

# Or systemd (see docs/nexus/DEPLOYMENT_CHECKLIST.md for full config)
```

### 5. Verify Dashboard
```bash
curl http://localhost:9999/api/status
# Expected: { "node_id": "...", "connection_status": "connected", ... }
```

## Key Features Now Live

✅ **TaskExecutor** - Polls pending tasks, executes via Mike's Codex agent (OAuth enabled)
✅ **WebSocket** - Persistent wss:// connection replacing polling (fallback to polling if failed)
✅ **File Search** - Spotlight (macOS) / PowerShell (Windows) integration
✅ **Document Reading** - PDF, XLSX, CSV, DOCX auto-detected + batchRead()
✅ **Clipboard** - Polling-based content detection
✅ **File Watching** - chokidar-based monitoring with file_added events
✅ **Mail/Calendar/Contacts** - AppleScript (macOS) / COM (Windows) cross-platform support
✅ **Permissions** - Opt-in folder ACLs with audit logging to ~/logs/access.jsonl
✅ **Offline Queue** - SQLite-backed task capture when cloud unavailable (24h retention)
✅ **Desktop Installer** - pkg binaries + .dmg/.exe installers with LaunchAgent/Task Scheduler
✅ **QR Onboarding** - 4-step setup flow (pairing → permissions → health check → done)
✅ **PWA Support** - Service worker caching + standalone display mode on all dashboard pages

## Testing on VPS

**Before Production**, run verification tests:

```bash
# 1. Test Mike's Codex task execution
INSERT INTO tenant_vutler.tasks (
  id, title, description, status, assignee, workspace_id
) VALUES (
  gen_random_uuid(),
  'Test Codex',
  'What is 2+2?',
  'pending',
  'mike',
  '00000000-0000-0000-0000-000000000001'
);

# Wait 40s (4 poll cycles), check status:
SELECT status, metadata FROM tenant_vutler.tasks WHERE title='Test Codex';
# Expected: status='completed', metadata has 'result' with LLM response

# 2. Monitor execution:
tail -f ~/.vutler/logs/nexus.log

# 3. Check endpoint health:
curl http://localhost:9999/api/status
curl http://localhost:9999/api/tasks
```

**Full verification checklist**: See `docs/nexus/DEPLOYMENT_CHECKLIST.md`

## Rollback

```bash
# If issues occur:
git reset --hard <previous-commit>
npm install
systemctl restart vutler-task-executor
```

## Documentation

All docs committed to `docs/nexus/`:

1. **ARCHITECTURE.md** - System design (2000 words)
2. **INSTALLATION.md** - Setup guide (1500 words)
3. **API_REFERENCE.md** - Endpoints + messages (2000 words)
4. **DEPLOYMENT.md** - VPS ops guide (1000 words)
5. **DEPLOYMENT_CHECKLIST.md** - Tests + troubleshooting

**Total**: ~8500 words of production-ready documentation

---

**Next Step**: Run deployment checklist on VPS, verify Mike's Codex tasks execute successfully, then mark as production-ready.
