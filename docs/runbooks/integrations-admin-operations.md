# Integrations Admin Operations

## Purpose

This runbook explains how a workspace admin or ops engineer should:

- connect a cloud integration
- validate whether it is actually effective
- understand when Nexus local replaces a cloud connector
- diagnose degraded or blocked integration states

## 1. Readiness Vocabulary

Use these terms consistently:

- `operational`
- `partial`
- `coming_soon`
- `workspace_available`
- `agent_allowed`
- `provisioned`
- `effective`

`effective` is the only state that means the capability is usable right now.

## 2. Cloud Connector Setup Flow

### Standard Flow

1. Open the integrations catalog.
2. Confirm the connector readiness.
3. Read the Vutler pre-consent summary.
4. Complete provider consent.
5. Wait for post-connect validation.
6. Open the connector detail page and verify validated scopes.

### Expected Outcomes

- `connected`
  - Tokens exist, but the provider may still be partially usable.
- `degraded`
  - The connector exists, but one or more validated capabilities are missing.
- `failed`
  - The runtime path is not currently usable.

### What To Check On The Detail Page

After a cloud connector is connected, the detail page should confirm:

- requested scopes
- granted scopes
- validated scopes
- unsupported capability blocks
- effective runtime reason

If a connector is `connected` but not `effective`, treat it as not production-ready for agents.

## 3. Nexus Local Setup Flow

1. Deploy or pair the Nexus node.
2. Run discovery.
3. Review detected apps, synced folders, and local providers.
4. Apply consent by source, app, action, and folder.
5. Validate node detail status.
6. Check whether the target agent sees the capability as `effective`.

### Nexus Diagnostic Categories

The Nexus node detail should classify blockers into:

- `needs_discovery`
- `denied_consent`
- `missing_app`
- `missing_sync_folder`
- `missing_os_permission`

Use these categories for triage before escalating.

## 4. Decision Rules

### When To Prefer Nexus Local

Prefer Nexus local when:

- files are already synced onto the customer PC
- desktop mail/calendar/contacts are the primary source
- the use case depends on local apps or local files
- the client wants minimal external SaaS consent

### When To Require Cloud Connectors

Require cloud connectors when:

- the workflow must continue while the client PC is offline
- the use case depends on remote APIs such as Slack, Teams, GitHub, HubSpot, Salesforce, or Notion
- the capability is multi-user and server-side by nature

## 5. Degraded State Triage

### Cloud

Check in this order:

1. connector readiness in the catalog
2. provider consent completion
3. post-connect validation result
4. actual granted scopes
5. unsupported capability promises in the UI

### Nexus Local

Check in this order:

1. latest discovery snapshot
2. source/app/action consent
3. OS permissions
4. synced folder visibility
5. agent policy allowance

Typical interpretation:

- `denied_consent`
  - fix in Nexus Local consent
- `missing_app`
  - install or open the compatible desktop app
- `missing_sync_folder`
  - allow folders or enable a synced drive on the client PC
- `missing_os_permission`
  - review macOS / Windows permission prompts, then rerun discovery

## 6. Escalation Evidence

Before escalating, collect:

- connector name
- workspace id
- agent id if applicable
- readiness state
- capability matrix state
- validated scopes or missing scopes
- discovery snapshot time for Nexus local
- missing OS permission or missing app if local

## 7. Known Current Production Pattern

Current production reality expects:

- cloud deploys and audits on Vutler host
  - `83.228.222.180`
- DB owner normalization on Vaultbrix/Supabase host
  - `84.234.19.42`

This split matters when deploy audit says schema owners are mixed.

## 8. Post-Deploy Validation

After integration-related deploys:

1. run smoke tests
2. run `production-state-audit.sh --strict`
3. confirm live API, worker, and frontend revisions match
4. confirm `owner_count=1`

If the audit fails only on owners, use [database-owner-normalization.md](/Users/alopez/Devs/Vutler/docs/runbooks/database-owner-normalization.md).

## 9. Agent-Side Validation

Before declaring an integration rollout complete for a customer workspace:

1. open the agent integrations page
2. confirm the capability matrix state
3. confirm at least one relevant connector is `effective`
4. record the blocking reason if the connector is still unavailable

Admin rule:

- a workspace connector alone is not enough
- the target agent must also resolve to `effective`
