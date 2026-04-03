# Integrations Capability, Consent And Readiness v1

## Purpose

This document is the canonical source of truth for how Vutler should describe, validate, and expose integrations across:

- workspace-level cloud connectors
- agent access policy
- Nexus local runtime
- customer consent and local device permissions

It replaces informal mixing of “connected”, “usable”, and “available”.

## Core Model

### Connector Readiness

Each integration in the catalog must be classified as one of:

- `operational`
  - The connector is implemented, connectable, and usable for at least one supported runtime path.
- `partial`
  - The connector exists but only a subset of the promised capabilities is truly effective.
- `coming_soon`
  - The connector may exist in catalog/UI, but is not operational and must not be presented as effective.

Readiness is a catalog truth, not a tenant-specific truth.

### Capability Matrix

Each runtime capability must be described through four states:

- `workspace_available`
  - The workspace has the integration or local provider available at all.
- `agent_allowed`
  - The agent policy allows use of that capability.
- `provisioned`
  - The capability has enough concrete setup to be routed at runtime.
- `effective`
  - The capability can actually execute now with the current connector, scopes, permissions, and runtime path.

Only `effective` means “the agent can use this now”.

## Connector Types

### Cloud-Required

A connector is `cloud-required` when its useful behavior depends on a remote API and cannot be replaced by local runtime on a client PC.

Examples:

- Slack
- Teams
- Notion
- GitHub
- HubSpot or Salesforce
- n8n

### Local-First

A connector is `local-first` when Nexus local can satisfy the core use case through the customer machine without needing a dedicated cloud connector.

Examples:

- synced folders from Google Drive, OneDrive, Dropbox
- desktop mail/calendar/contacts
- local files and watch folders
- app launching and document parsing

### Hybrid

A connector is `hybrid` when both cloud APIs and Nexus local can serve overlapping use cases.

Examples:

- Microsoft 365
- Google Workspace

## Consent Model

### Cloud Consent

Cloud consent has three layers:

- Vutler pre-consent
  - Internal explanation of what the user is about to authorize.
- Provider consent
  - The OAuth provider grant page and scopes.
- Post-connect validation
  - Validation of the scopes and APIs actually usable after redirect.

The UI must distinguish:

- requested scopes
- granted scopes
- validated scopes
- unsupported capabilities

### Nexus Local Consent

Nexus local consent has four layers:

- source
  - file system, mail, calendar, contacts, clipboard, shell
- app
  - Outlook, Apple Mail, Finder folders, synced drives, etc.
- action
  - read, search, open, write, send, execute
- folder scope
  - for file-backed permissions

The cloud UI must not collapse this to folders only.

### OS Permissions

OS permissions are separate from product consent.

Examples:

- Full Disk Access
- Calendar access
- Contacts access
- Mail access

A capability may be:

- consented in Vutler
- allowed in agent policy
- still ineffective because the OS permission is missing

## Admin UI Rules

### Integrations Catalog

The catalog must show:

- readiness badge
- local-first vs cloud-required
- whether the connector is connected
- whether the connector is validated

The catalog must not imply that `connected` equals `effective`.

### Integration Detail

Each integration detail page must show:

- what Vutler can do today
- what is connected but not validated
- what is promised but not implemented
- what is replaced by Nexus local when available

The detail contract is:

- `requested scopes`
  - the scope set Vutler asks for at connect time
- `granted scopes`
  - the scope set the workspace actually granted
- `validated scopes`
  - the subset Vutler proved usable through a post-connect check or validated credential test
- `unsupported capabilities`
  - capability blocks still visible in product language but not yet wired in runtime

Examples:

- `Microsoft 365`
  - Outlook mail, calendar, and contacts may be validated
  - Teams, OneDrive, and SharePoint stay unsupported until their runtime path exists
- `Google Workspace`
  - Gmail, calendar, contacts, and Drive may not all have the same validation depth
  - local desktop or synced-folder fallback must be explained when Nexus local is relevant

### Agent Integration UI

The agent view must show:

- workspace availability
- agent policy allowance
- provisioning state
- effective state

It should answer:

- “Can this agent use it now?”
- “If not, what is missing?”

The agent view is read-only.

It must not:

- pretend connectors belong to the agent
- offer per-agent connector setup as the primary model
- merge agent policy and workspace connection into one ambiguous status

Instead it should expose:

- the global capability matrix
- connector entry points back to workspace integrations
- a connector-level explanation of why the agent is blocked or effective

## Nexus Local UI Rules

The Nexus node detail page must unify:

- discovery snapshot
- consent state
- provider source inventory
- effective local capabilities
- remediation hints

It should distinguish at least:

- app not detected
- sync folder not found
- OS permission missing
- consent denied
- agent blocked by policy

The first remediation layer must stay non-destructive.

This means the UI may:

- explain the blocker
- point to the next action
- ask the admin to rerun discovery

It must not:

- deep-link into OS automation without a dedicated native implementation
- silently grant consent
- claim a local path is effective before discovery and consent agree

Canonical local blocker categories:

- `needs_discovery`
- `denied_consent`
- `missing_app`
- `missing_sync_folder`
- `missing_os_permission`

These categories are UX-facing diagnostics. They are not replacements for raw technical logs.

## Current Product Surfaces

The current rollout expects four complementary admin surfaces:

- workspace integrations catalog
  - readiness legend, execution model, and tenant connection state
- integration detail
  - effective capability, scopes, validation, unsupported blocks
- agent integrations page
  - capability matrix plus connector entry points
- Nexus node detail
  - discovery, consent, effective local source, remediation hints

The same connector must read consistently across those surfaces.

## Tool Exposure Rules

### Effective Tools Only

Kairos must not receive a tool only because a Nexus node is online.

Tool exposure must be filtered by the runtime path actually available for that workspace run:

- node presence
- node mode
- discovery snapshot
- local consent and allowed actions
- workspace capability availability
- agent provisioning and policy when relevant

This means:

- local Nexus tools such as file search, document read, clipboard, mail, calendar, contacts, and terminal must shrink when the node discovery or consent model says they are not ready
- workspace-backed Nexus tools such as agent email send/draft must only appear when the underlying workspace capability is effective for the current agent

### Local Consent Contract

For local Nexus tools, `allowedActions` or the structured consent model must be treated as a real execution contract, not just dashboard telemetry.

If the node only consents to:

- `search`
- `read_document`

then Kairos must not see unrelated tools such as:

- `read_emails`
- `read_contacts`
- `read_clipboard`
- `terminal_*`

### Discovery Contract

The discovery snapshot is a readiness input.

If a provider is reported unavailable in the discovery snapshot, Kairos must not be offered the corresponding tool unless a workspace-backed runtime path explicitly replaces that local provider.

Example:

- a local node with `mail.available = false` must not expose `read_emails`
- an enterprise or docker node may still expose workspace-backed mail tools if the workspace path is effective

## Agent Email Execution Rules

### Canonical Email Path

When an agent has an effective email capability, the canonical send path is the agent email identity, not contact lookup and not generic mail-reader probing.

The runtime actions are:

- `send_email`
- `draft_email`

These actions must route through the workspace email path and preserve the selected agent identity.

### Direct Send Rule

If all of the following are true:

- the user gives a direct send instruction
- the recipient is already explicit
- the agent email capability is effective

then approval is implicit and Kairos should send immediately.

Canonical product rule:

- `direct send intent + explicit recipient + effective email capability => execute send_email immediately as the agent identity`

### Draft Rule

Kairos should prefer `draft_email` when:

- the user explicitly asks for a draft
- the user asks to review first
- the recipient is still missing
- runtime policy explicitly requires approval

### Contact Lookup Rule

If the recipient address is already explicit in the user request, Kairos must not call contacts lookup just to send the message.

## Connector Reality Table

Current expected truth:

- `Google Workspace`
  - readiness: `operational`
  - type: `hybrid`
- `Microsoft 365`
  - readiness: `partial`
  - type: `hybrid`
- `GitHub`
  - readiness: `operational`
  - type: `cloud-required`
- `Jira`
  - readiness: `operational`
  - type: `cloud-required`
- `Social Media`
  - readiness: `partial`
  - type: `cloud-required`
- `Slack`
  - readiness: `coming_soon`
  - type: `cloud-required`
- `Telegram`
  - readiness: `coming_soon`
  - type: `cloud-required`
- `Discord`
  - readiness: `coming_soon`
  - type: `cloud-required`
- `Notion`
  - readiness: `coming_soon`
  - type: `cloud-required`
- `Linear`
  - readiness: `coming_soon`
  - type: `cloud-required`
- `n8n`
  - readiness: `coming_soon`
  - type: `cloud-required`

## Customer Trust Model

The product must explain:

- what runs in Vutler cloud
- what runs on the customer PC through Nexus local
- what data leaves the customer PC
- what permissions are required and why
- when a cloud integration is unnecessary because Nexus local already covers the use case

## Acceptance Criteria

This model is considered implemented when:

- the catalog, detail pages, and agent UI use the same readiness vocabulary
- cloud connectors expose granted and validated scope semantics
- Nexus local exposes source/app/action/folder consent
- admins can identify why a capability is not effective without reading backend logs
- product and ops documentation use the same runtime vocabulary
