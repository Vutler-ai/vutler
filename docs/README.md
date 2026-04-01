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

- [Browser Operator / Synthetic User Agent V1](product-briefs/browser-operator-synthetic-user-agent-v1.md) defines the browser-based testing, review, and synthetic user capability across cloud, governed enterprise, and Nexus-local modes.
- [Browser Operator Runtime V1](specs/browser-operator-runtime-v1.md) defines the execution model, session isolation, credentials, evidence pack, and cloud vs Nexus-local runtime split.
- [Browser Operator Action Catalog V1](specs/browser-operator-action-catalog-v1.md) defines the bounded browser action surface, risk levels, and governance defaults.
- [Browser Operator Implementation V1](specs/browser-operator-implementation-v1.md) translates the browser operator into concrete APIs, tables, services, storage, and rollout chunks.
- [Nexus Enterprise Deployable Agents](product-briefs/nexus-enterprise-deployable-agents.md) defines the generic product model for all agent profiles deployable on enterprise nodes.
- [Nexus Enterprise Deployable Agent Profile V1](specs/nexus-enterprise-deployable-agent-profile-v1.md) defines the technical contract for profile-based deployment, capability composition, and runtime invariants.
- [Nexus Enterprise Agent Level Capability Matrix V1](specs/nexus-enterprise-agent-level-capability-matrix-v1.md) defines how agent levels bound capabilities, tools, wizard choices, and policy defaults.
- [Nexus Enterprise Deployable Agents Implementation V1](specs/nexus-enterprise-deployable-agents-implementation-v1.md) translates the profile model into registry tables, APIs, wizard flow, runtime validation, and rollout phases.
- [Nexus Enterprise Registry Schema + Seed Pack V1](specs/nexus-enterprise-registry-schema-seed-pack-v1.md) defines the seeded registry payloads, versioning rules, and the first platform-managed profile pack.
- [Nexus Enterprise Backend Rollout Plan V1](specs/nexus-enterprise-backend-rollout-plan-v1.md) maps the implementation rollout onto the current repo files, phases, and compatibility constraints.
- [Nexus Enterprise Virtual Employee](product-briefs/nexus-enterprise-virtual-employee.md) captures the AV Manager use case for Nexus enterprise nodes, governance, and policy lanes.
- [Nexus Enterprise Event Ingestion V1](specs/nexus-enterprise-event-ingestion-v1.md) defines the webhook-driven ingestion surface for enterprise nodes and client-side automation.
- [Nexus Enterprise Seat Accounting + Helper Agent Registry V1](specs/nexus-enterprise-seat-accounting-helper-agents-v1.md) defines how seats are consumed by principal and helper agents, and how local integrations stay outside seat accounting.
- [Nexus Enterprise Policy Engine + AV Action Catalog V1](specs/nexus-enterprise-policy-engine-av-action-catalog-v1.md) defines how enterprise actions are bounded, evaluated, approved, and dispatched.
- [Nexus Enterprise Governance + Approvals V1](specs/nexus-enterprise-governance-approvals-v1.md) documents approval requests, process-scoped grants, audit events, approval email, and the explicit `full_access` bypass mode.
- `docs/nexus/` covers Nexus install, deployment, and security.
- `docs/specs/` contains feature-specific implementation specs, including agent wizard limits and mobile dispatch plans.
- `docs/planning-artifacts/` contains product and architecture planning inputs.

## Recent updates

- [March 2026 release snapshot](recent-2026-03.md) summarizes the last 20–30 commits, highlights drive/billing/session work, and notes documentation cleanup.
- [Late March 2026 snapshot](recent-2026-04.md) lists the ten newest commits (avatars, docs, auth + billing wiring, Nexus/Sandbox fixes) so the “latest” perspective stays recorded.
