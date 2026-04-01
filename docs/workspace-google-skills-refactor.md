# Workspace / Google Skills Refactor

## Scope

This document captures the refactor that split generic integration skills into explicit workspace and Google surfaces.

The work covers:

- explicit adapters for internal workspace drive and Google integrations
- explicit skill manifest entries for `workspace_drive`, `google_drive`, and `google_calendar`
- `IntegrationHandler` remapping and logging
- seed/template alignment
- chat action run coverage for explicit skill execution
- agent configuration surface updates

## Why This Refactor Exists

The previous state mixed two different storage and scheduling surfaces behind generic integration names:

- internal workspace storage backed by the Vutler drive layer
- external Google Drive / Google Calendar integrations

That created ambiguity in three places:

- skill routing
- tool injection into the LLM
- template and UI configuration

The refactor makes provider choice explicit.

## New Provider Model

### Internal Workspace Surface

- `workspace_drive`
  - workspace-scoped internal file storage
  - backed by the Vutler drive layer / shared workspace storage
  - does not require Google OAuth

### Google Surfaces

- `google_drive`
  - read-oriented access to connected Google Drive
- `google_calendar`
  - event list/create/update/delete/free-busy on connected Google Calendar

## Adapter Split

New explicit adapters:

- [WorkspaceDriveAdapter.js](/Users/alopez/Devs/Vutler/services/skills/adapters/WorkspaceDriveAdapter.js)
- [GoogleDriveAdapter.js](/Users/alopez/Devs/Vutler/services/skills/adapters/GoogleDriveAdapter.js)
- [GoogleCalendarAdapter.js](/Users/alopez/Devs/Vutler/services/skills/adapters/GoogleCalendarAdapter.js)

The temporary compatibility wrappers were removed after the migration. Runtime imports now target the explicit adapters directly.

## IntegrationHandler Changes

Main routing logic lives in:

- [IntegrationHandler.js](/Users/alopez/Devs/Vutler/services/skills/handlers/IntegrationHandler.js)

Key changes:

- legacy `calendar` is remapped to `google_calendar`
- legacy `drive` is remapped to `workspace_drive`
- `workspace_drive` is treated as internally available without OAuth checks
- Google-backed providers continue to resolve through the Google token manager
- execution logs now consistently normalize provider labels to `workspace` or `google`

## Manifest Changes

Skill handler manifest:

- [skill-handlers.json](/Users/alopez/Devs/Vutler/seeds/skill-handlers.json)

Skill metadata catalogue:

- [agent-skills.json](/Users/alopez/Devs/Vutler/seeds/agent-skills.json)

### Added Workspace Drive Skills

- `workspace_drive_list`
- `workspace_drive_search`
- `workspace_drive_read`
- `workspace_drive_write`

### Added Google Drive Skills

- `google_drive_list`
- `google_drive_search`
- `google_drive_read`

### Added Google Calendar Skills

- `google_calendar_list`
- `google_calendar_create`
- `google_calendar_update`
- `google_calendar_delete`
- `google_calendar_check_availability`

### Existing Generic Calendar Skills

Legacy generic calendar skill keys still exist in the manifest:

- `calendar_management`
- `availability_matching`
- `reminder_sending`
- `rescheduling`
- `appointment_scheduling`

Their providers now resolve to `google_calendar`.

This keeps old skills functioning while new templates and tests use the explicit skill family.

## Template Seed Alignment

Updated templates live in:

- [agent-templates.json](/Users/alopez/Devs/Vutler/seeds/agent-templates.json)

Templates migrated to explicit surfaces include:

- document and knowledge-heavy roles
  - `workspace_drive_*`
- scheduling-heavy roles
  - `google_calendar_*`
- mixed operational roles
  - both `workspace_drive_*` and `google_calendar_*`

The `tools` arrays for migrated templates were also aligned:

- `workspace_drive`
- `google_drive`
- `google_calendar`

