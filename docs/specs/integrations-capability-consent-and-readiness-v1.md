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

### Agent Integration UI

The agent view must show:

- workspace availability
- agent policy allowance
- provisioning state
- effective state

It should answer:

- “Can this agent use it now?”
- “If not, what is missing?”

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
