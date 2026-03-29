---
stepsCompleted: [step-01-init, step-02-discovery, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish, step-12-complete]
classification:
  projectType: desktop_app
  domain: general
  complexity: medium
  projectContext: brownfield
inputDocuments:
  - docs/product-briefs/nexus-local-integrations.md
  - docs/specs/mobile-dispatch-architecture.md
  - docs/specs/agent-wizard-skill-limits.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 2
workflowType: 'prd'
projectType: 'brownfield'
status: complete
completedAt: '2026-03-29'
---

# Product Requirements Document — Nexus Local Integrations

**Author:** Alex
**Date:** 2026-03-29
**Status:** Complete

## Executive Summary

Nexus Local Integrations extends the existing Nexus agent runtime to give Vutler AI agents direct access to files, apps, and data on the user's PC/Mac. Instead of building costly cloud OAuth integrations per provider (Google Drive API, OneDrive API, etc.), agents access locally-synced files, native mail clients, calendars, and contacts through OS-level APIs. Users interact with agents via Vutler Cloud chat; Nexus executes actions locally in the background.

**Differentiator:** First hybrid cloud+local AI agent platform for business users (not developers). Privacy-first — no raw data leaves the machine. Zero OAuth. Production-grade from day one.

**Target users:** PME dirigeants (5-50 employees) and solopreneurs who need an AI assistant that works with their real data without complex integrations.

**Existing foundation:** Nexus already has a Node.js runtime, 6 providers (filesystem, shell, network, LLM, env, AV-control), HTTP polling to Vutler Cloud, agent routing, CLI, and a local dashboard on port 3100.

## Success Criteria

### User Success

- User delegates 80%+ of administrative file tasks to agents instead of manually navigating their PC
- File search via agent returns results in < 5 seconds with content preview
- Data extraction from documents produces accurate structured output without user reformatting
- Zero configuration post-install — install once, it works
- Full transparency: user sees exactly what Nexus accesses, no file leaves machine without explicit agent action

### Business Success

- Production-grade solution — not a POC, clients follow quality
- Demo scenario executes flawlessly end-to-end in under 60 seconds
- Privacy-first value prop lands immediately as differentiator
- Eliminates cloud integration debt: 0 dev per file source vs 2-4 weeks per OAuth integration
- Positions Vutler as hybrid cloud+local platform distinct from cloud-only competitors

### Technical Success

- Production architecture: error handling, retry logic, graceful degradation, structured logging
- Real-time Nexus ↔ Cloud communication with sub-second latency (WebSocket)
- Cross-platform parity on macOS and Windows
- Document parsing > 95% success rate on standard business documents
- Folder-level permission system with full audit logging
- No regression on existing Nexus providers

### Measurable Outcomes

| Metric | Target | Measurement |
|--------|--------|-------------|
| File search latency | < 5s end-to-end | Instrumented task timing |
| Document parse success | > 95% on PDF/XLSX/CSV/DOCX | Test suite, 50+ real docs |
| Install-to-first-action | < 3 minutes | Onboarding funnel timing |
| Demo completion rate | 100% error-free | Rehearsal runs |
| Raw files leaving machine | 0 | Network traffic audit |
| Error recovery | 100% graceful | Error monitoring |

## Product Scope

### MVP — Production-Ready

| # | Feature | Description |
|---|---------|-------------|
| 1 | SearchProvider | Natural language file search via Spotlight (macOS) / Windows Search. Ranked results with path, date, content preview. |
| 2 | DocumentReader | Parse and extract structured data from PDF, XLSX, CSV, Word (.docx). Text + table detection. |
| 3 | AppLauncher | Open any file in its default application on local OS. |
| 4 | Real-time task protocol | WebSocket Nexus ↔ Cloud for instant dispatch + streaming progress updates. |
| 5 | Permission system | Folder-level opt-in ACLs, action whitelist, audit log in dashboard. |
| 6 | Cross-platform | macOS + Windows for all features. |
| 7 | Production hardening | Error handling, retry, graceful degradation, structured logging, health monitoring. |
| 8 | WatchProvider | Watch folders + triggers (new file → auto-process by agent). |
| 9 | ClipboardProvider | Agent reacts to clipboard content (copy → agent processes). |
| 10 | Local Mail access | Read emails via AppleScript (macOS) / COM-PowerShell (Windows). No OAuth. |
| 11 | Local Calendar access | Read events, detect conflicts, scheduling assistance. |
| 12 | Local Contacts access | Read address book for CRM enrichment and contact lookup. |
| 13 | Desktop installer | .dmg (macOS) + .exe (Windows) for non-technical users. |

