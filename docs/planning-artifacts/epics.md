---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - docs/planning-artifacts/prd.md
  - docs/planning-artifacts/architecture.md
status: complete
completedAt: '2026-03-29'
epicCount: 6
storyCount: 20
frCoverage: 37/37
---

# Nexus Local Integrations - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Nexus Local Integrations, decomposing 37 functional requirements and 8 architectural decisions into 6 epics and 20 implementation-ready stories.

## Requirements Inventory

### Functional Requirements

- FR1: User can search for files across their entire PC using natural language descriptions
- FR2: User can receive ranked search results with file path, modification date, and content preview
- FR3: User can scope search to specific folders or file types
- FR4: Agent can search user's local files on their behalf when a task requires file access
- FR5: Agent can extract text content from PDF files
- FR6: Agent can extract structured data (tables, rows, columns) from XLSX and CSV files
- FR7: Agent can extract text content from Word (.docx) files
- FR8: Agent can process multiple documents in batch from a specified folder
- FR9: Agent can return structured data summaries without sending raw files to cloud
- FR10: Agent can open a file in its default application on the user's local OS
- FR11: Agent can list files in a directory with metadata (name, size, date, type)
- FR12: User can trigger an agent action by copying content to clipboard
- FR13: Agent can read current clipboard content when permitted
- FR14: User can configure watched folders that trigger agent actions on new files
- FR15: Agent can automatically process new files arriving in watched folders
- FR16: User can enable/disable watch triggers per folder
- FR17: Agent can read emails from local mail client (Apple Mail / Outlook)
- FR18: Agent can search emails by sender, subject, date range, or content
- FR19: Agent can extract email content for processing (summarize, categorize, suggest responses)
- FR20: Agent can read calendar events from local calendar app
- FR21: Agent can detect scheduling conflicts and suggest alternatives
- FR22: Agent can read contacts from local address book
- FR23: Agent can use contact data for CRM enrichment and lookup
- FR24: User can grant or revoke Nexus access to specific folders via toggle UI
- FR25: User can view an audit log of all file accesses performed by Nexus
- FR26: System enforces that no raw file content is sent to cloud
- FR27: System validates folder permissions before executing any local task
- FR28: User can revoke all Nexus access and delete local cache at any time
- FR29: Vutler Cloud can dispatch tasks to Nexus in real-time via WebSocket
- FR30: Nexus can send streaming progress updates during task execution
- FR31: Nexus can return structured results to cloud upon task completion
- FR32: System can detect Nexus online/offline status and display it to user
- FR33: System queues tasks when Nexus is temporarily offline and delivers on reconnect
- FR34: User can install Nexus via .dmg (macOS) or .exe (Windows) without CLI
- FR35: User can pair Nexus with their Vutler account via QR code scan
- FR36: User can complete onboarding (install → pair → permissions → first search) in under 3 minutes
- FR37: System runs a health check post-onboarding to confirm operational status

### NonFunctional Requirements

- NFR1: File search returns results in < 5 seconds end-to-end
- NFR2: Document parsing completes in < 10 seconds per file for standard documents
- NFR3: WebSocket message delivery latency < 500ms between Nexus and Cloud
- NFR4: Nexus idle memory < 50MB, active task < 200MB
- NFR5: Streaming progress updates sent at minimum every 2 seconds during long operations
- NFR6: All Nexus ↔ Cloud communication over WSS (TLS 1.2+)
- NFR7: Auth tokens expire after 30 days, renewable via CLI or dashboard
- NFR8: Token revocation takes effect within 60 seconds
- NFR9: No raw file content stored on cloud
- NFR10: All file access logged with timestamp, path, action, agent ID
- NFR11: Shell execution restricted to whitelisted actions only
- NFR12: Auto-reconnect on connection loss with exponential backoff (1s → 30s max)
- NFR13: Offline task queue with 24h retention, delivered on reconnect
- NFR14: Failed document parsing returns graceful error, never crashes Nexus
- NFR15: Auto-restart on crash via OS service manager
- NFR16: Health check endpoint on localhost:3100
- NFR17: macOS 12 (Monterey) through macOS 15
- NFR18: Windows 10 (21H2+) and Windows 11
- NFR19: Document parsing supports UTF-8, Latin-1, Windows-1252 encodings
- NFR20: File paths with spaces, accents, and unicode characters handled correctly

### Additional Requirements

