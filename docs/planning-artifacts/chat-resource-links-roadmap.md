# Chat Resource Links Roadmap
_Updated: 2026-03-31_

## Current State

Delivered in the latest release:
- smarter chat auto-scroll that stays usable in long threads
- richer message rendering with a cleaner WhatsApp/Discord-style layout
- clickable Markdown and plain URLs in message bodies
- resource artifacts emitted by the LLM router for Drive, Calendar, and Email actions
- visible `Open` cards under agent messages
- exact deep links for email drafts/messages and calendar events
- Drive file previews with exact file linking from chat
- production deploy validated on the VPS with smoke tests passing

## What Remains

### 1. Standardize The Artifact Contract
Goal: make resource links a first-class structured payload everywhere, not only a parsed content block.

Needed:
- persist `resource_artifacts` consistently on agent messages across all chat code paths
- stop relying on text parsing once every sender path writes metadata
- define one shared artifact shape for Drive, Calendar, Email, and future tools
- include stable fields for `kind`, `label`, `href`, `note`, `action`, and `status`

Done when:
- the UI can render artifacts from metadata alone
- message content no longer needs a fallback `Liens utiles` parser

### 2. Better Drive Exactness
Goal: make Drive links precise enough for document-centric workflows.

Needed:
- support exact file open from search/list/create/update outputs everywhere the drive skill returns an `id`
- keep folder links for navigation, but prefer file-level links when a file exists
- show preview state in the chat card when the artifact points to a document, image, or PDF
- optionally expose a dedicated `file` deep link in the Drive page URL contract if that becomes useful elsewhere

Done when:
- the agent can create or update a document and the user lands on the exact file, not just the parent folder

### 3. Action Cards With Status
Goal: make agent actions visually obvious and trustworthy.

Needed:
- show status badges like `Created`, `Updated`, `Sent`, `Draft`, `Opened`
- distinguish `Open` from `Download` and `Preview`
- support one-click CTA styling for the primary artifact
- keep secondary artifacts compact and non-dominant

Done when:
- the user can see at a glance what the agent created and where to open it

### 4. Delivery Auditing
Goal: make links and side effects inspectable after the fact.

Needed:
- record artifact click-throughs in telemetry
- store a small summary of the created object in message metadata or action run metadata
- surface exact generated links in the Action Runs inspector
- add a lightweight trace from agent output to artifact creation

Done when:
- operators can answer “what did the agent create, and where is it?” without searching logs

### 5. Regression Coverage
Goal: prevent link rendering and deep-linking from drifting in future refactors.

Needed:
- unit tests for artifact extraction and de-duplication
- UI tests for message rendering with links and cards
- integration tests for calendar and email deep links
- smoke coverage for a created Drive file, a draft email, and a calendar event

Done when:
- link behavior is covered by tests instead of manual verification

### 6. Future Surfaces
Goal: extend the same pattern to other agent-owned objects.

Candidates:
- tasks
- contacts
- notes / memory references
- runbooks and generated plans

Done when:
- every agent-created object can return a direct `Open` link in chat

## Recommended Order

1. Standardize the artifact contract
2. Expand Drive exact file handling
3. Add status-aware action cards
4. Add telemetry and audit trails
5. Add regression tests
6. Reuse the same pattern for tasks and other surfaces

## Notes

- The latest deployment already validates the end-to-end chat rendering and deep links.
- The next meaningful step is to remove the remaining text-parsing fallback once metadata coverage is complete.
- If the product needs a sharper handoff experience, the Drive exact-file story is the highest-impact follow-up.
