# Documentation

## Operations

- [Chat and Task Orchestration Hardening](chat-orchestration-hardening.md) explains the production hardening shipped for chat, tasks, Snipara, and realtime delivery.
- [Staging Deploy and Validation Runbook](runbooks/staging-deploy-validation.md) is the operational path for migrations, deploy, smoke, and e2e checks on the Vutler staging VPS.
- [VUTLER_API_KEY Rotation Runbook](runbooks/vutler-api-key-rotation.md) covers runtime API key rotation without breaking smoke validation.
- [Workspace / Google Skills Refactor](workspace-google-skills-refactor.md) documents the explicit `workspace_drive`, `google_drive`, and `google_calendar` skill split, template sync, and validation coverage.

## Orchestrator Notes

- [Orchestrator Anti-Double-Run](orchestrator-anti-double-run.md) documents the generic MVP anti-double-run design.
- [Orchestrator Implementation Plan](orchestrator-implementation-plan.md) is the earlier planning note for that MVP.

## Product & Architecture notes

- [Nexus Enterprise Virtual Employee](product-briefs/nexus-enterprise-virtual-employee.md) captures the AV Manager use case for Nexus enterprise nodes, governance, and policy lanes.
- [Nexus Enterprise Event Ingestion V1](specs/nexus-enterprise-event-ingestion-v1.md) defines the webhook-driven ingestion surface for enterprise nodes and client-side automation.
- [Nexus Enterprise Seat Accounting + Helper Agent Registry V1](specs/nexus-enterprise-seat-accounting-helper-agents-v1.md) defines how seats are consumed by principal and helper agents, and how local integrations stay outside seat accounting.
- `docs/nexus/` covers Nexus install, deployment, and security.
- `docs/specs/` contains feature-specific implementation specs, including agent wizard limits and mobile dispatch plans.
- `docs/planning-artifacts/` contains product and architecture planning inputs.

## Recent updates

- [March 2026 release snapshot](recent-2026-03.md) summarizes the last 20–30 commits, highlights drive/billing/session work, and notes documentation cleanup.