- ADR-1: Replace HTTP polling with persistent WebSocket connection (P0)
- ADR-2: Provider interface + OS-specific factory pattern for all providers
- ADR-3: Typed task protocol with permission check before execution
- ADR-4: Two-layer permission system (folder ACLs + action whitelist)
- ADR-5: Extract-only policy — never transfer raw files to cloud
- ADR-6: Structured error hierarchy (5 error classes)
- ADR-7: Offline mode with SQLite queue (24h retention)
- ADR-8: Desktop installer with QR code pairing
- BUG: AgentWorker calls .read() instead of .readFile() on FilesystemProvider
- SECURITY: ShellProvider naive argument parsing needs hardening
- DEPS: ws, chokidar, pdf-parse, xlsx, mammoth, fast-glob, node-systray
- PACKAGING: pkg for binary + node-systray for tray + create-dmg/Inno Setup for installer

### FR Coverage Map

| FR | Epic | Story | Description |
|----|------|-------|-------------|
| FR1 | 2 | 2.1/2.2 | Search files with natural language |
| FR2 | 2 | 2.1/2.2 | Ranked results with preview |
| FR3 | 2 | 2.1/2.2 | Scoped search (folder/type) |
| FR4 | 2 | 2.1/2.2 | Agent-initiated file search |
| FR5 | 3 | 3.1 | PDF text extraction |
| FR6 | 3 | 3.2 | XLSX/CSV structured data |
| FR7 | 3 | 3.3 | Word (.docx) extraction |
| FR8 | 3 | 3.4 | Batch document processing |
| FR9 | 3 | 3.4 | Structured summaries only |
| FR10 | 2 | 2.3 | Open file in default app |
| FR11 | 2 | 2.4 | List directory with metadata |
| FR12 | 4 | 4.1 | Clipboard triggers agent |
| FR13 | 4 | 4.1 | Read clipboard content |
| FR14 | 4 | 4.2 | Configure watched folders |
| FR15 | 4 | 4.2 | Auto-process new files |
| FR16 | 4 | 4.2 | Enable/disable watchers |
| FR17 | 5 | 5.1/5.2 | Read local emails |
| FR18 | 5 | 5.1/5.2 | Search emails |
| FR19 | 5 | 5.1/5.2 | Extract email content |
| FR20 | 5 | 5.3 | Read calendar events |
| FR21 | 5 | 5.3 | Detect scheduling conflicts |
| FR22 | 5 | 5.4 | Read contacts |
| FR23 | 5 | 5.4 | CRM enrichment from contacts |
| FR24 | 1 | 1.4 | Grant/revoke folder access |
| FR25 | 1 | 1.4 | View audit log |
| FR26 | 1 | 1.3 | No raw files to cloud |
| FR27 | 1 | 1.4 | Permission validation |
| FR28 | 1 | 1.4 | Revoke all + delete cache |
| FR29 | 1 | 1.1/1.3 | Real-time task dispatch |
| FR30 | 1 | 1.3 | Streaming progress |
| FR31 | 1 | 1.3 | Structured results |
| FR32 | 1 | 1.5 | Online/offline detection |
| FR33 | 1 | 1.5 | Offline task queue |
| FR34 | 6 | 6.2 | Install via .dmg/.exe |
| FR35 | 6 | 6.3 | QR code pairing |
| FR36 | 6 | 6.3 | Onboarding < 3min |
| FR37 | 6 | 6.3 | Post-onboarding health check |

## Epic List

### Epic 1: Nexus Real-Time Communication & Foundation
Nexus can receive and execute tasks from the cloud in real-time, with permissions enforcement, structured error handling, and offline resilience.
**FRs covered:** FR24-33 | **Stories:** 6

### Epic 2: File Search & Discovery
Users can ask an agent to find any file on their PC, see ranked results, and open files directly.
**FRs covered:** FR1-4, FR10-11 | **Stories:** 4

### Epic 3: Document Reading & Data Extraction
Agents can read and extract structured data from business documents and process files in batch.
**FRs covered:** FR5-9 | **Stories:** 4

### Epic 4: Clipboard & Folder Watching
Users interact passively — clipboard auto-detection and watched folders trigger agent actions.
**FRs covered:** FR12-16 | **Stories:** 2

### Epic 5: Local Mail, Calendar & Contacts
Agents access local email, calendar, and contacts without OAuth.
**FRs covered:** FR17-23 | **Stories:** 4

### Epic 6: Desktop Installer & Onboarding
Non-technical users install Nexus and are operational in under 3 minutes.
**FRs covered:** FR34-37 | **Stories:** 3

---

## Epic 1: Nexus Real-Time Communication & Foundation

Nexus can receive and execute tasks from the cloud in real-time, with permissions enforcement, structured error handling, and offline resilience. This is the foundation that enables all subsequent provider epics.