### Roadmap (Post-MVP)

- Screenshot + OCR ("what's on my screen")
- Full local RAG index over user documents
- Agent-initiated proactive local actions
- Browser integration (bookmarks, history, active tabs)
- Multi-device Nexus sync (laptop + desktop coordinated)

## User Journeys

### Journey 1 — Marc, Dirigeant PME: "Trouve-moi ce document"

Marc, 47, runs a 25-person construction company. Files scattered across Google Drive sync, Desktop, Downloads.

**Scene:** On the phone with a client asking about a quote sent in February. Usually searches Finder, then Drive, then mail — 5+ minutes.

**Action:** Opens Vutler: *"Jarvis, find the quote for Dubois Construction from February."* Nexus scans via Spotlight. 3 seconds, 2 ranked results with path, date, preview.

**Resolution:** *"Open the first one."* PDF opens on screen. Client still on the phone. Total: 8 seconds.

**Capabilities required:** SearchProvider, AppLauncher, streaming progress, < 5s latency

### Journey 2 — Marc: "Compile les frais du mois"

**Scene:** Month-end. Marc must compile expenses for 25 employees. Usually opens each Excel/PDF manually — takes a full day.

**Action:** *"Jarvis, list all expenses for March for all personnel. Folder: Comptabilité/Frais."* Nexus scans 34 files, extracts amounts, dates, names, categories.

**Resolution:** 45 seconds. Structured table: employee, date, amount, category, source file. Anomalies flagged automatically. One day → one minute.

**Capabilities required:** DocumentReader (PDF + XLSX), batch processing, structured extraction, folder permissions

### Journey 3 — Sophie, Solopreneur: "Mon assistant voit tout"

Sophie, 32, freelance digital marketer. Mac. Constantly copy-pastes between emails, client docs, spreadsheets.

**Scene:** Receives a client email with a campaign brief. Copies the key text.

**Action:** Nexus detects clipboard content. Agent responds: *"I see a client brief. Want me to create a campaign plan?"* Sophie confirms. Agent also accesses her client folder for past campaign history.

**Resolution:** 2 minutes — structured plan integrating brief + history + estimated budget from previous invoices.

**Capabilities required:** ClipboardProvider, cross-file reference, Local Mail access

### Journey 4 — Marc: Setup initial

**Scene:** Marc receives email: "Install Nexus." Not technical, skeptical.

**Action:** Downloads .dmg, double-clicks, drags to Applications. App shows QR code. Scans from Vutler → connected. Nexus asks: "Which folders can your agents access?" Toggles per folder. Enables Documents, Comptabilité, Google Drive. Clear message: "No file will leave your machine."

**Resolution:** Auto health check: Jarvis searches a test file → result in 2s. Operational.

**Capabilities required:** Desktop installer, QR code pairing, folder permission UI, onboarding wizard, health check

### Journey 5 — Agent Vutler: executing a local task

**Scene:** Agent "Jarvis" receives: "Find unpaid invoices this month." Jarvis is cloud-based, no filesystem access.

**Action:** Jarvis formulates a Nexus task: `{ action: "search", query: "facture impayée mars 2026", scope: ["~/Comptabilité"] }`. Sent via WebSocket. Nexus validates permissions, executes search.

**Resolution:** Streaming progress: "Scanning... 12 files found... Extracting..." → structured result. Jarvis receives extracted data (never raw files), formats response. User sees answer in < 10s. Transparent — user doesn't know Nexus is involved.

**Capabilities required:** Cloud ↔ Nexus task protocol, permission validation, streaming progress, data-only response

### Journey Requirements Matrix

