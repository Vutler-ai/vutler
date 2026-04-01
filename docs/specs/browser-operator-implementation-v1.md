# Browser Operator Implementation V1

> **Status:** Draft — 2026-04-01
> **Type:** Implementation Spec
> **Owner:** Codex
> **Scope:** Cloud-first browser runs, evidence collection, governance hooks, future Nexus-local compatibility

---

## 1. Purpose

Cette spec traduit le `Browser Operator / Synthetic User Agent` en objets implementables dans Vutler.

Objectif V1:
- lancer des runs browser en cloud
- executer un catalogue borne d'actions
- stocker les preuves
- produire un rapport
- garder un modele compatible avec:
  - governance enterprise
  - runtime Nexus local plus tard

---

## 2. Implementation Strategy

Le bon ordre est:

1. **Cloud-first runtime**
2. **Evidence pack**
3. **Flow catalog**
4. **Governance-compatible payloads**
5. **Enterprise hardening**
6. **Nexus-local runtime**

V1 ne doit pas commencer par le mode local enterprise.

---

## 3. Target Repo Shape

### Backend

- `api/browser-operator.js`
- `services/browserOperator/`

Suggested service split:

- `services/browserOperator/runService.js`
- `services/browserOperator/flowService.js`
- `services/browserOperator/sessionService.js`
- `services/browserOperator/credentialService.js`
- `services/browserOperator/evidenceService.js`
- `services/browserOperator/reportService.js`
- `services/browserOperator/governanceService.js`

### Seeds

- `seeds/browser-operator/flows/`
- `seeds/browser-operator/profiles/`
- `seeds/browser-operator/action-catalogs/`

### Frontend

- `frontend/src/lib/api/endpoints/browser-operator.ts`
- later:
  - `frontend/src/app/(app)/browser-operator/page.tsx`
  - or integrate into agent/task/product testing UI

### Nexus Later

- `packages/nexus/lib/browser-runtime.js`
- `packages/nexus/lib/browser-session-manager.js`

---

## 4. Data Model

V1 needs four main persistence objects.

### 4.1 `browser_operator_runs`

But:
- represent one browser execution

Suggested columns:

```sql
id uuid primary key
workspace_id uuid not null
requested_by_user_id uuid null
runtime_mode text not null
profile_key text not null
status text not null
target jsonb not null
flow_key text null
governance jsonb not null default '{}'::jsonb
summary jsonb not null default '{}'::jsonb
started_at timestamptz null
completed_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.2 `browser_operator_run_steps`

But:
- store step-by-step execution trace

Suggested columns:

```sql
id uuid primary key
run_id uuid not null
step_index integer not null
action_key text not null
status text not null
input jsonb not null
output jsonb null
error jsonb null
started_at timestamptz null
completed_at timestamptz null
created_at timestamptz not null
```

### 4.3 `browser_operator_evidence`

But:
- reference screenshots, DOM snapshots, logs, reports

Suggested columns:

```sql
id uuid primary key
run_id uuid not null
step_id uuid null
artifact_kind text not null
storage_key text not null
mime_type text null
metadata jsonb not null default '{}'::jsonb
created_at timestamptz not null
```

### 4.4 `browser_operator_credentials`

But:
- store browser-target credential references

V1 can start thin:
- metadata in DB
- actual secret material in vault or encrypted config

Suggested columns:

```sql
id uuid primary key
workspace_id uuid not null
app_key text not null
credential_key text not null
credential_type text not null
status text not null default 'active'
metadata jsonb not null default '{}'::jsonb
created_at timestamptz not null
updated_at timestamptz not null
```

---

## 5. Run Lifecycle

```text
Create run
-> validate profile / target / flow
-> resolve governance defaults
-> create browser session
-> execute steps
-> collect evidence
-> build report
-> store summary
-> complete run
```

---

## 6. API Surface

### 6.1 Catalog / Config Read

```text
GET /api/v1/browser-operator/profiles
GET /api/v1/browser-operator/profiles/:profileKey
GET /api/v1/browser-operator/flows
GET /api/v1/browser-operator/flows/:flowKey
GET /api/v1/browser-operator/action-catalog
```

### 6.2 Run APIs

```text
POST /api/v1/browser-operator/runs
GET  /api/v1/browser-operator/runs
GET  /api/v1/browser-operator/runs/:runId
GET  /api/v1/browser-operator/runs/:runId/steps
GET  /api/v1/browser-operator/runs/:runId/evidence
GET  /api/v1/browser-operator/runs/:runId/report
POST /api/v1/browser-operator/runs/:runId/cancel
```

### 6.3 Credentials APIs

```text
GET  /api/v1/browser-operator/credentials
POST /api/v1/browser-operator/credentials
POST /api/v1/browser-operator/credentials/:id/rotate
POST /api/v1/browser-operator/credentials/:id/test
```

### 6.4 Future Governance APIs

If the Browser Operator is later connected to Nexus governance:

```text
POST /api/v1/browser-operator/runs/:runId/approve
POST /api/v1/browser-operator/runs/:runId/reject
GET  /api/v1/browser-operator/runs/:runId/audit
```

---

## 7. Create Run Contract

Example payload:

```json
{
  "runtimeMode": "cloud-browser",
  "profileKey": "synthetic_user_qa",
  "target": {
    "appKey": "client_portal",
    "baseUrl": "https://app.example.com"
  },
  "flowKey": "signup_onboarding_v1",
  "credentialsRef": "vault://workspace/client_portal/test_user",
  "governance": {
    "mode": "standard",
    "approvalScopeKey": "client-portal-onboarding-nightly"
  },
  "reportFormat": "full"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "run": {
      "id": "uuid",
      "status": "queued",
      "runtimeMode": "cloud-browser"
    }
  }
}
```

---

## 8. Internal Service Contracts

### `runService.createRun(input)`

Responsibilities:
- validate payload
- create DB row
- queue execution

### `runService.executeRun(runId)`

Responsibilities:
- load run context
- resolve flow
- open session
- execute actions
- persist evidence
- finalize report

### `flowService.resolveFlow(flowKey)`

Responsibilities:
- load seeded flow
- validate actions against catalog

### `credentialService.resolveCredentials(credentialsRef)`

Responsibilities:
- fetch secret material
- redact outputs

### `evidenceService.persistArtifact(runId, artifact)`

Responsibilities:
- upload to storage
- create DB reference

### `reportService.buildFinalReport(runId)`

Responsibilities:
- summarize run
- generate markdown + JSON

---

## 9. Session Model

V1 should support:

- `ephemeral`
- `named`

Minimum payload fields:

```json
{
  "sessionMode": "ephemeral",
  "browserProfile": "default"
}
```

Cloud-first V1 recommendation:
- always start with `ephemeral`
- add `named` later only if there is a concrete use case

---

## 10. Storage Strategy

### Database

Store:
- runs
- step logs
- evidence references
- summaries

### Object Storage

Store:
- screenshots
- DOM snapshots
- trace files
- reports

Recommended path shape:

```text
browser-operator/{workspace_id}/{run_id}/
```

Artifacts:

```text
summary.json
steps.json
report.md
screenshots/step-001.png
dom/step-001.json
logs/console.json
logs/network.json
```

---

## 11. Governance Compatibility

Even if V1 is cloud-first, the payload and persistence must already support:

- `governance.mode`
- `approvalScopeKey`
- `approvalScopeMode`
- `full_access`
- `allowedDomains`
- `blockedDomains`

That prevents a rewrite when connecting Browser Operator to enterprise policy later.

---

## 12. Security Requirements

Minimum V1 requirements:

- credentials outside prompt
- secret redaction in logs and reports
- domain allowlist support
- browser session cleanup after run
- artifact access scoped by workspace
- no raw cookie dump in final evidence pack

---

## 13. Chunked Rollout

### Chunk A: Catalog + Flow Registry

Deliver:
- action catalog seeds
- flow seeds
- read APIs

### Chunk B: Run Persistence

Deliver:
- `browser_operator_runs`
- `browser_operator_run_steps`
- run create/list/detail APIs

### Chunk C: Cloud Execution MVP

Deliver:
- cloud browser session
- open / click / fill / assert / screenshot
- report generation

### Chunk D: Credentials + Auth

Deliver:
- credential refs
- login/signup flows
- redaction

### Chunk E: Governance Compatibility

Deliver:
- governance payload
- process scope fields
- approval-ready run metadata

### Chunk F: Nexus-local Runtime

Deliver:
- local browser runtime
- same action catalog
- same evidence contract

---

## 14. Recommended First Profiles

- `app_reviewer`
- `synthetic_user_qa`

Maybe later:
- `enterprise_browser_reviewer`
- `internal_portal_monitor`

---

## 15. Definition of Done

V1 is good if:

- a user can create a browser run from the API
- the cloud runtime can execute a seeded flow
- screenshots and a report are stored
- credentials are resolved without leaking into prompts/logs
- the payload already carries governance-compatible fields
- the design remains compatible with future Nexus-local execution