### Story 1.1: WebSocket Client replacing HTTP Polling

As a **Vutler Cloud system**,
I want to send tasks to Nexus via persistent WebSocket connection,
So that task dispatch is real-time (< 500ms) instead of polling every 10 seconds.

**Acceptance Criteria:**

**Given** Nexus starts with a valid auth token
**When** it connects to `wss://api.vutler.com/ws/chat`
**Then** a persistent WebSocket connection is established with TLS
**And** heartbeat messages are exchanged every 30 seconds
**And** on connection loss, Nexus auto-reconnects with exponential backoff (1s → 30s)
**And** HTTP polling is retained as fallback if WebSocket fails to connect
**And** existing 6 providers continue to function without regression

### Story 1.2: Error Hierarchy & Structured Logging

As a **developer**,
I want all errors to follow a structured hierarchy with consistent logging,
So that errors are never silent and every failure is traceable.

**Acceptance Criteria:**

**Given** a provider operation fails
**When** the error is caught
**Then** it is classified as one of: PermissionDeniedError, ProviderUnavailableError, ParseError, TimeoutError, UnknownError
**And** a structured JSON log entry is written to `~/.vutler/logs/nexus.log`
**And** the error is returned to cloud as structured task.error message
**And** Nexus process never crashes from a provider failure

### Story 1.3: Task Orchestrator & Provider Routing

As a **Vutler Cloud agent**,
I want to dispatch typed task objects to Nexus that get routed to the correct provider,
So that agents can request local actions without knowing implementation details.

**Acceptance Criteria:**

**Given** a task message arrives via WebSocket with `action: "search" | "read_document" | "open_file" | ...`
**When** TaskOrchestrator receives it
**Then** it validates the task schema (taskId, action, params, agentId, timestamp)
**And** routes to the correct provider based on `action` field
**And** returns structured result with taskId, status, data, metadata
**And** sends streaming progress updates every 2 seconds for long operations
**And** enforces max payload size of 1MB on results

### Story 1.4: Permission Engine & Folder ACLs

As a **user**,
I want to control exactly which folders Nexus can access,
So that my private files stay private and I see everything that was accessed.

**Acceptance Criteria:**

**Given** a task requests access to a folder path
**When** PermissionEngine.validate() is called
**Then** it checks `~/.vutler/permissions.json` for opt-in folder ACLs
**And** denies access with PermissionDeniedError if folder not authorized
**And** logs every access attempt (granted or denied) to `~/.vutler/logs/access.jsonl`
**And** permissions.json is never synced to cloud
**And** user can grant/revoke folder access via dashboard UI on localhost:3100

### Story 1.5: Offline Task Queue

As a **user**,
I want tasks to complete even if my internet drops briefly,
So that I don't lose work when my connection is unstable.

**Acceptance Criteria:**

**Given** Nexus loses cloud connection during or after task execution
**When** results cannot be sent to cloud
**Then** results are queued in SQLite at `~/.vutler/queue.db`
**And** queue retains results for up to 24 hours
**And** on reconnect, queued results are drained in order
**And** Nexus status indicator reflects "offline" / "reconnecting" / "online"

### Story 1.6: Existing Provider Hardening

As a **developer**,
I want the existing ShellProvider and FilesystemProvider bugs fixed,
So that the foundation is secure before adding new providers.

**Acceptance Criteria:**

**Given** ShellProvider receives a command
**When** arguments contain spaces or special characters
**Then** arguments are properly escaped (no naive string splitting)
**And** AgentWorker calls `.readFile()` instead of `.read()` on FilesystemProvider
**And** FilesystemProvider gains glob and recursive search via fast-glob
**And** all 6 existing providers pass their existing tests without regression

---

## Epic 2: File Search & Discovery

Users can ask an agent to find any file on their PC by description, see ranked results with previews, and open files directly — the core demo scenario #1.

### Story 2.1: SearchProvider macOS (Spotlight)

As a **user on macOS**,
I want to search for files by description and get ranked results instantly,
So that I find documents without remembering where I saved them.

**Acceptance Criteria:**

**Given** a search task with query "devis Dubois Construction février"
**When** SearchProviderDarwin executes via `mdfind`
**Then** results are returned ranked by relevance with path, modification date, and content preview
**And** search completes in < 5 seconds end-to-end
**And** search can be scoped to specific folders via params.scope
**And** file paths with spaces, accents, and unicode characters work correctly
**And** ISearchProvider interface is defined and SearchProviderDarwin implements it

### Story 2.2: SearchProvider Windows

As a **user on Windows**,
I want the same file search capability as macOS users,
So that the platform I use doesn't limit my experience.

