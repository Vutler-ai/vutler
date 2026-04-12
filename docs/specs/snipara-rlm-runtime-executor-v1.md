# Snipara RLM Runtime Executor V1
> **Type:** Technical Spec
> **Status:** Implemented
> **Date:** 2026-04-11

## Goal

Add a bounded `RLM Runtime` integration for technical autonomy without replacing Vutler's runtime authority.

This slice covers:
- an optional `RLM Runtime` backend inside the existing sandbox executor
- Python-only execution for eligible technical agents
- workspace-level enablement and default backend selection
- agent-level backend preference through governance
- automatic fallback to the native Vutler sandbox when `RLM Runtime` is disabled or unavailable

It does not cover:
- making `RLM Runtime` the default executor
- JavaScript execution through `RLM Runtime`
- moving orchestration state, approvals, or audit out of Vutler

## Product Rule

Vutler still owns:
- orchestration decisions
- approvals
- task/run source of truth
- user-facing audit

`RLM Runtime` only replaces the inner code-execution backend for a narrow class of technical sandbox actions.

## Implementation

Files:
- [services/executors/rlmRuntimeExecutor.js](/Users/alopez/Devs/Vutler/services/executors/rlmRuntimeExecutor.js:1)
- [services/executors/rlmRuntimePolicy.js](/Users/alopez/Devs/Vutler/services/executors/rlmRuntimePolicy.js:1)
- [services/executors/sandboxExecutor.js](/Users/alopez/Devs/Vutler/services/executors/sandboxExecutor.js:1)
- [services/sandbox.js](/Users/alopez/Devs/Vutler/services/sandbox.js:1)
- [services/agentAccessPolicyService.js](/Users/alopez/Devs/Vutler/services/agentAccessPolicyService.js:175)
- [api/settings.js](/Users/alopez/Devs/Vutler/api/settings.js:1)
- [frontend/src/app/(app)/settings/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/settings/page.tsx:1)
- [frontend/src/app/(app)/agents/[id]/config/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/[id]/config/page.tsx:1)
- [frontend/src/app/(app)/sandbox/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/sandbox/page.tsx:1)
- [tests/sandbox-executor.test.js](/Users/alopez/Devs/Vutler/tests/sandbox-executor.test.js:1)
- [tests/rlm-runtime-policy.test.js](/Users/alopez/Devs/Vutler/tests/rlm-runtime-policy.test.js:1)

Behavior:
- disabled unless `RLM_RUNTIME_ENABLED=true`
- only considered for Python sandbox executions
- only considered for technical/security/qa/devops/engineering-style agents
- workspace must explicitly enable `rlm_runtime_policy`
- workspace may allow RLM Runtime without making it the default backend
- each agent may set `governance.sandbox_backend` to `inherit`, `native`, or `rlm`
- executes `rlm run --env <env> <code>`
- if the binary is missing or execution errors before completion, Vutler falls back to `executeInSandbox()`
- subprocesses receive `VUTLER_WORKSPACE_ID` and `VUTLER_AGENT_ID` for traceability
- orchestrated executions now persist backend telemetry in `sandbox_jobs.metadata`
  - `backend_selected`
  - `backend_effective`
  - `used_fallback`
  - `fallback_from`
  - `fallback_reason`
- sandbox operator history exposes this telemetry, and orchestration/tool payloads now carry the same backend/fallback summary
- aggregate sandbox analytics are exposed per workspace:
  - `RLM` attempts vs effective executions
  - native effective executions
  - fallback count and fallback rate
  - top fallback reasons
  - operator status `healthy | degraded | critical`
- workspace-scoped critical runtime alerts are now emitted through Vutler notifications with a cooldown guard
- when a workspace `notification_email` is configured, the same critical alert is also delivered through Postal email
- operators can disable these alerts per workspace with the `sandbox_alert` notification setting

Binary resolution order:
1. `RLM_RUNTIME_BIN`
2. `/home/ubuntu/rlm-venv/bin/rlm`
3. `/Users/lopez/.openclaw/workspace/.venvs/rlm-runtime/bin/rlm`
4. `rlm` from `PATH`

Config:
- `RLM_RUNTIME_ENABLED`
- `RLM_RUNTIME_BIN`
- `RLM_RUNTIME_ENV` default `docker`
- `RLM_RUNTIME_TIMEOUT_BUFFER_MS`
- `RLM_RUNTIME_ALLOW_UNKNOWN_AGENT` for exceptional local testing only
- workspace setting `rlm_runtime_policy`
  - `enabled: boolean`
  - `default_backend: native | rlm`
  - optional `runtime_env`
- agent governance `sandbox_backend`
  - `inherit`
  - `native`
  - `rlm`

## Multitenant Rule

`RLM Runtime` is no longer treated as an environment-global behavior.

It is allowed only when all of the following are true:
- runtime feature flag is enabled on the host
- the workspace explicitly enables `rlm_runtime_policy`
- the execution is a Python sandbox run
- the agent is technically eligible for sandbox usage
- the agent inherits a workspace default of `rlm` or explicitly forces `rlm`

This keeps backend selection inside Vutler's tenant policy boundary instead of making one VPS-level flag affect every workspace.

## Validation

Validated locally on 2026-04-11:
- `npx jest tests/sandbox-executor.test.js tests/rlm-runtime-policy.test.js --runInBand`
- `npx jest tests/sandbox-executor.test.js tests/sandbox.service.test.js --runInBand`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/app/\(app\)/settings/page.tsx src/app/\(app\)/agents/\[id\]/config/page.tsx src/lib/api/types.ts`

## Remaining Follow-Ups

- decide whether JavaScript support should stay on native sandbox only
- add realtime fan-out for workspace-wide sandbox critical alerts if operators need stronger immediate paging semantics
- verify the VPS `rlm` binary and env config before enabling in production