| Capability | Journeys | Priority |
|-----------|----------|----------|
| SearchProvider (Spotlight/WinSearch) | J1, J2, J5 | P0 |
| DocumentReader (PDF, XLSX, CSV, DOCX) | J2, J5 | P0 |
| AppLauncher | J1 | P0 |
| ClipboardProvider | J3 | P0 |
| Local Mail access | J3 | P0 |
| WebSocket real-time + streaming | J1, J5 | P0 |
| Permission system + folder ACLs | J4, J5 | P0 |
| Desktop installer + onboarding | J4 | P0 |
| WatchProvider | J3 (implied) | P0 |
| Calendar + Contacts | enrichment | P0 |

## Domain-Specific Requirements

### Privacy & RGPD

- No raw files transit to cloud — only agent-generated extractions/summaries
- Explicit opt-in consent per folder
- Right to erasure: user can revoke access and delete all local cache at any time
- Access logs visible to user in Vutler dashboard

### Local Security

- Nexus never executes arbitrary shell commands from cloud — whitelisted actions only
- All communication over WSS (TLS mandatory)
- Auth token with rotation (30-day expiry) and instant revocation
- No data persisted on cloud without explicit agent action

### Cross-Platform Abstraction

- Each provider exposes a common interface (`ISearchProvider`, `IDocumentReader`, etc.)
- OS-specific implementations selected at runtime via `process.platform`
- Test matrix: every feature validated on both macOS and Windows

## Desktop App Specific Requirements

### Architecture

Nexus is a local Node.js agent runtime running as a background process. It receives tasks from Vutler Cloud via WebSocket, executes locally, and returns results. Headless service with minimal system tray icon and settings/permissions UI for onboarding.

### Platform Support

| Platform | System APIs |
|----------|-------------|
| macOS 12+ | Spotlight (`mdfind`), AppleScript (Mail, Calendar, Contacts), `open`, `pbpaste`/`pbcopy` |
| Windows 10+ | Windows Search / Everything SDK, COM/PowerShell (Outlook, Calendar, Contacts), `Start-Process`, `clip.exe` |

### System Integration Matrix

| Integration | macOS | Windows |
|-------------|-------|---------|
| File search | `mdfind` (Spotlight) | Windows Search / Everything SDK |
| Open file | `open <path>` | `Start-Process <path>` |
| Mail | AppleScript → Mail.app | COM → Outlook / PowerShell |
| Calendar | AppleScript → Calendar.app | COM → Outlook Calendar |
| Contacts | AppleScript → Contacts.app | COM → Outlook Contacts |
| Clipboard | `pbpaste` / `pbcopy` | `powershell Get-Clipboard` |
| File watching | `chokidar` (cross-platform) | `chokidar` (cross-platform) |

### Update Strategy

- Auto-update via Electron autoUpdater or custom check-and-download
- Version check on startup + every 24h
- Silent download, prompt restart. Rollback on failed health check.
- Channels: stable + beta

### Offline Capabilities

- Degraded mode when cloud unreachable
- Local LLM fallback (Ollama) for document analysis offline
- Task queue: pre-disconnect tasks complete locally, results sync on reconnect
- Auto-reconnect with exponential backoff (already implemented)

### Resource Targets

- Packaging: Electron (installer + tray + settings UI) or pkg (headless + web UI on localhost)
- Auto-start: macOS launchd / Windows Task Scheduler
- Memory: < 50MB idle, < 200MB active
- Logging: structured JSON to `~/.vutler/logs/`, 10MB rotation, 7-day retention
- Health: localhost:3100 endpoint (exists), cloud heartbeat tracking

## Functional Requirements

### File Discovery & Search

- FR1: User can search for files across their entire PC using natural language descriptions
- FR2: User can receive ranked search results with file path, modification date, and content preview
- FR3: User can scope search to specific folders or file types
- FR4: Agent can search user's local files on their behalf when a task requires file access

### Document Reading & Data Extraction

- FR5: Agent can extract text content from PDF files
- FR6: Agent can extract structured data (tables, rows, columns) from XLSX and CSV files
- FR7: Agent can extract text content from Word (.docx) files
- FR8: Agent can process multiple documents in batch from a specified folder
- FR9: Agent can return structured data summaries without sending raw files to cloud

### File & App Interaction

- FR10: Agent can open a file in its default application on the user's local OS
- FR11: Agent can list files in a directory with metadata (name, size, date, type)
- FR12: User can trigger an agent action by copying content to clipboard
- FR13: Agent can read current clipboard content when permitted