**Acceptance Criteria:**

**Given** a search task on Windows
**When** SearchProviderWin32 executes via Windows Search API
**Then** results match the same ISearchProvider interface as macOS
**And** search returns ranked results with path, date, and preview
**And** factory in `index.js` selects correct implementation via `process.platform`
**And** fallback to Everything SDK evaluated if Windows Search is unreliable

### Story 2.3: AppLauncher (cross-platform)

As a **user**,
I want the agent to open a file on my screen in its default application,
So that I can immediately work with the document the agent found.

**Acceptance Criteria:**

**Given** a task with `action: "open_file"` and a valid file path
**When** AppLauncher executes
**Then** on macOS: `open <path>` launches the file in its default app
**And** on Windows: `Start-Process <path>` launches the file
**And** PermissionEngine validates folder access before opening
**And** returns success with file path opened, or error if file not found

### Story 2.4: Enhanced FilesystemProvider

As an **agent**,
I want to list directory contents with rich metadata,
So that I can help users browse and understand their file structure.

**Acceptance Criteria:**

**Given** a task with `action: "list_directory"` and a folder path
**When** FilesystemProvider executes
**Then** returns list of files with name, size, modification date, file type
**And** supports recursive listing via `params.recursive: true`
**And** supports glob patterns via `params.pattern: "*.pdf"`
**And** permission check validates folder access before listing

---

## Epic 3: Document Reading & Data Extraction

Agents can read and extract structured data from business documents (PDF, Excel, CSV, Word), process files in batch, and return summaries — the core demo scenario #2.

### Story 3.1: PDF Reader

As an **agent**,
I want to extract text content from PDF files,
So that I can analyze invoices, contracts, and reports for the user.

**Acceptance Criteria:**

**Given** a task with `action: "read_document"` and a PDF file path
**When** PdfReader executes via pdf-parse
**Then** text content is extracted and returned as structured data
**And** parsing completes in < 10 seconds for documents < 50 pages
**And** scanned (image-only) PDFs return ParseError with clear message
**And** UTF-8, Latin-1, Windows-1252 encodings handled correctly
**And** IDocumentReader interface is defined

### Story 3.2: Excel & CSV Reader

As an **agent**,
I want to extract structured data (tables, rows, columns) from spreadsheets,
So that I can compile expense reports and financial data for the user.

**Acceptance Criteria:**

**Given** a task with an .xlsx or .csv file path
**When** XlsxReader or CsvReader executes
**Then** structured data is returned with headers, rows, and cell values
**And** multiple sheets in .xlsx are accessible
**And** numeric values are parsed correctly (locale-aware)
**And** result follows IDocumentReader interface

### Story 3.3: Word Document Reader

As an **agent**,
I want to extract text from Word (.docx) files,
So that I can process contracts, proposals, and documents for the user.

**Acceptance Criteria:**

**Given** a task with a .docx file path
**When** DocxReader executes via mammoth
**Then** text content is extracted preserving structure (headings, paragraphs, lists)
**And** tables within the document are extracted as structured data
**And** parsing completes in < 10 seconds for standard documents

### Story 3.4: Batch Document Processing

As an **agent**,
I want to process multiple documents in a folder at once,
So that I can compile data across many files (e.g., all expense reports in a folder).

**Acceptance Criteria:**

**Given** a task with `action: "read_document"` and `params.batch: true` and a folder path
**When** DocumentReader processes the folder
**Then** all supported files (PDF, XLSX, CSV, DOCX) are processed
**And** streaming progress updates report per-file progress
**And** failed files are reported individually without stopping the batch
**And** no raw file content is included in results — only extracted data

---

## Epic 4: Clipboard & Folder Watching

Users interact passively with agents — clipboard auto-detection triggers agent actions, and watched folders auto-process new files as they arrive.

### Story 4.1: ClipboardProvider (cross-platform)

As a **user**,
I want the agent to react when I copy something,
So that I can trigger intelligent processing just by copying text.

**Acceptance Criteria:**

**Given** clipboard monitoring is enabled in permissions
**When** user copies text to clipboard
**Then** on macOS: `pbpaste` reads the content
**And** on Windows: `PowerShell Get-Clipboard` reads the content
**And** clipboard content is sent to cloud as a `clipboard.changed` event
**And** agent can read clipboard on-demand via `action: "read_clipboard"`
**And** polling interval is configurable (default 2 seconds)

### Story 4.2: WatchProvider (folder triggers)

As a **user**,
I want to set up folders that auto-trigger agent actions when new files appear,
So that incoming invoices or documents are processed automatically.