instead of older generic labels such as `file_access` or `calendar` for those templates.

## Agent API and Config Surface

Backend agent capability validation:

- [agents.js](/Users/alopez/Devs/Vutler/api/agents.js)

`TOOL_KEYS` now treats these as tools, not skills:

- `workspace_drive`
- `google_drive`
- `google_calendar`

Frontend create flow:

- [new/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/new/page.tsx)

Frontend config flow:

- [config/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/[id]/config/page.tsx)

The config UI now exposes a `Tools` section using:

- `workspace_drive`
- `google_drive`
- `google_calendar`
- `network_access`
- `code_execution`
- `web_search`
- `tool_use`

## Marketplace Template Sync

Template syncing logic lives in:

- [loadTemplates.js](/Users/alopez/Devs/Vutler/seeds/loadTemplates.js)

The old behavior was effectively insert-only.

The new behavior is:

- update existing rows by template name
- insert missing rows

Manual sync entrypoint:

- [sync-marketplace-templates.js](/Users/alopez/Devs/Vutler/scripts/sync-marketplace-templates.js)

Run:

```bash
node /Users/alopez/Devs/Vutler/scripts/sync-marketplace-templates.js
```

Use this after changing:

- template skill lists
- template tools
- template descriptions
- template prompts

## Test Coverage Added

Registry / manifest:

- [skill-registry.manifest.test.js](/Users/alopez/Devs/Vutler/tests/skills/skill-registry.manifest.test.js)

Integration routing:

- [integration-handler.test.js](/Users/alopez/Devs/Vutler/tests/skills/integration-handler.test.js)

Manifest-backed tool injection:

- [llm-router.skill-manifest-injection.test.js](/Users/alopez/Devs/Vutler/tests/llm-router.skill-manifest-injection.test.js)

Explicit chat action run coverage:

- [llm-router.workspace-drive-action-run.test.js](/Users/alopez/Devs/Vutler/tests/llm-router.workspace-drive-action-run.test.js)
- [llm-router.google-drive-action-run.test.js](/Users/alopez/Devs/Vutler/tests/llm-router.google-drive-action-run.test.js)
- [llm-router.google-calendar-action-run.test.js](/Users/alopez/Devs/Vutler/tests/llm-router.google-calendar-action-run.test.js)
- [llm-router.google-calendar-update-action-run.test.js](/Users/alopez/Devs/Vutler/tests/llm-router.google-calendar-update-action-run.test.js)

## Validation Commands

Targeted Jest coverage used during the refactor:

```bash
npx jest tests/skills/integration-handler.test.js \
  tests/skills/skill-registry.manifest.test.js \
  tests/llm-router.skill-manifest-injection.test.js \
  tests/llm-router.workspace-drive-action-run.test.js \
  tests/llm-router.google-drive-action-run.test.js \
  tests/llm-router.google-calendar-action-run.test.js \
  tests/llm-router.google-calendar-update-action-run.test.js \
  --runInBand
```

Template sync:

```bash
node /Users/alopez/Devs/Vutler/scripts/sync-marketplace-templates.js
```

Frontend type check:

```bash
cd /Users/alopez/Devs/Vutler/frontend
npx tsc --noEmit
```

## Current Known Issue

Frontend `tsc` currently stops on an existing dependency/type resolution issue:

- [page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/email/page.tsx:3)

Error:

- `TS2307: Cannot find module 'dompurify' or its corresponding type declarations.`

This issue is outside the workspace/google skills refactor itself, but it blocks a clean full frontend typecheck.

## Operational Summary

After this refactor:

- internal workspace file operations should use `workspace_drive_*`
- Google Drive operations should use `google_drive_*`
- Google Calendar operations should use `google_calendar_*`
- migrated templates should expose explicit tool labels
- persisted marketplace templates should be resynced after seed changes

The main rule is simple:

- if the action is internal and workspace-scoped, use `workspace_*`
- if the action depends on Google OAuth and Google APIs, use `google_*`
