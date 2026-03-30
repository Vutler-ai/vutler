# Documentation

## Operations

- [Chat and Task Orchestration Hardening](chat-orchestration-hardening.md) explains the production hardening shipped for chat, tasks, Snipara, and realtime delivery.
- [Staging Deploy and Validation Runbook](runbooks/staging-deploy-validation.md) is the operational path for migrations, deploy, smoke, and e2e checks on the Vutler staging VPS.
- [VUTLER_API_KEY Rotation Runbook](runbooks/vutler-api-key-rotation.md) covers runtime API key rotation without breaking smoke validation.
- [Workspace / Google Skills Refactor](workspace-google-skills-refactor.md) documents the explicit `workspace_drive`, `google_drive`, and `google_calendar` skill split, template sync, and validation coverage.

## Orchestrator Notes

- [Orchestrator Anti-Double-Run](orchestrator-anti-double-run.md) documents the generic MVP anti-double-run design.
- [Orchestrator Implementation Plan](orchestrator-implementation-plan.md) is the earlier planning note for that MVP.

## Other Existing Areas

- `docs/nexus/` covers Nexus install, deployment, and security.
- `docs/specs/` contains feature-specific implementation specs.
- `docs/planning-artifacts/` contains product and architecture planning inputs.