**Acceptance Criteria:**

**Given** user configures a watched folder via dashboard
**When** a new file appears in the folder (via chokidar `add` event)
**Then** a `watch.file_added` event is sent to cloud with file path and metadata
**And** the agent can decide how to process the new file
**And** user can enable/disable watchers per folder in dashboard
**And** watched folder config stored in `~/.vutler/permissions.json`

---

## Epic 5: Local Mail, Calendar & Contacts

Agents access the user's local email client, calendar, and contacts without OAuth — enabling email processing, scheduling assistance, and CRM enrichment.

### Story 5.1: MailProvider macOS (AppleScript → Mail.app)

As a **user on macOS**,
I want the agent to read and search my emails from Mail.app,
So that I can ask the agent to find, summarize, or process my emails.

**Acceptance Criteria:**

**Given** a task with `action: "list_emails"` or `action: "search_emails"`
**When** MailProviderDarwin executes via AppleScript
**Then** emails are returned with sender, subject, date, body preview
**And** search by sender, subject, date range, or content is supported
**And** IMailProvider interface is defined
**And** ProviderUnavailableError returned if Mail.app not configured

### Story 5.2: MailProvider Windows (COM → Outlook)

As a **user on Windows**,
I want the same email access as macOS users,
So that the platform doesn't limit my experience.

**Acceptance Criteria:**

**Given** a task with email action on Windows
**When** MailProviderWin32 executes via COM/PowerShell to Outlook
**Then** same IMailProvider interface produces consistent results
**And** ProviderUnavailableError if Outlook not installed

### Story 5.3: CalendarProvider (cross-platform)

As a **user**,
I want the agent to read my calendar and detect conflicts,
So that I can get scheduling assistance without sharing my calendar externally.

**Acceptance Criteria:**

**Given** a task with `action: "read_calendar"`
**When** CalendarProvider executes (AppleScript on macOS, COM on Windows)
**Then** events are returned with title, date/time, duration, location
**And** conflict detection identifies overlapping events
**And** ICalendarProvider interface defined with OS-specific implementations

### Story 5.4: ContactsProvider (cross-platform)

As a **user**,
I want the agent to look up contacts from my address book,
So that I can enrich my CRM and find contact details quickly.

**Acceptance Criteria:**

**Given** a task with `action: "read_contacts"` or `action: "search_contacts"`
**When** ContactsProvider executes (AppleScript on macOS, COM on Windows)
**Then** contacts are returned with name, email, phone, company
**And** search by name or company is supported
**And** IContactsProvider interface defined with OS-specific implementations

---

## Epic 6: Desktop Installer & Onboarding

A non-technical user can install Nexus and be fully operational in under 3 minutes, with QR code pairing and guided folder permissions.

### Story 6.1: pkg Binary Packaging

As a **developer**,
I want Nexus packaged as a native binary for macOS and Windows,
So that users don't need Node.js installed to run Nexus.

**Acceptance Criteria:**

**Given** the Nexus codebase
**When** pkg builds the binary
**Then** macOS binary runs on macOS 12-15
**And** Windows binary runs on Windows 10-11
**And** binary includes node-systray for system tray icon
**And** idle memory < 50MB

### Story 6.2: Desktop Installer (.dmg + .exe)

As a **non-technical user**,
I want to install Nexus by double-clicking a downloaded file,
So that I don't need CLI or technical skills.

**Acceptance Criteria:**

**Given** user downloads Nexus installer
**When** they open the .dmg (macOS) or .exe (Windows)
**Then** installation completes with standard OS install flow
**And** Nexus registers as login item (launchd on macOS, Task Scheduler on Windows)
**And** system tray icon appears after installation

### Story 6.3: QR Code Pairing & Onboarding

As a **user**,
I want to connect Nexus to my Vutler account by scanning a QR code,
So that setup is instant and doesn't require typing tokens.

**Acceptance Criteria:**

**Given** Nexus is installed and running for the first time
**When** user opens the onboarding page (localhost:3100/onboarding)
**Then** a QR code with a short-lived pairing code (5 min TTL) is displayed
**And** user scans QR from Vutler dashboard → token exchange completes
**And** user sees folder permission toggles to opt-in specific folders
**And** after permissions set, auto health check runs (agent searches test file)
**And** total onboarding completes in < 3 minutes

---

## Validation Summary

**FR Coverage:** 37/37 (100%)
**Epic Count:** 6
**Story Count:** 20
**Dependencies:** All forward-only (no story depends on a future story)
**Architecture Compliance:** All 8 ADRs reflected in stories
**Status:** READY FOR IMPLEMENTATION ✅