### Folder Watching & Triggers

- FR14: User can configure watched folders that trigger agent actions on new files
- FR15: Agent can automatically process new files arriving in watched folders
- FR16: User can enable/disable watch triggers per folder

### Local Mail Access

- FR17: Agent can read emails from local mail client (Apple Mail / Outlook)
- FR18: Agent can search emails by sender, subject, date range, or content
- FR19: Agent can extract email content for processing (summarize, categorize, suggest responses)

### Local Calendar & Contacts

- FR20: Agent can read calendar events from local calendar app
- FR21: Agent can detect scheduling conflicts and suggest alternatives
- FR22: Agent can read contacts from local address book
- FR23: Agent can use contact data for CRM enrichment and lookup

### Permissions & Security

- FR24: User can grant or revoke Nexus access to specific folders via toggle UI
- FR25: User can view an audit log of all file accesses performed by Nexus
- FR26: System enforces that no raw file content is sent to cloud
- FR27: System validates folder permissions before executing any local task
- FR28: User can revoke all Nexus access and delete local cache at any time

### Cloud ↔ Nexus Communication

- FR29: Vutler Cloud can dispatch tasks to Nexus in real-time via WebSocket
- FR30: Nexus can send streaming progress updates during task execution
- FR31: Nexus can return structured results to cloud upon task completion
- FR32: System can detect Nexus online/offline status and display it to user
- FR33: System queues tasks when Nexus is temporarily offline and delivers on reconnect

### Installation & Onboarding

- FR34: User can install Nexus via .dmg (macOS) or .exe (Windows) without CLI
- FR35: User can pair Nexus with their Vutler account via QR code scan
- FR36: User can complete onboarding (install → pair → permissions → first search) in under 3 minutes
- FR37: System runs a health check post-onboarding to confirm operational status

## Non-Functional Requirements

### Performance

- NFR1: File search returns results in < 5 seconds end-to-end (user → cloud → Nexus → results → cloud → user)
- NFR2: Document parsing completes in < 10 seconds per file for standard documents (< 50 pages, < 10MB)
- NFR3: WebSocket message delivery latency < 500ms between Nexus and Cloud
- NFR4: Nexus idle memory < 50MB, active task < 200MB
- NFR5: Streaming progress updates sent at minimum every 2 seconds during long operations

### Security

- NFR6: All Nexus ↔ Cloud communication over WSS (TLS 1.2+)
- NFR7: Auth tokens expire after 30 days, renewable via CLI or dashboard
- NFR8: Token revocation takes effect within 60 seconds
- NFR9: No raw file content stored on cloud
- NFR10: All file access logged with timestamp, path, action, agent ID
- NFR11: Shell execution restricted to whitelisted actions — no arbitrary commands from cloud

### Reliability

- NFR12: Auto-reconnect on connection loss with exponential backoff (1s → 30s max)
- NFR13: Offline task queue with 24h retention, delivered on reconnect
- NFR14: Failed document parsing returns graceful error, never crashes Nexus
- NFR15: Auto-restart on crash via OS service manager (launchd / Task Scheduler)
- NFR16: Health check endpoint on localhost:3100

### Compatibility

- NFR17: macOS 12 (Monterey) through macOS 15
- NFR18: Windows 10 (21H2+) and Windows 11
- NFR19: Document parsing supports UTF-8, Latin-1, Windows-1252 encodings
- NFR20: File paths with spaces, accents, and unicode characters handled correctly

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Windows Search less reliable than Spotlight | Degraded search quality on Windows | Evaluate Everything SDK as fallback; abstract behind ISearchProvider |
| Scanned PDFs unparsable (image-only) | Failed extraction in demo | Explicitly out of MVP scope — text-based PDFs only. Document limitation. |
| AppleScript breaks between macOS versions | Mail/Calendar access fails | Pin tested versions (12-15), graceful fallback if API unavailable |
| Outlook not installed on Windows | Mail/Calendar unavailable | Detect presence, show "mail not available" gracefully |
| HTTP polling latency (0-10s) | Slow demo experience | Migrate to WebSocket — P0 architecture decision |
| Cross-platform doubles dev effort | Timeline risk | Common interface, OS-specific implementations isolated in separate files |
