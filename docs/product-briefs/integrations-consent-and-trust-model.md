# Integrations Consent And Trust Model

## Goal

Explain to customers how Vutler accesses third-party tools and local applications, and why some cloud integrations become unnecessary when Nexus local is deployed.

## 1. Two Execution Planes

Vutler operates through two planes:

- Vutler cloud
  - Workspace integrations connected through APIs and OAuth.
- Nexus local
  - A local runtime on the customer machine that can use local files, local apps, and OS-backed data sources with explicit consent.

## 2. Why This Matters

Not every integration needs a dedicated cloud connector.

If the customer uses Nexus local:

- synced cloud folders may already be available locally
- desktop mail/calendar/contacts may already be usable locally
- document analysis may run directly on local files

This reduces unnecessary cloud consent while keeping the agent useful.

## 3. Consent Layers

### Cloud Consent

For cloud connectors, Vutler uses:

- a Vutler pre-consent screen
- the provider consent page
- a validation step after connection

This means a connector may be connected but still partially usable.

### Local Consent

For Nexus local, Vutler asks for:

- source-level consent
- app-level consent
- action-level consent
- folder-level consent where needed

OS permissions still apply separately.

Examples:

- Vutler consent may allow `Mail`
- the customer may still need to approve macOS or Windows access to Mail data
- until both are true, the local path is not effective

## 4. What Runs Where

### In Vutler Cloud

Typical cloud tasks:

- server-side connector actions
- workspace-wide automation
- background execution when the client PC is off
- multi-user integration workflows

### On The Customer PC

Typical local tasks:

- local file search
- desktop app access
- synced drive access
- local document parsing
- app launch and local context gathering

## 5. Local-First vs Cloud-Required

### Local-First

Typical local-first cases:

- synced Google Drive, OneDrive, or Dropbox folders already present on the PC
- desktop mail, calendar, and contacts
- document parsing on local files

In these cases, Nexus Local can reduce or avoid extra cloud connector consent.

### Cloud-Required

Typical cloud-required cases:

- GitHub
- Jira
- Slack
- Teams
- Notion
- server-side automations that must keep running when the PC is offline

In these cases, a workspace cloud connector still remains necessary.

## 6. Customer-Facing Rules

- Vutler should not ask for a cloud connector if Nexus local already covers the core use case.
- Vutler should clearly show when a connector is cloud-required.
- Vutler should explain why a permission is needed before requesting it.
- Vutler should distinguish between product consent and operating system permissions.

## 7. What The Customer Should Expect In Product

The product should make these things visible:

- whether a connector is `operational`, `partial`, or `coming soon`
- whether a connector is `local-first` or `cloud-required`
- whether a connector is merely connected or actually effective
- why a local capability is blocked:
  - consent denied
  - missing app
  - missing sync folder
  - OS permission still needed

This is important because “connected” does not automatically mean “usable now”.

## 8. Trust Outcomes

The intended customer outcome is:

- fewer unnecessary permissions
- clearer understanding of what the agent can actually use
- easier auditability for IT and security teams
- predictable separation between cloud execution and local execution
